import electronUpdater from "electron-updater";
import { LauncherError } from "./errors.js";

export class UpdateManager {
  constructor(options) {
    this.configured = Boolean(options.configured);
    this.simulationEnabled = options.simulationEnabled === true;
    this.logger = options.logger;
    this.updater = options.updater ?? electronUpdater.autoUpdater;
    this.status = {
      configured: this.configured,
      phase: this.configured ? "idle" : "not-configured",
      version: null,
      releaseNotes: null,
    };
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.on("checking-for-update", () => this.setStatus({ phase: "checking" }));
    this.updater.on("update-available", (info) => this.setStatus({
      phase: "available",
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
    }));
    this.updater.on("update-not-available", () => this.setStatus({ phase: "current" }));
    this.updater.on("download-progress", (progress) => this.setStatus({
      phase: "downloading",
      percent: Math.round(progress.percent),
    }));
    this.updater.on("update-downloaded", (info) => this.setStatus({
      phase: "downloaded",
      version: info.version,
    }));
    this.updater.on("error", (error) => {
      this.logger.warn("Falló la actualización del launcher.", { message: error.message });
      this.setStatus({ phase: "error", message: "No se pudo comprobar la actualización." });
    });
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
  }

  getStatus() {
    return structuredClone(this.status);
  }

  async check() {
    if (this.simulationEnabled) {
      this.setStatus({
        configured: true,
        phase: "available",
        version: "99.0.0-development",
        releaseNotes: "Actualización simulada para verificar la experiencia de desarrollo.",
      });
      return this.getStatus();
    }
    if (!this.configured) {
      throw new LauncherError("UPDATES_NOT_CONFIGURED", "Configure LAUNCHER_UPDATE_URL para comprobar actualizaciones.");
    }
    await this.updater.checkForUpdates();
    return this.getStatus();
  }

  async download() {
    if (this.status.phase !== "available") {
      throw new LauncherError("UPDATE_NOT_AVAILABLE", "No hay una actualización lista para descargar.");
    }
    if (this.simulationEnabled) {
      this.setStatus({ phase: "downloaded", percent: 100 });
      return this.getStatus();
    }
    await this.updater.downloadUpdate();
    return this.getStatus();
  }

  install() {
    if (this.status.phase !== "downloaded") {
      throw new LauncherError("UPDATE_NOT_READY", "La actualización todavía no está lista.");
    }
    if (this.simulationEnabled) {
      this.setStatus({ phase: "simulated-installed" });
      return this.getStatus();
    }
    this.updater.quitAndInstall(false, true);
  }
}
