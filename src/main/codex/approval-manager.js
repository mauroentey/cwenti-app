import { randomUUID } from "node:crypto";
import { LauncherError } from "../errors.js";
import { describeApproval } from "./event-normalizer.js";
import { mapApprovalResponse } from "./protocol-adapter.js";

export class ApprovalManager {
  constructor(options) {
    this.transportProvider = options.transportProvider;
    this.threadManager = options.threadManager;
    this.activityStore = options.activityStore;
    this.pending = new Map();
    this.listeners = new Set();
  }

  onApproval(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async receive(message) {
    const threadId = message.params?.threadId;
    const appId = typeof threadId === "string" ? this.threadManager.ownerFor(threadId) : null;
    if (!appId) {
      await this.transportProvider()?.respondError(message.id, -32602, "Unknown or unauthorized thread.");
      return;
    }
    const requestId = randomUUID();
    const description = describeApproval(message.method, message.params);
    const request = {
      requestId,
      appId,
      threadId,
      method: message.method,
      title: description.title,
      details: description.details,
      receivedAt: new Date().toISOString(),
    };
    this.pending.set(requestId, {
      rpcId: message.id,
      method: message.method,
      params: message.params,
      request,
    });
    await this.activityStore.record(appId, {
      type: "approval.requested",
      message: description.title,
      project: message.params?.cwd,
      technical: { method: message.method },
    });
    for (const listener of this.listeners) listener(request);
  }

  async respond(appId, requestId, decision) {
    if (!["once", "session", "reject"].includes(decision)) {
      throw new LauncherError("APPROVAL_DECISION_INVALID", "La decisión de aprobación no es válida.");
    }
    const pending = this.pending.get(requestId);
    if (!pending || pending.request.appId !== appId) {
      throw new LauncherError("APPROVAL_NOT_FOUND", "La solicitud ya no está disponible.");
    }
    this.pending.delete(requestId);
    const response = mapApprovalResponse(pending.method, pending.params, decision);
    await this.transportProvider()?.respond(pending.rpcId, response);
    await this.activityStore.record(appId, {
      type: "approval.resolved",
      message: decision === "reject" ? "Acción rechazada." : "Acción permitida.",
      project: pending.params?.cwd,
      technical: { method: pending.method, decision },
    });
    return { requestId, decision };
  }

  clear() {
    this.pending.clear();
  }
}
