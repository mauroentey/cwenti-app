import assert from "node:assert/strict";
import test from "node:test";
import { adaptLegacyManifest } from "../src/main/manifest-adapter.js";

test("el adaptador conserva metadatos explícitos sin inventar contenido", () => {
  const manifest = adaptLegacyManifest({
    id: "app-one",
    name: "Nombre confirmado",
    version: "1.2.3",
    description: "Descripción confirmada.",
    author: "Titular",
    entry: "ui/index.html",
    icon: "assets/icon.png",
    instructions: "instructions/AGENTS.md",
    permissions: {
      filesystem: "selected-workspace",
      shell: "ask",
      network: "ask",
      externalLinks: "ask",
    },
    permissionReasons: {
      filesystem: "Razón confirmada.",
      shell: "Razón confirmada.",
      network: "Razón confirmada.",
      externalLinks: "Razón confirmada.",
    },
  });
  assert.equal(manifest.id, "app-one");
  assert.equal(manifest.name, "Nombre confirmado");
  assert.equal(manifest.license, "Prosperity-3.0.0");
});
