import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPackagedSuite } from "../scripts/verify-packaged-suite.js";

const versions = {
  clax: "0.1.6",
  kaikei: "0.1.2",
  noman: "0.1.2",
};

async function fakeMacSuite() {
  const releasePath = await mkdtemp(path.join(os.tmpdir(), "cwenti-package-"));
  const suiteRoot = path.join(
    releasePath,
    "mac-arm64",
    "Cwenti.app",
    "Contents",
    "Resources",
    "bundled-apps",
  );
  const apps = [];
  for (const [id, productName] of [
    ["clax", "Clax"],
    ["kaikei", "Kaikei"],
    ["noman", "Noman"],
  ]) {
    const executable = path.join(
      suiteRoot,
      `${productName}.app`,
      "Contents",
      "MacOS",
      productName,
    );
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, "binary");
    apps.push({
      id,
      productName,
      version: versions[id],
      relativePath: `${productName}.app`,
    });
  }
  await writeFile(
    path.join(suiteRoot, "suite-manifest.json"),
    JSON.stringify({ apps }),
  );
  return { releasePath, suiteRoot };
}

test("packaged Cwenti contains all three versioned Electron executables", async () => {
  const fixture = await fakeMacSuite();
  const result = await verifyPackagedSuite({
    platform: "darwin",
    releasePath: fixture.releasePath,
    versions,
  });
  assert.deepEqual(result.apps, [
    { id: "clax", version: "0.1.6" },
    { id: "kaikei", version: "0.1.2" },
    { id: "noman", version: "0.1.2" },
  ]);
});

test("packaged Cwenti rejects an Electron bundle with the wrong version", async () => {
  const fixture = await fakeMacSuite();
  const manifestPath = path.join(fixture.suiteRoot, "suite-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.apps[0].version = "9.9.9";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    () => verifyPackagedSuite({
      platform: "darwin",
      releasePath: fixture.releasePath,
      versions,
    }),
    /Clax metadata is invalid/,
  );
});
