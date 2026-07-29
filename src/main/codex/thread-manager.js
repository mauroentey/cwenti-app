import path from "node:path";
import { AtomicJsonStore } from "../storage.js";
import { LauncherError } from "../errors.js";
import { safeAppDataPath } from "../paths.js";

export class ThreadManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.stores = new Map();
    this.owners = new Map();
  }

  storeFor(appId) {
    if (!this.stores.has(appId)) {
      const filePath = safeAppDataPath(this.userDataPath, appId, "threads.json");
      this.stores.set(appId, new AtomicJsonStore(filePath, { threads: [] }));
    }
    return this.stores.get(appId);
  }

  async register(appId, threadId, workspacePath) {
    if (typeof threadId !== "string" || threadId.length < 3 || threadId.length > 200) {
      throw new LauncherError("THREAD_ID_INVALID", "Codex devolvió un identificador de thread inválido.");
    }
    const record = {
      threadId,
      workspacePath,
      projectName: path.basename(workspacePath),
      updatedAt: new Date().toISOString(),
    };
    await this.storeFor(appId).update((state) => ({
      threads: [
        record,
        ...(state.threads ?? []).filter((item) => item.threadId !== threadId),
      ].slice(0, 200),
    }));
    this.owners.set(threadId, appId);
    return record;
  }

  async assertOwnership(appId, threadId) {
    if (this.owners.get(threadId) === appId) return true;
    const state = await this.storeFor(appId).read();
    const owned = (state.threads ?? []).some((item) => item.threadId === threadId);
    if (!owned) {
      throw new LauncherError("THREAD_ACCESS_DENIED", "El thread no pertenece a esta aplicación.");
    }
    this.owners.set(threadId, appId);
    return true;
  }

  ownerFor(threadId) {
    return this.owners.get(threadId) ?? null;
  }

  async list(appId) {
    const state = await this.storeFor(appId).read();
    for (const item of state.threads ?? []) this.owners.set(item.threadId, appId);
    return state.threads ?? [];
  }
}
