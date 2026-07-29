import {
  dialog,
  ipcMain,
  shell,
} from "electron";
import {
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LauncherError } from "./errors.js";
import { isSafeExternalUrl } from "./security.js";
import {
  resolveExistingInside,
  resolveWritableInside,
} from "./paths.js";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LICENSE_BYTES = 1024 * 1024;

async function interfaceLanguage(services) {
  const settings = await services.settings.read();
  return settings.language === "es" ? "es" : "en";
}

function localized(language, english, spanish) {
  return language === "es" ? spanish : english;
}

function assertAppId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(value)) {
    throw new LauncherError("APP_ID_INVALID", "El identificador de aplicación no es válido.");
  }
  return value;
}

function assertLauncherSender(event, services) {
  if (event.sender.id !== services.windows.launcherWindow?.webContents.id) {
    throw new LauncherError("IPC_ACCESS_DENIED", "La ventana no puede usar esta operación.");
  }
}

function assertAppSender(event, payload, services) {
  const actualAppId = services.windows.getAppIdForWebContents(event.sender.id);
  if (!actualAppId || payload?.appId !== actualAppId) {
    throw new LauncherError("IPC_ACCESS_DENIED", "La ventana no puede usar esta operación.");
  }
  return actualAppId;
}

async function installedContext(appId, services) {
  const installed = await services.apps.getInstalled(appId);
  if (!installed) throw new LauncherError("APP_NOT_INSTALLED", "La aplicación no está instalada.");
  const workspace = await services.workspaces.get(appId);
  const consent = await services.permissions.getConsent(appId, installed.manifest);
  return { installed, workspace, consent };
}

async function assertCanRun(services) {
  const status = await services.license.getStatus();
  if (!status.canRun) {
    throw new LauncherError("LICENSE_EXECUTION_BLOCKED", status.message);
  }
  return status;
}

async function collectActivity(services) {
  const items = [];
  for (const app of services.registry.getCatalog()) {
    items.push(...await services.activity.list(app.id, 100));
  }
  return items.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 300);
}

export function registerIpc(services) {
  const launcherHandler = (channel, handler) => {
    ipcMain.handle(channel, async (event, payload) => {
      assertLauncherSender(event, services);
      return handler(payload ?? {}, event);
    });
  };
  const appHandler = (channel, handler) => {
    ipcMain.handle(channel, async (event, payload) => {
      const appId = assertAppSender(event, payload, services);
      return handler(appId, payload ?? {}, event);
    });
  };

  launcherHandler("launcher:get-bootstrap", async () => ({
    product: services.publicProduct,
    apps: await services.apps.getApps(),
    license: await services.license.getStatus(),
    codex: services.codex.getCachedStatus(),
    settings: await services.settings.read(),
    updates: services.updates.getStatus(),
    developmentMode: process.env.LAUNCHER_DEV_MODE === "1",
  }));

  launcherHandler("launcher:get-apps", () => services.apps.getApps());
  launcherHandler("launcher:get-projects", async () => {
    const projects = [];
    for (const app of await services.apps.getApps()) {
      const threads = await services.threads.list(app.id);
      projects.push({
        appId: app.id,
        appName: app.name,
        installed: Boolean(app.installedVersion),
        workspace: await services.workspaces.get(app.id),
        threadCount: threads.length,
      });
    }
    return projects;
  });
  launcherHandler("launcher:install-app", async ({ appId }) => {
    const result = await services.apps.install(assertAppId(appId));
    services.windows.sendToLauncher("launcher:activity", {
      type: "app.installed",
      appId,
      at: new Date().toISOString(),
      message: "Aplicación instalada.",
    });
    return result;
  });
  launcherHandler("launcher:locate-app", async ({ appId }) => {
    assertAppId(appId);
    const catalogApp = services.registry.getApp(appId);
    if (catalogApp.availability !== "external") {
      throw new LauncherError("APP_LOCATION_NOT_SUPPORTED", "Esta aplicación es administrada directamente por Cwenti.");
    }
    const language = await interfaceLanguage(services);
    const result = await dialog.showOpenDialog(services.windows.launcherWindow, {
      title: localized(language, `Locate ${catalogApp.name}`, `Localizar ${catalogApp.name}`),
      message: localized(
        language,
        `Select ${catalogApp.name}.app or ${catalogApp.name}.exe`,
        `Seleccione ${catalogApp.name}.app o ${catalogApp.name}.exe`,
      ),
      properties: ["openFile", "openDirectory"],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return services.externalApps.register(appId, result.filePaths[0]);
  });
  launcherHandler("launcher:uninstall-app", ({ appId }) => services.apps.uninstall(assertAppId(appId)));
  launcherHandler("launcher:open-app", async ({ appId }) => {
    assertAppId(appId);
    await assertCanRun(services);
    const catalogApp = services.registry.getApp(appId);
    if (catalogApp.availability === "external") {
      return services.externalApps.open(appId);
    }
    const { installed, consent } = await installedContext(appId, services);
    if (!consent.accepted) {
      return {
        opened: false,
        requiresPermissionConsent: true,
        app: {
          id: appId,
          name: installed.manifest.name,
          permissions: installed.manifest.permissions,
          reasons: installed.manifest.permissionReasons,
        },
      };
    }
    await services.windows.openApp(appId);
    return { opened: true };
  });
  launcherHandler("launcher:accept-app-permissions", async ({ appId, declarationAccepted }) => {
    assertAppId(appId);
    await assertCanRun(services);
    const installed = await services.apps.getInstalled(appId);
    if (!installed) throw new LauncherError("APP_NOT_INSTALLED", "La aplicación no está instalada.");
    await services.permissions.accept(appId, installed.manifest, declarationAccepted);
    await services.windows.openApp(appId);
    return { opened: true };
  });

  launcherHandler("launcher:get-license-status", () => services.license.getStatus());
  launcherHandler("launcher:select-personal", ({ declarationAccepted }) => services.license.selectPersonal(declarationAccepted));
  launcherHandler("launcher:start-trial", (input) => services.license.startTrial(input));
  launcherHandler("launcher:import-license", async () => {
    const language = await interfaceLanguage(services);
    const result = await dialog.showOpenDialog(services.windows.launcherWindow, {
      title: localized(language, "Import commercial license", "Importar licencia comercial"),
      properties: ["openFile"],
      filters: [{
        name: localized(language, "JSON license", "Licencia JSON"),
        extensions: ["json"],
      }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const filePath = result.filePaths[0];
    const details = await stat(filePath);
    if (!details.isFile() || details.size > MAX_LICENSE_BYTES) {
      throw new LauncherError("LICENSE_FILE_INVALID", "El archivo de licencia no es válido.");
    }
    let document;
    try {
      document = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new LauncherError("LICENSE_FILE_INVALID", "El archivo de licencia no contiene JSON válido.", {
        cause: error,
      });
    }
    return services.license.activate(document);
  });
  launcherHandler("launcher:remove-license", async () => {
    const language = await interfaceLanguage(services);
    const result = await dialog.showMessageBox(services.windows.launcherWindow, {
      type: "warning",
      title: localized(language, "Remove license", "Remover licencia"),
      message: localized(
        language,
        "Remove the commercial license from this device?",
        "¿Desea remover la licencia comercial de este dispositivo?",
      ),
      detail: localized(
        language,
        "Projects, history, and settings will not be deleted.",
        "No se borrarán proyectos, historial ni configuración.",
      ),
      buttons: language === "es" ? ["Cancelar", "Remover licencia"] : ["Cancel", "Remove license"],
      defaultId: 0,
      cancelId: 0,
    });
    return result.response === 1 ? services.license.removeCommercialLicense() : null;
  });

  launcherHandler("launcher:get-codex-status", () => services.codex.getStatus());
  launcherHandler("launcher:login-codex", async () => {
    const result = await services.codex.login();
    if (!isSafeExternalUrl(result.authUrl, { hosts: ["openai.com", "chatgpt.com"] })) {
      throw new LauncherError("LOGIN_URL_INVALID", "Codex devolvió un enlace no permitido.");
    }
    await shell.openExternal(result.authUrl);
    return { loginId: result.loginId };
  });
  launcherHandler("launcher:logout-codex", () => services.codex.logout());
  launcherHandler("launcher:set-codex-enabled", async ({ enabled }) => {
    if (typeof enabled !== "boolean") {
      throw new LauncherError("SETTING_INVALID", "El estado de Codex no es válido.");
    }
    services.codex.setEnabled(enabled);
    await services.settings.update((settings) => ({ ...settings, codexEnabled: enabled }));
    if (enabled) await services.codex.start();
    return services.codex.getStatus();
  });
  launcherHandler("launcher:get-activity", () => collectActivity(services));
  launcherHandler("launcher:get-settings", () => services.settings.read());
  launcherHandler("launcher:update-settings", async (patch) => {
    const allowed = {};
    if (typeof patch.autoUpdates === "boolean") allowed.autoUpdates = patch.autoUpdates;
    if (["system", "light", "dark"].includes(patch.theme)) allowed.theme = patch.theme;
    if (["en", "es"].includes(patch.language)) allowed.language = patch.language;
    return services.settings.update((settings) => ({ ...settings, ...allowed }));
  });
  launcherHandler("launcher:check-updates", () => services.updates.check());
  launcherHandler("launcher:download-update", () => services.updates.download());
  launcherHandler("launcher:install-update", () => services.updates.install());
  launcherHandler("launcher:open-logs", async () => {
    await shell.openPath(services.logsPath);
    return true;
  });
  launcherHandler("launcher:open-external", async ({ url }) => {
    if (!isSafeExternalUrl(url, { allowMailto: true })) {
      throw new LauncherError("URL_NOT_ALLOWED", "Solo se permiten enlaces HTTPS o de correo.");
    }
    await shell.openExternal(url);
    return true;
  });

  launcherHandler("launcher:export-user-data", async () => {
    const language = await interfaceLanguage(services);
    const result = await dialog.showSaveDialog(services.windows.launcherWindow, {
      title: localized(language, "Export settings and history", "Exportar configuración e historial"),
      defaultPath: `launcher-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const apps = [];
    for (const catalogApp of services.registry.getCatalog()) {
      apps.push({
        appId: catalogApp.id,
        workspace: await services.workspaces.get(catalogApp.id),
        threads: await services.threads.list(catalogApp.id),
        activity: await services.activity.list(catalogApp.id, 1_000),
      });
    }
    const exportDocument = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      launcherVersion: services.launcherVersion,
      licenseStatus: await services.license.getStatus(),
      settings: await services.settings.read(),
      apps,
      note: localized(
        language,
        "Projects remain in their original workspaces; this file exports references, settings, and history, not project contents.",
        "Los proyectos permanecen en sus workspaces originales; este archivo exporta referencias, configuración e historial, no el contenido de los proyectos.",
      ),
    };
    await writeFile(result.filePath, `${JSON.stringify(exportDocument, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return { filePath: result.filePath };
  });

  launcherHandler("launcher:export-diagnostics", async () => {
    const language = await interfaceLanguage(services);
    const confirmation = await dialog.showMessageBox(services.windows.launcherWindow, {
      type: "question",
      title: localized(language, "Export diagnostics", "Exportar diagnóstico"),
      message: localized(
        language,
        "Include basic system information?",
        "¿Incluir información básica del sistema?",
      ),
      detail: localized(
        language,
        "Project contents are never included. You can cancel or export version, platform, and technical status information.",
        "Nunca se incluirá el contenido de sus proyectos. Puede cancelar o exportar con versión, plataforma y estados técnicos.",
      ),
      buttons: language === "es" ? ["Cancelar", "Exportar diagnóstico"] : ["Cancel", "Export diagnostics"],
      defaultId: 1,
      cancelId: 0,
    });
    if (confirmation.response !== 1) return null;
    const result = await dialog.showSaveDialog(services.windows.launcherWindow, {
      title: localized(language, "Save diagnostics", "Guardar diagnóstico"),
      defaultPath: `launcher-diagnostic-${Date.now()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const diagnostic = {
      generatedAt: new Date().toISOString(),
      launcherVersion: services.launcherVersion,
      platform: process.platform,
      architecture: process.arch,
      codex: await services.codex.getStatus(),
      updates: services.updates.getStatus(),
      appStates: await services.apps.getApps(),
      projectContentsIncluded: false,
    };
    await writeFile(result.filePath, `${JSON.stringify(diagnostic, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return { filePath: result.filePath };
  });

  launcherHandler("launcher:install-development-app", async () => {
    if (process.env.LAUNCHER_DEV_MODE !== "1") {
      throw new LauncherError("DEVELOPMENT_MODE_DISABLED", "El modo de desarrollo está desactivado.");
    }
    const language = await interfaceLanguage(services);
    const result = await dialog.showOpenDialog(services.windows.launcherWindow, {
      title: localized(language, "Select application folder", "Seleccionar carpeta de aplicación"),
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    return services.apps.installFromFolder(result.filePaths[0]);
  });

  appHandler("app:get-context", async (appId) => {
    const { installed, workspace, consent } = await installedContext(appId, services);
    return {
      app: {
        id: appId,
        name: installed.manifest.name,
        version: installed.manifest.version,
        permissions: installed.manifest.permissions,
      },
      workspace,
      consent,
      codex: await services.codex.getStatus(),
      license: await services.license.getStatus(),
    };
  });
  appHandler("app:choose-workspace", async (appId) => {
    const language = await interfaceLanguage(services);
    const current = await services.workspaces.get(appId);
    if (current) {
      const confirmation = await dialog.showMessageBox(services.windows.appWindows.get(appId), {
        type: "question",
        title: localized(language, "Change workspace", "Cambiar workspace"),
        message: localized(
          language,
          `The active workspace is “${current.name}”.`,
          `El workspace activo es “${current.name}”.`,
        ),
        detail: localized(
          language,
          "Changing it does not move or delete files. New threads will use the new folder.",
          "Cambiarlo no mueve ni borra archivos. Los nuevos threads usarán la carpeta nueva.",
        ),
        buttons: language === "es" ? ["Cancelar", "Cambiar carpeta"] : ["Cancel", "Change folder"],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirmation.response !== 1) return current;
    }
    const result = await dialog.showOpenDialog(services.windows.appWindows.get(appId), {
      title: localized(language, "Select workspace", "Seleccionar workspace"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length !== 1) return current;
    return services.workspaces.grant(appId, result.filePaths[0]);
  });
  appHandler("app:revoke-workspace", (appId) => services.workspaces.revoke(appId));
  appHandler("app:list-threads", (appId) => services.threads.list(appId));
  appHandler("app:start-thread", async (appId) => {
    await assertCanRun(services);
    const { installed, workspace, consent } = await installedContext(appId, services);
    if (!consent.accepted) throw new LauncherError("PERMISSION_CONSENT_REQUIRED", "Los permisos de la aplicación no están aceptados.");
    if (!workspace) throw new LauncherError("WORKSPACE_REQUIRED", "Seleccione un workspace.");
    return services.codex.startThread({
      appId,
      workspacePath: workspace.path,
      instructionsPath: path.join(installed.installPath, installed.manifest.instructions),
    });
  });
  appHandler("app:resume-thread", async (appId, { threadId }) => {
    await assertCanRun(services);
    const { installed, workspace } = await installedContext(appId, services);
    if (!workspace) throw new LauncherError("WORKSPACE_REQUIRED", "Seleccione un workspace.");
    return services.codex.resumeThread({
      appId,
      threadId,
      workspacePath: workspace.path,
      instructionsPath: path.join(installed.installPath, installed.manifest.instructions),
    });
  });
  appHandler("app:start-turn", async (appId, { threadId, prompt }) => {
    await assertCanRun(services);
    const { workspace } = await installedContext(appId, services);
    if (!workspace) throw new LauncherError("WORKSPACE_REQUIRED", "Seleccione un workspace.");
    return services.codex.startTurn({ appId, threadId, prompt, workspacePath: workspace.path });
  });
  appHandler("app:interrupt-turn", (appId, { threadId }) => services.codex.interruptTurn(appId, threadId));
  appHandler("app:respond-approval", (appId, { requestId, decision }) => services.approvals.respond(
    appId,
    requestId,
    decision,
  ));
  appHandler("app:read-text-file", async (appId, { relativePath }) => {
    const { installed, workspace } = await installedContext(appId, services);
    if (installed.manifest.permissions.filesystem !== "selected-workspace" || !workspace) {
      throw new LauncherError("FILESYSTEM_ACCESS_DENIED", "La aplicación no tiene un workspace autorizado.");
    }
    const filePath = await resolveExistingInside(workspace.path, relativePath, { type: "file" });
    const details = await stat(filePath);
    if (details.size > MAX_TEXT_FILE_BYTES) {
      throw new LauncherError("FILE_TOO_LARGE", "El archivo supera el límite de 2 MB.");
    }
    return { relativePath, content: await readFile(filePath, "utf8") };
  });
  appHandler("app:write-text-file", async (appId, { relativePath, content }) => {
    const { installed, workspace } = await installedContext(appId, services);
    if (installed.manifest.permissions.filesystem !== "selected-workspace" || !workspace) {
      throw new LauncherError("FILESYSTEM_ACCESS_DENIED", "La aplicación no tiene un workspace autorizado.");
    }
    if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_TEXT_FILE_BYTES) {
      throw new LauncherError("FILE_TOO_LARGE", "El contenido supera el límite de 2 MB.");
    }
    const filePath = await resolveWritableInside(workspace.path, relativePath);
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporaryPath, filePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return { relativePath, bytes: Buffer.byteLength(content, "utf8") };
  });
  appHandler("app:open-external", async (appId, { url }) => {
    const { installed } = await installedContext(appId, services);
    if (installed.manifest.permissions.externalLinks !== "ask" || !isSafeExternalUrl(url)) {
      throw new LauncherError("URL_NOT_ALLOWED", "La aplicación no puede abrir este enlace.");
    }
    const language = await interfaceLanguage(services);
    const confirmation = await dialog.showMessageBox(services.windows.appWindows.get(appId), {
      type: "question",
      title: localized(language, "Open external link", "Abrir enlace externo"),
      message: localized(
        language,
        "The application wants to open an HTTPS link in your browser.",
        "La aplicación solicita abrir un enlace HTTPS en su navegador.",
      ),
      detail: url.slice(0, 1_000),
      buttons: language === "es" ? ["Rechazar", "Abrir enlace"] : ["Reject", "Open link"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirmation.response !== 1) return false;
    await shell.openExternal(url);
    return true;
  });
  appHandler("app:back-to-launcher", (appId) => services.windows.backToLauncher(appId));
}
