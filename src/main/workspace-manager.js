import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { AtomicJsonStore } from "./storage.js";
import { LauncherError } from "./errors.js";
import { safeAppDataPath } from "./paths.js";

export class WorkspaceManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.stores = new Map();
  }

  storeFor(appId) {
    if (!this.stores.has(appId)) {
      const filePath = safeAppDataPath(this.userDataPath, appId, "workspace.json");
      this.stores.set(appId, new AtomicJsonStore(filePath, { workspace: null }));
    }
    return this.stores.get(appId);
  }

  async get(appId) {
    const state = await this.storeFor(appId).read();
    if (!state.workspace) return null;
    try {
      const actualPath = await realpath(state.workspace.path);
      const details = await lstat(actualPath);
      if (!details.isDirectory()) return null;
      return {
        path: actualPath,
        name: path.basename(actualPath),
        grantedAt: state.workspace.grantedAt,
      };
    } catch {
      return null;
    }
  }

  async grant(appId, selectedPath) {
    if (typeof selectedPath !== "string" || selectedPath.length === 0) {
      throw new LauncherError("WORKSPACE_INVALID", "No se seleccionó una carpeta válida.");
    }
    const actualPath = await realpath(selectedPath);
    const details = await lstat(actualPath);
    if (!details.isDirectory()) {
      throw new LauncherError("WORKSPACE_INVALID", "El workspace debe ser una carpeta.");
    }
    const workspace = {
      path: actualPath,
      name: path.basename(actualPath),
      grantedAt: new Date().toISOString(),
    };
    await this.storeFor(appId).write({ workspace });
    return workspace;
  }

  async revoke(appId) {
    await this.storeFor(appId).write({ workspace: null });
    return null;
  }
}
