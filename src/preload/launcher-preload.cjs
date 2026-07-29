const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("launcher", Object.freeze({
  getBootstrap: () => invoke("launcher:get-bootstrap"),
  getApps: () => invoke("launcher:get-apps"),
  getProjects: () => invoke("launcher:get-projects"),
  installApp: (appId) => invoke("launcher:install-app", { appId }),
  locateApp: (appId) => invoke("launcher:locate-app", { appId }),
  uninstallApp: (appId) => invoke("launcher:uninstall-app", { appId }),
  openApp: (appId) => invoke("launcher:open-app", { appId }),
  acceptAppPermissions: (appId, declarationAccepted) => invoke("launcher:accept-app-permissions", {
    appId,
    declarationAccepted,
  }),
  getLicenseStatus: () => invoke("launcher:get-license-status"),
  selectPersonalUse: (declarationAccepted) => invoke("launcher:select-personal", { declarationAccepted }),
  startCommercialTrial: (input) => invoke("launcher:start-trial", input),
  importLicense: () => invoke("launcher:import-license"),
  removeLicense: () => invoke("launcher:remove-license"),
  getCodexStatus: () => invoke("launcher:get-codex-status"),
  loginCodex: () => invoke("launcher:login-codex"),
  logoutCodex: () => invoke("launcher:logout-codex"),
  setCodexEnabled: (enabled) => invoke("launcher:set-codex-enabled", { enabled }),
  getActivity: () => invoke("launcher:get-activity"),
  getSettings: () => invoke("launcher:get-settings"),
  updateSettings: (patch) => invoke("launcher:update-settings", patch),
  checkForUpdates: () => invoke("launcher:check-updates"),
  downloadUpdate: () => invoke("launcher:download-update"),
  installUpdate: () => invoke("launcher:install-update"),
  exportUserData: () => invoke("launcher:export-user-data"),
  exportDiagnostics: () => invoke("launcher:export-diagnostics"),
  openLogsFolder: () => invoke("launcher:open-logs"),
  openExternal: (url) => invoke("launcher:open-external", { url }),
  chooseDevelopmentApp: () => invoke("launcher:install-development-app"),
  onActivity: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:activity", listener);
    return () => ipcRenderer.removeListener("launcher:activity", listener);
  },
  onCodexEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:codex-event", listener);
    return () => ipcRenderer.removeListener("launcher:codex-event", listener);
  },
}));
