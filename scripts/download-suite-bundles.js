import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import extract from "extract-zip";
import semver from "semver";
import { copyBundle } from "./copy-bundle.js";

const scriptPath = fileURLToPath(import.meta.url);
const rootPath = path.resolve(path.dirname(scriptPath), "..");
const maximumBundleBytes = 2 * 1024 * 1024 * 1024;
const downloadTimeoutMs = 15 * 60 * 1000;
const officialApps = Object.freeze({
  clax: { name: "Clax", repository: "mauroentey/Clax" },
  kaikei: { name: "Kaikei", repository: "mauroentey/kaikei" },
  noman: { name: "Noman", repository: "mauroentey/noman-wa" },
});

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

export function validateSuiteLock(document, options) {
  const lock = assertObject(document, "The Cwenti suite lock must be an object.");
  if (lock.schemaVersion !== 1 || !Number.isFinite(Date.parse(lock.generatedAt))) {
    throw new Error("The Cwenti suite lock metadata is invalid.");
  }
  const apps = assertObject(lock.apps, "The Cwenti suite lock has no applications.");
  const lockIds = Object.keys(apps).sort();
  const expectedIds = Object.keys(officialApps).sort();
  if (JSON.stringify(lockIds) !== JSON.stringify(expectedIds)) {
    throw new Error("The Cwenti suite lock must contain exactly the three official apps.");
  }

  const artifactKey = `${options.platform}-${options.arch}`;
  return expectedIds.map((id) => {
    const definition = officialApps[id];
    const app = assertObject(apps[id], `The ${definition.name} lock entry is invalid.`);
    if (
      !semver.valid(app.version) ||
      app.version !== options.versions[id] ||
      app.repository !== definition.repository
    ) {
      throw new Error(`The ${definition.name} version or repository is invalid.`);
    }
    const artifacts = assertObject(
      app.artifacts,
      `The ${definition.name} lock entry has no artifacts.`,
    );
    const artifact = assertObject(
      artifacts[artifactKey],
      `${definition.name} does not provide ${artifactKey}.`,
    );
    if (
      typeof artifact.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      artifact.sizeBytes < 1 ||
      artifact.sizeBytes > maximumBundleBytes
    ) {
      throw new Error(`The ${definition.name} artifact integrity metadata is invalid.`);
    }
    let url;
    try {
      url = new URL(artifact.url);
    } catch {
      throw new Error(`The ${definition.name} artifact URL is invalid.`);
    }
    const expectedPrefix = `/mauroentey/${definition.repository.split("/")[1]}/releases/download/v${app.version}/`;
    const assetName = url.pathname.slice(expectedPrefix.length);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.slice(0, expectedPrefix.length).toLocaleLowerCase("en") !==
        expectedPrefix.toLocaleLowerCase("en") ||
      !assetName ||
      assetName.includes("/") ||
      !assetName.toLocaleLowerCase("en").endsWith(".zip")
    ) {
      throw new Error(`The ${definition.name} artifact is not an official GitHub release ZIP.`);
    }
    return {
      id,
      name: definition.name,
      repository: definition.repository,
      version: app.version,
      artifact: {
        url: url.href,
        sha256: artifact.sha256,
        sizeBytes: artifact.sizeBytes,
      },
    };
  });
}

async function findEntry(directory, expectedName) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.name.toLocaleLowerCase("en") === expectedName.toLocaleLowerCase("en")) {
      return candidate;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const nested = await findEntry(candidate, expectedName);
      if (nested) return nested;
    }
  }
  return null;
}

async function download(artifact, target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), downloadTimeoutMs);
  let handle;
  let failure;
  try {
    const response = await fetch(artifact.url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (
      !response.ok ||
      !response.body ||
      new URL(response.url).protocol !== "https:"
    ) {
      throw new Error(`The suite download failed with HTTP ${response.status}.`);
    }
    const declaredBytes = Number(response.headers.get("content-length") ?? 0);
    if (declaredBytes && declaredBytes !== artifact.sizeBytes) {
      throw new Error("The suite download size does not match the lock file.");
    }

    handle = await open(target, "wx", 0o600);
    const hash = createHash("sha256");
    let receivedBytes = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > artifact.sizeBytes) {
        throw new Error("The suite download exceeded its locked size.");
      }
      hash.update(value);
      await handle.write(value);
    }
    await handle.sync();
    if (
      receivedBytes !== artifact.sizeBytes ||
      hash.digest("hex") !== artifact.sha256
    ) {
      throw new Error("The suite download failed its size or SHA-256 verification.");
    }
  } catch (error) {
    failure = error?.name === "AbortError"
      ? new Error("The suite download timed out.")
      : error;
  } finally {
    clearTimeout(timer);
    await handle?.close().catch(() => undefined);
  }
  if (failure) {
    await rm(target, { force: true }).catch(() => undefined);
    throw failure;
  }
}

export async function downloadSuite(options = {}) {
  const platform = options.platform ?? (
    process.env.CWENTI_BUNDLE_PLATFORM?.trim() ||
    (process.platform === "win32" ? "win32" : "darwin")
  );
  const arch = options.arch ?? (
    process.env.CWENTI_BUNDLE_ARCH?.trim() || process.arch
  );
  if (
    !(
      (platform === "darwin" && ["arm64", "x64"].includes(arch)) ||
      (platform === "win32" && arch === "x64")
    )
  ) {
    throw new Error(`Cwenti does not publish suite bundles for ${platform}-${arch}.`);
  }

  const registry = JSON.parse(
    await readFile(path.join(rootPath, "registry", "bundled-apps.json"), "utf8"),
  );
  const versions = Object.fromEntries(registry.apps.map((app) => [app.id, app.version]));
  const lock = JSON.parse(
    await readFile(path.join(rootPath, "registry", "suite-lock.json"), "utf8"),
  );
  const definitions = validateSuiteLock(lock, { platform, arch, versions });
  const platformDirectory = platform === "win32" ? "win32" : "darwin";
  const destinationRoot = path.join(rootPath, ".suite-downloads", platformDirectory);
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });

  const downloaded = [];
  for (const definition of definitions) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `cwenti-${definition.id}-`));
    try {
      const archivePath = path.join(temporaryRoot, "bundle.zip");
      const extractedPath = path.join(temporaryRoot, "extracted");
      await mkdir(extractedPath);
      process.stdout.write(
        `Downloading ${definition.name} ${definition.version} for ${platform}-${arch}…\n`,
      );
      await download(definition.artifact, archivePath);
      await extract(archivePath, { dir: extractedPath });

      const expectedName = platform === "win32"
        ? `${definition.name}.exe`
        : `${definition.name}.app`;
      const entry = await findEntry(extractedPath, expectedName);
      if (!entry) {
        throw new Error(`The ${definition.name} ZIP does not contain ${expectedName}.`);
      }
      const source = platform === "win32" ? path.dirname(entry) : entry;
      const destination = platform === "win32"
        ? path.join(destinationRoot, definition.name)
        : path.join(destinationRoot, expectedName);
      await copyBundle(source, destination);
      downloaded.push({
        id: definition.id,
        productName: definition.name,
        version: definition.version,
        sha256: definition.artifact.sha256,
        source: definition.artifact.url,
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  await writeFile(
    path.join(destinationRoot, "download-manifest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      platform,
      arch,
      apps: downloaded,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`Verified suite builds downloaded to ${destinationRoot}\n`);
  return { platform, arch, destinationRoot, apps: downloaded };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await downloadSuite();
}
