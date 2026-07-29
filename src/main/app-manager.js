import { createHash, createPublicKey, verify } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import extract from "extract-zip";
import semver from "semver";
import { LauncherError } from "./errors.js";
import {
  hashDirectory,
  loadJsonSchema,
  validateManifest,
} from "./manifest-validator.js";
import { ensurePrivateDirectory, readJsonFile } from "./storage.js";

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const handle = await readFile(filePath);
  hash.update(handle);
  return hash.digest("hex");
}

function verifyPackageSignature(app, publicKeyBase64) {
  if (
    typeof publicKeyBase64 !== "string" ||
    publicKeyBase64.startsWith("[") ||
    publicKeyBase64.length < 40
  ) {
    throw new LauncherError("PACKAGE_KEY_NOT_CONFIGURED", "La clave pública de paquetes no está configurada.");
  }
  let key;
  try {
    key = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch (error) {
    throw new LauncherError("PACKAGE_KEY_INVALID", "La clave pública de paquetes no es válida.", { cause: error });
  }
  const payload = `${app.id}:${app.version}:${app.sha256}`;
  const valid = verify(null, Buffer.from(payload, "utf8"), key, Buffer.from(app.signature, "base64"));
  if (!valid) throw new LauncherError("PACKAGE_SIGNATURE_INVALID", "La firma del paquete no es válida.");
}

async function downloadPackage(url, outputPath, options) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new LauncherError("PACKAGE_URL_INVALID", "Los paquetes remotos deben usar HTTPS.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new LauncherError("PACKAGE_DOWNLOAD_FAILED", `La descarga respondió con estado ${response.status}.`);
    }
    if (new URL(response.url).protocol !== "https:") {
      throw new LauncherError("PACKAGE_URL_INVALID", "La descarga redirigió a un protocolo no permitido.");
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > options.maximumBytes) {
      throw new LauncherError("PACKAGE_TOO_LARGE", "El paquete supera el tamaño permitido.");
    }
    let received = 0;
    const limiter = new TransformStream({
      transform(chunk, transformController) {
        received += chunk.byteLength;
        if (received > options.maximumBytes) {
          transformController.error(new LauncherError("PACKAGE_TOO_LARGE", "El paquete supera el tamaño permitido."));
          return;
        }
        transformController.enqueue(chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(limiter)),
      createWriteStream(outputPath, { mode: 0o600 }),
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new LauncherError("PACKAGE_TIMEOUT", "La descarga agotó el tiempo de espera.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function findManifestRoot(extractedPath) {
  const direct = path.join(extractedPath, "app.manifest.json");
  if (await stat(direct).then((details) => details.isFile()).catch(() => false)) return extractedPath;
  const entries = await readdir(extractedPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || entries.some((entry) => !entry.isDirectory())) {
    throw new LauncherError("PACKAGE_LAYOUT_INVALID", "El paquete debe contener la aplicación en su raíz.");
  }
  const nested = path.join(extractedPath, directories[0].name);
  if (await stat(path.join(nested, "app.manifest.json")).then((details) => details.isFile()).catch(() => false)) {
    return nested;
  }
  throw new LauncherError("PACKAGE_LAYOUT_INVALID", "No se encontró app.manifest.json.");
}

export class AppManager {
  constructor(options) {
    this.userDataPath = options.userDataPath;
    this.rootPath = options.rootPath;
    this.registry = options.registry;
    this.launcherVersion = options.launcherVersion;
    this.packagePublicKey = options.packagePublicKey;
    this.maximumDownloadBytes = options.maximumDownloadBytes;
    this.logger = options.logger;
    this.externalApps = options.externalApps;
    this.installedRoot = path.join(this.userDataPath, "installed-apps");
    this.schema = null;
  }

  async initialize() {
    await ensurePrivateDirectory(this.installedRoot);
    this.schema = await loadJsonSchema(path.join(this.rootPath, "registry", "app-manifest.schema.json"));
  }

  appInstallRoot(appId) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(appId)) {
      throw new LauncherError("APP_ID_INVALID", "El identificador de aplicación no es válido.");
    }
    return path.join(this.installedRoot, appId);
  }

  async getInstalled(appId) {
    const installPath = path.join(this.appInstallRoot(appId), "current");
    const manifest = await readJsonFile(path.join(installPath, "app.manifest.json"), null);
    if (!manifest) return null;
    return { installPath, manifest };
  }

  async getApps() {
    const output = [];
    for (const catalogApp of this.registry.getCatalog()) {
      if (catalogApp.availability === "external") {
        const external = await this.externalApps.getStatus(catalogApp.id);
        output.push({
          ...catalogApp,
          installedVersion: external.available ? catalogApp.version : null,
          status: external.available ? "installed" : "available",
          managedExternally: true,
          applicationPath: external.appPath,
        });
        continue;
      }
      const installed = await this.getInstalled(catalogApp.id);
      const updateAvailable = Boolean(
        installed &&
        semver.valid(installed.manifest.version) &&
        semver.gt(catalogApp.version, installed.manifest.version),
      );
      output.push({
        ...catalogApp,
        installedVersion: installed?.manifest.version ?? null,
        status: updateAvailable
          ? "update-available"
          : installed
            ? "installed"
            : catalogApp.availability === "migration-required"
              ? "migration-required"
              : "available",
      });
    }
    return output;
  }

  async install(appId) {
    const app = this.registry.getApp(appId);
    if (app.availability === "external") {
      throw new LauncherError("EXTERNAL_APP_REQUIRES_LOCATION", "Seleccione la aplicación instalada para conectarla con Cwenti.");
    }
    if (app.availability === "migration-required") {
      throw new LauncherError("APP_MIGRATION_REQUIRED", "Esta aplicación todavía requiere completar su adaptación.");
    }
    const temporaryRoot = await mkdtemp(path.join(this.installedRoot, ".install-"));
    try {
      let sourcePath;
      if (app.availability === "bundled") {
        sourcePath = path.join(this.rootPath, app.sourcePath);
        const actualHash = await hashDirectory(sourcePath);
        if (actualHash !== app.sha256) {
          throw new LauncherError("PACKAGE_CHECKSUM_INVALID", "La aplicación incluida no coincide con su suma SHA-256.");
        }
      } else {
        if (app.sizeBytes > this.maximumDownloadBytes) {
          throw new LauncherError("PACKAGE_TOO_LARGE", "El paquete supera el tamaño permitido.");
        }
        verifyPackageSignature(app, this.packagePublicKey);
        const archivePath = path.join(temporaryRoot, "package.zip");
        await downloadPackage(app.downloadUrl, archivePath, {
          maximumBytes: Math.min(this.maximumDownloadBytes, app.sizeBytes + 1024 * 1024),
          timeoutMs: 120_000,
        });
        if (await hashFile(archivePath) !== app.sha256) {
          throw new LauncherError("PACKAGE_CHECKSUM_INVALID", "El paquete descargado no coincide con su suma SHA-256.");
        }
        const extractedPath = path.join(temporaryRoot, "extracted");
        await mkdir(extractedPath, { recursive: true, mode: 0o700 });
        await extract(archivePath, { dir: extractedPath });
        sourcePath = await findManifestRoot(extractedPath);
      }
      const manifest = await validateManifest(sourcePath, this.schema, {
        expectedId: app.id,
        expectedVersion: app.version,
      });
      if (!semver.satisfies(this.launcherVersion, `>=${manifest.minimumLauncherVersion}`)) {
        throw new LauncherError("LAUNCHER_VERSION_TOO_OLD", "La aplicación requiere una versión más reciente del launcher.");
      }
      if (!manifest.supportedPlatforms.includes(process.platform) || !manifest.supportedArchitectures.includes(process.arch)) {
        throw new LauncherError("APP_PLATFORM_UNSUPPORTED", "La aplicación no es compatible con esta plataforma o arquitectura.");
      }
      const stagingPath = path.join(temporaryRoot, "staging");
      await cp(sourcePath, stagingPath, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
      });
      await this.commitInstall(app.id, manifest.version, stagingPath);
      this.logger.info("Aplicación instalada.", { appId: app.id, version: manifest.version });
      return { appId: app.id, version: manifest.version, status: "installed" };
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  async installFromFolder(folderPath) {
    if (process.env.LAUNCHER_DEV_MODE !== "1") {
      throw new LauncherError("DEVELOPMENT_MODE_DISABLED", "El modo de instalación local está desactivado.");
    }
    const manifest = await validateManifest(folderPath, this.schema);
    const temporaryRoot = await mkdtemp(path.join(this.installedRoot, ".local-"));
    try {
      const stagingPath = path.join(temporaryRoot, "staging");
      await cp(folderPath, stagingPath, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
      });
      await this.commitInstall(manifest.id, manifest.version, stagingPath);
      return { appId: manifest.id, version: manifest.version, status: "installed" };
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  async commitInstall(appId, version, stagingPath) {
    const appRoot = this.appInstallRoot(appId);
    const currentPath = path.join(appRoot, "current");
    const backupRoot = path.join(appRoot, "rollback");
    const backupPath = path.join(backupRoot, `${Date.now()}-${version}`);
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const hadCurrent = await stat(currentPath).then(() => true).catch(() => false);
    if (hadCurrent) await rename(currentPath, backupPath);
    try {
      await rename(stagingPath, currentPath);
    } catch (error) {
      if (hadCurrent) await rename(backupPath, currentPath).catch(() => undefined);
      throw new LauncherError("INSTALL_COMMIT_FAILED", "No se pudo completar la instalación; se conservó la versión anterior.", {
        cause: error,
      });
    }
    const backups = (await readdir(backupRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    await Promise.all(backups.slice(2).map((name) => rm(path.join(backupRoot, name), {
      recursive: true,
      force: true,
    })));
  }

  async uninstall(appId) {
    if (this.registry.getApp(appId).availability === "external") {
      throw new LauncherError("EXTERNAL_APP_NOT_MANAGED", "Cwenti no desinstala las aplicaciones existentes.");
    }
    const currentPath = path.join(this.appInstallRoot(appId), "current");
    await rm(currentPath, { recursive: true, force: true });
    this.logger.info("Aplicación desinstalada sin borrar proyectos.", { appId });
    return { appId, status: "available", projectsPreserved: true };
  }
}
