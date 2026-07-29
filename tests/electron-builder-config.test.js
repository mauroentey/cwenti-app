import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import builderConfig from "../electron-builder.config.js";

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

function configuredMacIdentity() {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "import config from './electron-builder.config.js'; process.stdout.write(String(config.mac.identity));",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CSC_LINK: "configured-in-ci",
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

test("firma el paquete macOS de forma ad hoc cuando no hay Developer ID", () => {
  assert.equal(builderConfig.mac.identity, "-");
  const entitlements = readFileSync(
    builderConfig.mac.entitlements,
    "utf8",
  );
  assert.match(
    entitlements,
    /<key>com\.apple\.security\.cs\.disable-library-validation<\/key>\s*<true\/>/,
  );
  assert.match(
    entitlements,
    /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/,
  );
  assert.match(
    entitlements,
    /<key>com\.apple\.security\.cs\.allow-unsigned-executable-memory<\/key>\s*<true\/>/,
  );
});

test("permite que electron-builder seleccione Developer ID cuando CI configura firma", () => {
  assert.equal(configuredMacIdentity(), "undefined");
});
