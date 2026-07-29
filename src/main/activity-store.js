import path from "node:path";
import { randomUUID } from "node:crypto";
import { AtomicJsonStore } from "./storage.js";
import { safeAppDataPath } from "./paths.js";

const MAX_ACTIVITY_ITEMS = 1_000;

function sanitizeTechnical(value) {
  if (!value || typeof value !== "object") return {};
  const allowedKeys = ["method", "status", "itemType", "decision", "result", "durationMs"];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, String(value[key]).slice(0, 300)]),
  );
}

export class ActivityStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.stores = new Map();
    this.listeners = new Set();
  }

  storeFor(appId) {
    if (!this.stores.has(appId)) {
      const filePath = safeAppDataPath(this.userDataPath, appId, "activity.json");
      this.stores.set(appId, new AtomicJsonStore(filePath, { items: [] }));
    }
    return this.stores.get(appId);
  }

  onActivity(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async record(appId, event) {
    const clean = {
      id: event.id ?? randomUUID(),
      at: event.at ?? new Date().toISOString(),
      appId,
      project: event.project ? path.basename(event.project) : null,
      type: String(event.type ?? "unknown").slice(0, 100),
      message: String(event.message ?? "").slice(0, 1_000),
      technical: sanitizeTechnical(event.technical),
    };
    await this.storeFor(appId).update((state) => ({
      items: [clean, ...(Array.isArray(state.items) ? state.items : [])].slice(0, MAX_ACTIVITY_ITEMS),
    }));
    for (const listener of this.listeners) listener(clean);
    return clean;
  }

  async list(appId = null, limit = 200) {
    if (appId) {
      const state = await this.storeFor(appId).read();
      return (state.items ?? []).slice(0, limit);
    }
    const all = [];
    for (const [knownAppId, store] of this.stores) {
      const state = await store.read();
      all.push(...(state.items ?? []).map((item) => ({ ...item, appId: knownAppId })));
    }
    return all
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, limit);
  }
}
