import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  hashDirectory,
  loadJsonSchema,
  validateManifest,
  validateRegistryDocument,
} from "../src/main/manifest-validator.js";

const rootPath = path.resolve(import.meta.dirname, "..");
const registrySchema = await loadJsonSchema(path.join(rootPath, "registry", "registry.schema.json"));
const manifestSchema = await loadJsonSchema(path.join(rootPath, "registry", "app-manifest.schema.json"));
const registry = validateRegistryDocument(
  JSON.parse(await readFile(path.join(rootPath, "registry", "bundled-apps.json"), "utf8")),
  registrySchema,
);

for (const app of registry.apps) {
  if (app.availability !== "bundled") continue;
  const sourcePath = path.join(rootPath, app.sourcePath);
  await validateManifest(sourcePath, manifestSchema, {
    expectedId: app.id,
    expectedVersion: app.version,
  });
  const digest = await hashDirectory(sourcePath);
  if (digest !== app.sha256) {
    throw new Error(`SHA-256 incorrecto para ${app.id}: se esperaba ${app.sha256} y se obtuvo ${digest}`);
  }
}

process.stdout.write(`Registro válido: ${registry.apps.length} aplicaciones oficiales.\n`);
