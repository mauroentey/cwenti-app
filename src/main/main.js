import { app } from "electron";
import path from "node:path";
import { productConfig } from "../../config/product.config.js";
import { officialAppDefinitions } from "../../config/official-apps.config.js";
import { ActivityStore } from "./activity-store.js";
import { AppManager } from "./app-manager.js";
import { ApprovalManager } from "./codex/approval-manager.js";
import { AppServerManager } from "./codex/app-server-manager.js";
import { ThreadManager } from "./codex/thread-manager.js";
import { registerIpc } from "./ipc.js";
import { LicenseManager } from "./license-manager.js";
import { LegacyAppManager } from "./legacy-app-manager.js";
import { LocalLogger } from "./logger.js";
import { PermissionManager } from "./permission-manager.js";
import { RegistryManager } from "./registry-manager.js";
import { AtomicJsonStore, ensurePrivateDirectory } from "./storage.js";
import { UpdateManager } from "./update-manager.js";
import { WindowManager } from "./windows.js";
import { WorkspaceManager } from "./workspace-manager.js";

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let services = null;

async function boot() {
  const rootPath = app.getAppPath();
  const userDataPath = app.getPath("userData");
  const logsPath = path.join(userDataPath, "logs");
  await ensurePrivateDirectory(userDataPath);
  const logger = new LocalLogger(logsPath);
  await logger.initialize();
  const launcherVersion = app.getVersion();
  const settings = new AtomicJsonStore(path.join(userDataPath, "settings.json"), {
    theme: "system",
    autoUpdates: true,
    codexEnabled: true,
  });
  const registry = new RegistryManager({
    rootPath,
    registryUrl: productConfig.registryUrl,
    timeoutMs: productConfig.registryTimeoutMs,
    logger,
  });
  await registry.initialize();
  const bundledAppsPath = app.isPackaged
    ? path.join(process.resourcesPath, "bundled-apps")
    : path.join(rootPath, "bundled-apps", process.platform === "win32" ? "win32" : "darwin");
  const externalApps = new LegacyAppManager({
    definitions: officialAppDefinitions(app.getPath("documents"), bundledAppsPath),
    userDataPath,
    logger,
  });
  const apps = new AppManager({
    userDataPath,
    rootPath,
    registry,
    launcherVersion,
    packagePublicKey: productConfig.packagePublicKeyEd25519,
    maximumDownloadBytes: productConfig.maximumDownloadBytes,
    logger,
    externalApps,
  });
  await apps.initialize();
  const activity = new ActivityStore(userDataPath);
  const threads = new ThreadManager(userDataPath);
  const workspaces = new WorkspaceManager(userDataPath);
  const permissions = new PermissionManager(userDataPath);
  const license = new LicenseManager({
    userDataPath,
    publicKey: productConfig.licensePublicKeyEd25519,
    launcherVersion,
  });
  let codex;
  const approvals = new ApprovalManager({
    transportProvider: () => codex?.transport ?? null,
    threadManager: threads,
    activityStore: activity,
  });
  codex = new AppServerManager({
    userDataPath,
    launcherVersion,
    logger,
    activityStore: activity,
    threadManager: threads,
    approvalManager: approvals,
  });
  const updates = new UpdateManager({
    configured: app.isPackaged
      || Boolean(process.env.LAUNCHER_UPDATE_URL?.trim())
      || process.env.LAUNCHER_SIMULATE_UPDATE === "1",
    simulationEnabled: process.env.LAUNCHER_SIMULATE_UPDATE === "1",
    logger,
  });
  const windows = new WindowManager({ rootPath, appManager: apps });
  services = {
    rootPath,
    userDataPath,
    logsPath,
    launcherVersion,
    publicProduct: {
      productName: productConfig.productName,
      legalName: productConfig.legalName,
      commercialEmail: productConfig.commercialEmail,
      website: productConfig.website,
      repositoryUrl: productConfig.repositoryUrl,
      deepLinkProtocol: productConfig.deepLinkProtocol,
      recommendedCodexVersion: productConfig.recommendedCodexVersion,
    },
    logger,
    settings,
    registry,
    apps,
    externalApps,
    activity,
    threads,
    workspaces,
    permissions,
    license,
    approvals,
    codex,
    updates,
    windows,
  };
  registerIpc(services);
  activity.onActivity((event) => {
    windows.sendToLauncher("launcher:activity", event);
    windows.sendToApp(event.appId, "app:activity", event);
  });
  approvals.onApproval((request) => windows.sendToApp(request.appId, "app:approval", request));
  codex.onEvent((event) => windows.sendToLauncher("launcher:codex-event", event));
  const launcherWindow = windows.createLauncherWindow();
  const currentSettings = await settings.read();
  codex.setEnabled(currentSettings.codexEnabled !== false);
  if (process.env.LAUNCHER_SMOKE_TEST === "1") {
    launcherWindow.webContents.once("did-finish-load", async () => {
      try {
        const result = await launcherWindow.webContents.executeJavaScript(`
          new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const check = async () => {
              try {
                if (!window.launcher || typeof window.launcher.getBootstrap !== "function") {
                  throw new Error("El preload seguro no está disponible.");
                }
                const bootstrap = await window.launcher.getBootstrap();
                const names = bootstrap.apps.map((item) => item.name);
                if (
                  document.querySelector("#view")?.children.length > 0 &&
                  ["Clax", "Kaikei", "Noman"].every((name) => names.includes(name))
                ) {
                  resolve({
                    productName: bootstrap.product.productName,
                    names,
                    route: location.hash,
                    navigation: [...document.querySelectorAll("#primary-nav a")]
                      .map((item) => item.textContent),
                    logoCount: document.querySelectorAll(".app-logo").length,
                  });
                  return;
                }
              } catch (error) {
                if (Date.now() - startedAt > 8_000) {
                  reject(error);
                  return;
                }
              }
              if (Date.now() - startedAt > 8_000) {
                reject(new Error("La interfaz no terminó de cargar."));
                return;
              }
              setTimeout(check, 50);
            };
            void check();
          })
        `, true);
        if (
          result.productName !== "Cwenti" ||
          result.names.join(",") !== "Clax,Kaikei,Noman" ||
          result.route !== "#/library" ||
          result.navigation.join(",") !== "Biblioteca,Configuración" ||
          result.logoCount !== 3
        ) {
          throw new Error("Cwenti no devolvió el catálogo esperado.");
        }
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
    });
  } else {
    void codex.getStatus()
      .then((status) => windows.sendToLauncher("launcher:codex-event", {
        type: "status.updated",
        status,
      }))
      .catch((error) => logger.warn("Codex no está disponible al iniciar.", {
        message: error.message,
      }));
    if (currentSettings.autoUpdates && updates.configured && app.isPackaged) {
      void updates.check().catch(() => undefined);
    }
    void registry.refresh();
  }
}

if (singleInstance) {
  app.setAppUserModelId(productConfig.appId);
  app.setAsDefaultProtocolClient(productConfig.deepLinkProtocol);
  app.on("second-instance", () => services?.windows.createLauncherWindow());
  app.whenReady().then(boot).catch((error) => {
    console.error(error);
    app.quit();
  });
  app.on("activate", () => services?.windows.createLauncherWindow());
  app.on("before-quit", () => {
    services?.codex.stop();
    services?.windows.closeAllApps();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
