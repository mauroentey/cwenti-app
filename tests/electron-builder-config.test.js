import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const inspectConfig = `
  import config from "./electron-builder.config.js";
  process.stdout.write(config.extraResources[0].from);
`;

function bundledAppsPath(platform) {
  return execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", inspectConfig],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CWENTI_BUNDLE_PLATFORM: platform,
      },
    },
  );
}

test("selecciona explícitamente las apps de macOS para el paquete macOS", () => {
  assert.equal(bundledAppsPath("darwin"), "bundled-apps/darwin");
});

test("selecciona explícitamente las apps de Windows en una compilación cruzada", () => {
  assert.equal(bundledAppsPath("win32"), "bundled-apps/win32");
});
