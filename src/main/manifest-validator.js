import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { LauncherError } from "./errors.js";
import { assertSafeRelativePath, resolveExistingInside } from "./paths.js";

const EXECUTABLE_EXTENSIONS = new Set([".exe", ".bat", ".cmd", ".com", ".ps1", ".sh"]);

function createValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

export async function loadJsonSchema(schemaPath) {
  return JSON.parse(await readFile(schemaPath, "utf8"));
}

export async function validateManifest(appDirectory, schema, options = {}) {
  const manifestPath = path.join(appDirectory, "app.manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new LauncherError("MANIFEST_INVALID_JSON", "El manifiesto no contiene JSON válido.", {
      cause: error,
    });
  }
  const validate = createValidator(schema);
  if (!validate(manifest)) {
    throw new LauncherError("MANIFEST_SCHEMA_INVALID", "El manifiesto no cumple el esquema.", {
      safeDetails: validate.errors?.map((item) => `${item.instancePath || "/"} ${item.message}`).slice(0, 12),
    });
  }
  if (options.expectedId && manifest.id !== options.expectedId) {
    throw new LauncherError("MANIFEST_ID_MISMATCH", "El identificador del manifiesto no coincide con el registro.");
  }
  if (options.expectedVersion && manifest.version !== options.expectedVersion) {
    throw new LauncherError("MANIFEST_VERSION_MISMATCH", "La versión del manifiesto no coincide con el registro.");
  }
  for (const relativePath of [manifest.entry, manifest.icon, manifest.previewImage, manifest.instructions].filter(Boolean)) {
    assertSafeRelativePath(relativePath);
    await resolveExistingInside(appDirectory, relativePath, { type: "file" });
  }
  if (!manifest.entry.endsWith(".html")) {
    throw new LauncherError("MANIFEST_ENTRY_INVALID", "La entrada de la aplicación debe ser un archivo HTML local.");
  }
  const declaredExecutables = new Set(manifest.declaredExecutables ?? []);
  const files = await listPackageFiles(appDirectory);
  for (const file of files) {
    const extension = path.extname(file.relativePath).toLocaleLowerCase("en");
    const executableByMode = process.platform !== "win32" && (file.mode & 0o111) !== 0;
    if ((EXECUTABLE_EXTENSIONS.has(extension) || executableByMode) && !declaredExecutables.has(file.relativePath)) {
      throw new LauncherError(
        "UNDECLARED_EXECUTABLE",
        `El paquete contiene un ejecutable no declarado: ${file.relativePath}`,
      );
    }
  }
  return manifest;
}

export async function listPackageFiles(rootPath) {
  const output = [];
  async function visit(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        throw new LauncherError("PACKAGE_SYMLINK_FORBIDDEN", `El paquete contiene un enlace simbólico: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const details = await lstat(absolutePath);
        output.push({
          absolutePath,
          relativePath,
          size: details.size,
          mode: details.mode,
        });
      } else {
        throw new LauncherError("PACKAGE_ENTRY_FORBIDDEN", `El paquete contiene una entrada no permitida: ${relativePath}`);
      }
    }
  }
  await visit(rootPath);
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
}

export async function hashDirectory(rootPath) {
  const hash = createHash("sha256");
  const files = await listPackageFiles(rootPath);
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(String(file.size));
    hash.update("\0");
    hash.update(await readFile(file.absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function validateRegistryDocument(document, schema) {
  const validate = createValidator(schema);
  if (!validate(document)) {
    throw new LauncherError("REGISTRY_SCHEMA_INVALID", "El registro de aplicaciones no cumple el esquema.", {
      safeDetails: validate.errors?.map((item) => `${item.instancePath || "/"} ${item.message}`).slice(0, 12),
    });
  }
  const ids = new Set();
  for (const app of document.apps) {
    if (ids.has(app.id)) {
      throw new LauncherError("REGISTRY_DUPLICATE_ID", `El registro repite el identificador ${app.id}.`);
    }
    ids.add(app.id);
  }
  return document;
}
