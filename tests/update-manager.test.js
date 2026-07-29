import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { UpdateManager } from "../src/main/update-manager.js";

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checks = 0;
    this.downloads = 0;
    this.installs = [];
  }

  async checkForUpdates() {
    this.checks += 1;
    this.emit("checking-for-update");
  }

  async downloadUpdate() {
    this.downloads += 1;
    this.emit("download-progress", { percent: 48.6 });
    this.emit("update-downloaded", { version: "0.2.0" });
  }

  quitAndInstall(...options) {
    this.installs.push(options);
  }
}

test("completa el flujo de actualización de la suite", async () => {
  const updater = new FakeUpdater();
  const manager = new UpdateManager({
    configured: true,
    simulationEnabled: false,
    logger: { warn() {} },
    updater,
  });

  await manager.check();
  assert.equal(updater.checks, 1);
  assert.equal(manager.getStatus().phase, "checking");

  updater.emit("update-available", {
    version: "0.2.0",
    releaseNotes: "Clax, Kaikei y Noman actualizados.",
  });
  assert.equal(manager.getStatus().phase, "available");

  await manager.download();
  assert.equal(updater.downloads, 1);
  assert.deepEqual(manager.getStatus(), {
    configured: true,
    phase: "downloaded",
    version: "0.2.0",
    releaseNotes: "Clax, Kaikei y Noman actualizados.",
    percent: 49,
  });

  manager.install();
  assert.deepEqual(updater.installs, [[false, true]]);
});
