const METHOD_TYPES = new Map([
  ["thread/started", "thread.started"],
  ["thread/status/changed", "thread.status"],
  ["thread/closed", "thread.closed"],
  ["turn/started", "turn.started"],
  ["turn/completed", "turn.completed"],
  ["item/started", "item.started"],
  ["item/completed", "item.completed"],
  ["item/agentMessage/delta", "message.delta"],
  ["item/reasoning/summaryTextDelta", "reasoning.delta"],
  ["item/commandExecution/outputDelta", "terminal.delta"],
  ["item/fileChange/outputDelta", "file.delta"],
  ["item/fileChange/patchUpdated", "diff.updated"],
  ["error", "server.error"],
  ["account/updated", "auth.updated"],
  ["account/login/completed", "auth.login-completed"],
  ["serverRequest/resolved", "approval.resolved"],
]);

function truncate(value, maximum = 2_000) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

export function normalizeCodexEvent(method, params) {
  const type = METHOD_TYPES.get(method) ?? "protocol.unknown";
  const item = params?.item;
  const turn = params?.turn;
  const message =
    truncate(params?.delta) ||
    truncate(item?.text) ||
    truncate(turn?.error?.message) ||
    truncate(params?.error?.message) ||
    (type === "protocol.unknown" ? `Evento no reconocido: ${truncate(method, 200)}` : "");
  return {
    at: new Date().toISOString(),
    type,
    message,
    threadId: typeof params?.threadId === "string"
      ? params.threadId
      : typeof params?.thread?.id === "string"
        ? params.thread.id
        : null,
    turnId: typeof params?.turnId === "string"
      ? params.turnId
      : typeof turn?.id === "string"
        ? turn.id
        : null,
    technical: {
      method,
      status: turn?.status ?? item?.status ?? null,
      itemType: item?.type ?? null,
    },
  };
}

export function describeApproval(method, params) {
  if (method === "item/commandExecution/requestApproval") {
    const network = params?.networkApprovalContext;
    return {
      title: network ? "Acceso de red solicitado" : "Comando solicitado",
      details: network
        ? {
          Destino: network.host ?? "No indicado",
          Protocolo: network.protocol ?? "No indicado",
          Motivo: params?.reason ?? "No indicado",
        }
        : {
          Comando: params?.command ?? "No indicado",
          Directorio: params?.cwd ?? "No indicado",
          Motivo: params?.reason ?? "No indicado",
        },
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      title: "Cambios de archivos solicitados",
      details: {
        Alcance: params?.grantRoot ?? params?.cwd ?? "Workspace activo",
        Motivo: params?.reason ?? "No indicado",
      },
    };
  }
  return {
    title: "Permisos adicionales solicitados",
    details: {
      Directorio: params?.cwd ?? "No indicado",
      Motivo: params?.reason ?? "No indicado",
      Permisos: JSON.stringify(params?.permissions ?? {}),
    },
  };
}
