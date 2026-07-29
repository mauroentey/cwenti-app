import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LegacyAppManager } from "../src/main/legacy-app-manager.js";

test("detecta y abre una aplicación oficial desde una ubicación conocida", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cwenti-external-"));
  const userDataPath = path.join(root, "user-data");
  const appName = process.platform === "darwin" ? "Clax.app" : "Clax.exe";
  const appPath = path.join(root, appName);
  if (process.platform === "darwin") await mkdir(appPath);
  else await writeFile(appPath, "");
  const calls = [];
  const manager = new LegacyAppManager({
    definitions: {
      clax: {
        productName: "Clax",
        expectedNames: ["Clax.app", "Clax.exe"],
        candidates: { [process.platform]: [appPath] },
      },
    },
    userDataPath,
    logger: { info() {} },
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      return { unref() {} };
    },
  });

  const status = await manager.getStatus("clax");
  assert.equal(status.available, true);
  assert.equal(status.appPath, await realpath(appPath));

  if (!["darwin", "win32"].includes(process.platform)) return;
  const result = await manager.open("clax");
  assert.deepEqual(result, { appId: "clax", opened: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.shell, false);
  if (process.platform === "darwin") {
    assert.equal(calls[0].command, "/usr/bin/open");
    assert.deepEqual(calls[0].args, [await realpath(appPath)]);
  }
});

test("rechaza una aplicación con un nombre distinto al oficial", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cwenti-external-"));
  const userDataPath = path.join(root, "user-data");
  const wrongName = process.platform === "darwin" ? "Otra.app" : "Otra.exe";
  const wrongPath = path.join(root, wrongName);
  if (process.platform === "darwin") await mkdir(wrongPath);
  else await writeFile(wrongPath, "");
  const manager = new LegacyAppManager({
    definitions: {
      clax: {
        productName: "Clax",
        expectedNames: ["Clax.app", "Clax.exe"],
        candidates: { [process.platform]: [] },
      },
    },
    userDataPath,
    logger: { info() {} },
  });

  await assert.rejects(
    () => manager.register("clax", wrongPath),
    { code: "OFFICIAL_APP_NAME_MISMATCH" },
  );
});

test("prioriza la copia incluida sobre una ubicación registrada anteriormente", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cwenti-bundled-"));
  const userDataPath = path.join(root, "user-data");
  const appName = process.platform === "darwin" ? "Clax.app" : "Clax.exe";
  const bundledPath = path.join(root, "bundle", appName);
  const previousPath = path.join(root, "previous", appName);
  await mkdir(path.dirname(bundledPath), { recursive: true });
  await mkdir(path.dirname(previousPath), { recursive: true });
  if (process.platform === "darwin") {
    await mkdir(bundledPath);
    await mkdir(previousPath);
  } else {
    await writeFile(bundledPath, "");
    await writeFile(previousPath, "");
  }
  const manager = new LegacyAppManager({
    definitions: {
      clax: {
        productName: "Clax",
        expectedNames: ["Clax.app", "Clax.exe"],
        bundledCandidates: { [process.platform]: [bundledPath] },
        candidates: { [process.platform]: [] },
      },
    },
    userDataPath,
    logger: { info() {} },
  });
  await manager.register("clax", previousPath);

  const status = await manager.getStatus("clax");
  assert.equal(status.appPath, await realpath(bundledPath));
});
