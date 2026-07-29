import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  hashDirectory,
  loadJsonSchema,
  validateManifest,
  validateRegistryDocument,
} from "../src/main/manifest-validator.js";

const manifestSchema = await loadJsonSchema(
  path.resolve(import.meta.dirname, "..", "registry", "app-manifest.schema.json"),
);
const registrySchema = await loadJsonSchema(
  path.resolve(import.meta.dirname, "..", "registry", "registry.schema.json"),
);

async function createApp(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "launcher-app-"));
  await mkdir(path.join(root, "ui"));
  await mkdir(path.join(root, "assets"));
  await mkdir(path.join(root, "instructions"));
  await writeFile(path.join(root, "ui", "index.html"), "<!doctype html><title>Test</title>");
  await writeFile(path.join(root, "assets", "icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  await writeFile(path.join(root, "instructions", "AGENTS.md"), "# Test");
  const manifest = {
    schemaVersion: 1,
    id: "test-app",
    name: "Test App",
    version: "1.0.0",
    description: "Aplicación de prueba.",
    author: "Test",
    entry: "ui/index.html",
    icon: "assets/icon.svg",
    instructions: "instructions/AGENTS.md",
    license: "Prosperity-3.0.0",
    minimumLauncherVersion: "0.1.0",
    supportedPlatforms: ["darwin", "win32"],
    supportedArchitectures: ["x64", "arm64"],
    permissions: {
      filesystem: "selected-workspace",
      shell: "ask",
      network: "ask",
      externalLinks: "ask",
    },
    permissionReasons: {
      filesystem: "Prueba.",
      shell: "Prueba.",
      network: "Prueba.",
      externalLinks: "Prueba.",
    },
    ...overrides,
  };
  await writeFile(path.join(root, "app.manifest.json"), JSON.stringify(manifest));
  return root;
}

test("valida un manifiesto completo y local", async () => {
  const root = await createApp();
  const manifest = await validateManifest(root, manifestSchema);
  assert.equal(manifest.id, "test-app");
});

test("rechaza entradas remotas y rutas que salen del paquete", async () => {
  const remote = await createApp({ entry: "https://example.com/app.js" });
  await assert.rejects(() => validateManifest(remote, manifestSchema), { code: "MANIFEST_SCHEMA_INVALID" });
  const traversal = await createApp({ entry: "../outside.html" });
  await assert.rejects(() => validateManifest(traversal, manifestSchema), { code: "MANIFEST_SCHEMA_INVALID" });
});

test("rechaza ejecutables no declarados", async () => {
  const root = await createApp();
  await writeFile(path.join(root, "run.sh"), "#!/bin/sh\n", { mode: 0o755 });
  await assert.rejects(() => validateManifest(root, manifestSchema), { code: "UNDECLARED_EXECUTABLE" });
});

test("el hash SHA-256 de carpeta es determinista y cambia con el contenido", async () => {
  const root = await createApp();
  const first = await hashDirectory(root);
  const second = await hashDirectory(root);
  assert.equal(first, second);
  await writeFile(path.join(root, "ui", "index.html"), "<!doctype html><title>Cambio</title>");
  assert.notEqual(await hashDirectory(root), first);
});

test("el registro rechaza IDs duplicados", () => {
  const app = {
    id: "clax",
    name: "App",
    version: "1.0.0",
    description: "Prueba",
    category: "Prueba",
    availability: "external",
  };
  assert.throws(
    () => validateRegistryDocument({
      schemaVersion: 1,
      generatedAt: "2026-07-28T00:00:00.000Z",
      apps: [app, app],
    }, registrySchema),
    { code: "REGISTRY_DUPLICATE_ID" },
  );
});
