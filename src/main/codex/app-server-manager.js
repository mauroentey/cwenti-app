import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { LauncherError } from "../errors.js";
import { normalizeCodexEvent } from "./event-normalizer.js";
import { JsonlRpcProcess } from "./jsonl-rpc-process.js";
import {
  APPROVAL_METHODS,
  CODEX_METHODS,
  initializeParams,
  loginParams,
  safeAuthStatus,
  threadResumeParams,
  threadStartParams,
  turnStartParams,
} from "./protocol-adapter.js";

const execFileAsync = promisify(execFile);
const ALLOWED_LOGIN_HOSTS = ["openai.com", "chatgpt.com"];

function isAllowedLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_LOGIN_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

async function executableWorks(candidate) {
  if (candidate.includes(path.sep)) {
    await access(candidate);
  }
  const result = await execFileAsync(candidate, ["--version"], {
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
  });
  const version = String(result.stdout || result.stderr).trim().slice(0, 200);
  if (!version) throw new Error("No version");
  return version;
}

export async function discoverCodexExecutable() {
  const candidates = [
    process.env.LAUNCHER_CODEX_PATH,
    process.platform === "darwin" ? "/Applications/ChatGPT.app/Contents/Resources/codex" : null,
    process.platform === "darwin" ? "/Applications/Codex.app/Contents/Resources/codex" : null,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "ChatGPT", "resources", "codex.exe")
      : null,
    process.platform === "win32" && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "ChatGPT", "resources", "codex.exe")
      : null,
    "codex",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return { executable: candidate, version: await executableWorks(candidate) };
    } catch {
      // Try the next known, local candidate.
    }
  }
  throw new LauncherError(
    "CODEX_NOT_FOUND",
    "No se encontró Codex. Instale o actualice ChatGPT/Codex y vuelva a intentarlo.",
  );
}

export class AppServerManager {
  constructor(options) {
    this.userDataPath = options.userDataPath;
    this.launcherVersion = options.launcherVersion;
    this.logger = options.logger;
    this.activityStore = options.activityStore;
    this.threadManager = options.threadManager;
    this.approvalManager = options.approvalManager;
    this.transport = null;
    this.executable = null;
    this.codexVersion = null;
    this.startPromise = null;
    this.ready = false;
    this.stopping = false;
    this.restartAttempts = 0;
    this.listeners = new Set();
    this.enabled = true;
    this.lastStatus = {
      available: false,
      enabled: true,
      checking: true,
      version: null,
      authenticated: false,
      requiresOpenaiAuth: true,
      accountType: null,
      email: null,
      planType: null,
      error: null,
    };
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (!this.enabled) {
      throw new LauncherError("CODEX_DISABLED", "Codex App Server está detenido desde Configuración.");
    }
    if (this.transport?.running && this.ready) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startInternal() {
    this.stopping = false;
    if (this.transport?.running) this.transport.stop();
    this.ready = false;
    const discovery = await discoverCodexExecutable();
    this.executable = discovery.executable;
    this.codexVersion = discovery.version;
    const transport = new JsonlRpcProcess({
      executable: this.executable,
      args: ["app-server", "--listen", "stdio://"],
      cwd: this.userDataPath,
      logger: this.logger,
    });
    this.transport = transport;
    transport.on("notification", (method, params) => this.handleNotification(method, params));
    transport.on("server-request", (message) => this.handleServerRequest(message));
    transport.on("exit", (details) => this.handleExit(details));
    transport.start();
    try {
      await transport.request(CODEX_METHODS.initialize, initializeParams(this.launcherVersion));
      await transport.notify(CODEX_METHODS.initialized, {});
      this.ready = true;
    } catch (error) {
      transport.stop();
      if (this.transport === transport) this.transport = null;
      throw error;
    }
    this.restartAttempts = 0;
    this.logger.info("Codex App Server iniciado.", { version: this.codexVersion });
  }

  async getStatus() {
    if (!this.enabled) {
      this.lastStatus = {
        available: false,
        enabled: false,
        checking: false,
        version: this.codexVersion,
        authenticated: false,
        requiresOpenaiAuth: true,
        accountType: null,
        email: null,
        planType: null,
        error: "Codex App Server está detenido desde Configuración.",
      };
      return this.lastStatus;
    }
    try {
      await this.start();
      const result = await this.transport.request(
        CODEX_METHODS.accountRead,
        { refreshToken: false },
        8_000,
      );
      this.lastStatus = {
        ...safeAuthStatus(result, true, this.codexVersion),
        enabled: true,
        checking: false,
        error: null,
      };
      return this.lastStatus;
    } catch (error) {
      this.lastStatus = {
        available: false,
        enabled: true,
        checking: false,
        version: this.codexVersion,
        authenticated: false,
        requiresOpenaiAuth: true,
        accountType: null,
        email: null,
        planType: null,
        error: error.message,
      };
      return this.lastStatus;
    }
  }

  getCachedStatus() {
    return { ...this.lastStatus };
  }

  async login() {
    await this.start();
    const result = await this.transport.request(CODEX_METHODS.accountLoginStart, loginParams());
    if (
      result?.type !== "chatgpt" ||
      typeof result.loginId !== "string" ||
      !isAllowedLoginUrl(result.authUrl)
    ) {
      throw new LauncherError("CODEX_LOGIN_INVALID", "Codex no devolvió un enlace de inicio de sesión válido.");
    }
    return { loginId: result.loginId, authUrl: result.authUrl };
  }

  async cancelLogin(loginId) {
    if (typeof loginId !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(loginId)) {
      throw new LauncherError("LOGIN_ID_INVALID", "El identificador de inicio de sesión no es válido.");
    }
    await this.start();
    return this.transport.request(CODEX_METHODS.accountLoginCancel, { loginId });
  }

  async logout() {
    await this.start();
    await this.transport.request(CODEX_METHODS.accountLogout);
    return this.getStatus();
  }

  async startThread(options) {
    await this.start();
    const instructions = await readFile(options.instructionsPath, "utf8");
    if (Buffer.byteLength(instructions, "utf8") > 256 * 1024) {
      throw new LauncherError("INSTRUCTIONS_TOO_LARGE", "Las instrucciones de la aplicación son demasiado grandes.");
    }
    const result = await this.transport.request(
      CODEX_METHODS.threadStart,
      threadStartParams({ ...options, instructions }),
    );
    const threadId = result?.thread?.id;
    await this.threadManager.register(options.appId, threadId, options.workspacePath);
    return { threadId };
  }

  async resumeThread(options) {
    await this.threadManager.assertOwnership(options.appId, options.threadId);
    await this.start();
    const instructions = await readFile(options.instructionsPath, "utf8");
    const result = await this.transport.request(
      CODEX_METHODS.threadResume,
      threadResumeParams({ ...options, instructions }),
    );
    await this.threadManager.register(options.appId, result?.thread?.id, options.workspacePath);
    return { threadId: result.thread.id };
  }

  async startTurn(options) {
    await this.threadManager.assertOwnership(options.appId, options.threadId);
    if (typeof options.prompt !== "string" || options.prompt.trim().length === 0 || options.prompt.length > 12_000) {
      throw new LauncherError("PROMPT_INVALID", "La tarea debe contener entre 1 y 12.000 caracteres.");
    }
    await this.start();
    const result = await this.transport.request(
      CODEX_METHODS.turnStart,
      turnStartParams({ ...options, prompt: options.prompt.trim() }),
      90_000,
    );
    return { threadId: options.threadId, turnId: result?.turn?.id };
  }

  async interruptTurn(appId, threadId) {
    await this.threadManager.assertOwnership(appId, threadId);
    await this.start();
    await this.transport.request(CODEX_METHODS.turnInterrupt, { threadId });
    return { threadId, interrupted: true };
  }

  handleNotification(method, params) {
    const normalized = normalizeCodexEvent(method, params);
    const appId = normalized.threadId ? this.threadManager.ownerFor(normalized.threadId) : null;
    const event = { ...normalized, appId };
    if (appId) {
      void this.activityStore.record(appId, event);
    }
    for (const listener of this.listeners) listener(event);
  }

  async handleServerRequest(message) {
    if (APPROVAL_METHODS.has(message.method)) {
      await this.approvalManager.receive(message);
      return;
    }
    await this.transport?.respondError(message.id, -32601, "Server request is not supported by this client.");
    this.logger.warn("Codex solicitó una acción no compatible.", { method: message.method });
  }

  handleExit(details) {
    this.ready = false;
    if (this.stopping || details.intentional) return;
    this.logger.error("Codex App Server terminó inesperadamente.", { message: details.error.message });
    if (this.restartAttempts >= 3) return;
    this.restartAttempts += 1;
    const delay = Math.min(1_000 * (2 ** (this.restartAttempts - 1)), 5_000);
    setTimeout(() => {
      if (!this.stopping) void this.start().catch((error) => {
        this.logger.error("No se pudo reiniciar Codex App Server.", { message: error.message });
      });
    }, delay).unref?.();
  }

  stop() {
    this.stopping = true;
    this.ready = false;
    this.approvalManager.clear();
    this.transport?.stop();
    this.transport = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    if (!this.enabled) {
      this.stop();
      this.lastStatus = {
        ...this.lastStatus,
        available: false,
        enabled: false,
        checking: false,
        authenticated: false,
        error: "Codex App Server está detenido desde Configuración.",
      };
    } else {
      this.lastStatus = {
        ...this.lastStatus,
        enabled: true,
        checking: true,
        error: null,
      };
    }
    return this.enabled;
  }
}
