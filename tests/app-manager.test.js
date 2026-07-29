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
import semver from "semver";
import { AppManager } from "../src/main/app-manager.js";
import { normalizeCodexEvent } from "../src/main/codex/event-normalizer.js";

function manager(userDataPath) {
  return new AppManager({
    userDataPath,
    rootPath: userDataPath,
    registry: { getCatalog: () => [] },
    launcherVersion: "0.1.0",
    packagePublicKey: "",
    maximumDownloadBytes: 10_000,
    logger: { info() {} },
  });
}

test("semver compara actualizaciones sin comparación lexicográfica", () => {
  assert.equal(semver.gt("1.10.0", "1.9.9"), true);
  assert.equal(semver.gt("1.0.0", "1.0.0"), false);
});

test("una instalación atómica reemplaza current y conserva rollback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "launcher-install-"));
  const appManager = manager(root);
  appManager.installedRoot = path.join(root, "installed-apps");
  await mkdir(path.join(appManager.installedRoot, "test-app", "current"), { recursive: true });
  await writeFile(path.join(appManager.installedRoot, "test-app", "current", "marker.txt"), "old");
  const staging = path.join(root, "staging");
  await mkdir(staging);
  await writeFile(path.join(staging, "marker.txt"), "new");
  await appManager.commitInstall("test-app", "2.0.0", staging);
  assert.equal(
    await readFile(path.join(appManager.installedRoot, "test-app", "current", "marker.txt"), "utf8"),
    "new",
  );
});

test("una instalación fallida recupera current", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "launcher-rollback-"));
  const appManager = manager(root);
  appManager.installedRoot = path.join(root, "installed-apps");
  await mkdir(path.join(appManager.installedRoot, "test-app", "current"), { recursive: true });
  await writeFile(path.join(appManager.installedRoot, "test-app", "current", "marker.txt"), "preserved");
  await assert.rejects(
    () => appManager.commitInstall("test-app", "2.0.0", path.join(root, "missing-staging")),
    { code: "INSTALL_COMMIT_FAILED" },
  );
  assert.equal(
    await readFile(path.join(appManager.installedRoot, "test-app", "current", "marker.txt"), "utf8"),
    "preserved",
  );
});

test("un evento desconocido de App Server no cierra el adaptador", () => {
  const event = normalizeCodexEvent("future/method", { threadId: "thr_123" });
  assert.equal(event.type, "protocol.unknown");
  assert.equal(event.threadId, "thr_123");
  assert.match(event.message, /future\/method/);
});
