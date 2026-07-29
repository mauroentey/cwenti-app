/**
 * Adaptador verificado contra Codex CLI 0.146.0-alpha.3.1.
 * El resto del launcher no debe emitir nombres de métodos del protocolo.
 */

export const CODEX_METHODS = Object.freeze({
  initialize: "initialize",
  initialized: "initialized",
  accountRead: "account/read",
  accountLoginStart: "account/login/start",
  accountLoginCancel: "account/login/cancel",
  accountLogout: "account/logout",
  threadStart: "thread/start",
  threadResume: "thread/resume",
  turnStart: "turn/start",
  turnInterrupt: "turn/interrupt",
});

export const APPROVAL_METHODS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
]);

export function initializeParams(version) {
  return {
    clientInfo: {
      name: "cwenti",
      title: "Cwenti",
      version,
    },
    capabilities: {
      experimentalApi: false,
      requestAttestation: false,
      optOutNotificationMethods: [],
    },
  };
}

export function loginParams() {
  return {
    type: "chatgpt",
    useHostedLoginSuccessPage: true,
    appBrand: "chatgpt",
  };
}

export function threadStartParams(options) {
  return {
    cwd: options.workspacePath,
    runtimeWorkspaceRoots: [options.workspacePath],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    developerInstructions: options.instructions,
    personality: "friendly",
    serviceName: `official-app-${options.appId}`,
  };
}

export function threadResumeParams(options) {
  return {
    threadId: options.threadId,
    cwd: options.workspacePath,
    runtimeWorkspaceRoots: [options.workspacePath],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    developerInstructions: options.instructions,
    personality: "friendly",
  };
}

export function turnStartParams(options) {
  return {
    threadId: options.threadId,
    input: [{ type: "text", text: options.prompt, text_elements: [] }],
    cwd: options.workspacePath,
    approvalPolicy: "on-request",
    sandboxPolicy: {
      type: "workspaceWrite",
      writableRoots: [options.workspacePath],
      networkAccess: false,
    },
  };
}

export function mapApprovalResponse(method, params, decision) {
  const allowOnce = decision === "once";
  const allowSession = decision === "session";
  if (method === "item/permissions/requestApproval") {
    return {
      permissions: allowOnce || allowSession ? params.permissions : {},
      scope: allowSession ? "session" : "turn",
    };
  }
  return {
    decision: allowOnce ? "accept" : allowSession ? "acceptForSession" : "decline",
  };
}

export function safeAuthStatus(result, available, version) {
  const account = result?.account;
  return {
    available,
    version,
    authenticated: Boolean(account),
    requiresOpenaiAuth: result?.requiresOpenaiAuth === true,
    accountType: typeof account?.type === "string" ? account.type : null,
    email: typeof account?.email === "string" ? account.email : null,
    planType: typeof account?.planType === "string" ? account.planType : null,
  };
}
