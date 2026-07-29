const { contextBridge, ipcRenderer } = require("electron");

const appIdArgument = process.argv.find((value) => value.startsWith("--official-app-id="));
const appId = appIdArgument?.slice("--official-app-id=".length) ?? "";
const invoke = (channel, payload = {}) => ipcRenderer.invoke(channel, { ...payload, appId });

contextBridge.exposeInMainWorld("officialApp", Object.freeze({
  getContext: () => invoke("app:get-context"),
  chooseWorkspace: () => invoke("app:choose-workspace"),
  revokeWorkspace: () => invoke("app:revoke-workspace"),
  startThread: () => invoke("app:start-thread"),
  resumeThread: (threadId) => invoke("app:resume-thread", { threadId }),
  startTurn: (threadId, prompt) => invoke("app:start-turn", { threadId, prompt }),
  interruptTurn: (threadId) => invoke("app:interrupt-turn", { threadId }),
  listThreads: () => invoke("app:list-threads"),
  readTextFile: (relativePath) => invoke("app:read-text-file", { relativePath }),
  writeTextFile: (relativePath, content) => invoke("app:write-text-file", { relativePath, content }),
  respondToApproval: (requestId, decision) => invoke("app:respond-approval", { requestId, decision }),
  openExternal: (url) => invoke("app:open-external", { url }),
  backToLauncher: () => invoke("app:back-to-launcher"),
  onActivity: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:activity", listener);
    return () => ipcRenderer.removeListener("app:activity", listener);
  },
  onApproval: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:approval", listener);
    return () => ipcRenderer.removeListener("app:approval", listener);
  },
}));
