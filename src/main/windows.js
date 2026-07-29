import { BrowserWindow } from "electron";
import path from "node:path";
import { LauncherError } from "./errors.js";
import { secureWebContents } from "./security.js";

export class WindowManager {
  constructor(options) {
    this.rootPath = options.rootPath;
    this.appManager = options.appManager;
    this.launcherWindow = null;
    this.appWindows = new Map();
    this.webContentsApps = new Map();
  }

  createLauncherWindow() {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.show();
      this.launcherWindow.focus();
      return this.launcherWindow;
    }
    const preloadPath = path.join(this.rootPath, "src", "preload", "launcher-preload.cjs");
    const htmlPath = path.join(this.rootPath, "src", "renderer", "index.html");
    const window = new BrowserWindow({
      width: 1320,
      height: 840,
      minWidth: 980,
      minHeight: 680,
      show: false,
      backgroundColor: "#111714",
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: !process.env.NODE_ENV || process.env.NODE_ENV === "development",
      },
    });
    this.launcherWindow = window;
    secureWebContents(window.webContents, htmlPath);
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      this.launcherWindow = null;
    });
    void window.loadFile(htmlPath);
    return window;
  }

  async openApp(appId) {
    const existing = this.appWindows.get(appId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    const installed = await this.appManager.getInstalled(appId);
    if (!installed) throw new LauncherError("APP_NOT_INSTALLED", "Instale la aplicación antes de abrirla.");
    const entryPath = path.join(installed.installPath, installed.manifest.entry);
    const preloadPath = path.join(this.rootPath, "src", "preload", "app-preload.cjs");
    const window = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 860,
      minHeight: 620,
      show: false,
      backgroundColor: "#101612",
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: `persist:official-app-${appId}`,
        additionalArguments: [`--official-app-id=${appId}`],
      },
    });
    this.appWindows.set(appId, window);
    this.webContentsApps.set(window.webContents.id, appId);
    secureWebContents(window.webContents, entryPath);
    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      this.webContentsApps.delete(window.webContents.id);
      this.appWindows.delete(appId);
    });
    await window.loadFile(entryPath);
    return window;
  }

  getAppIdForWebContents(webContentsId) {
    return this.webContentsApps.get(webContentsId) ?? null;
  }

  sendToLauncher(channel, payload) {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.webContents.send(channel, payload);
    }
  }

  sendToApp(appId, channel, payload) {
    const window = this.appWindows.get(appId);
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  }

  backToLauncher(appId) {
    const window = this.appWindows.get(appId);
    window?.close();
    this.createLauncherWindow();
  }

  closeAllApps() {
    for (const window of this.appWindows.values()) window.close();
    this.appWindows.clear();
    this.webContentsApps.clear();
  }
}
