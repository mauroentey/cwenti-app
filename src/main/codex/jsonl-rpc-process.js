import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { LauncherError } from "../errors.js";

const MAXIMUM_LINE_BYTES = 20 * 1024 * 1024;
const MAXIMUM_REQUEST_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export class JsonlRpcProcess extends EventEmitter {
  constructor(options) {
    super();
    this.executable = options.executable;
    this.args = options.args;
    this.cwd = options.cwd;
    this.logger = options.logger;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.child = null;
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.stoppedIntentionally = false;
  }

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  start() {
    if (this.running) return;
    this.stoppedIntentionally = false;
    this.child = spawn(this.executable, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    });
    this.child.stdout.on("data", (chunk) => this.receive(Buffer.from(chunk)));
    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) this.logger.warn("Codex App Server informó un diagnóstico.", { length: text.length });
    });
    this.child.on("error", (error) => this.handleExit(error));
    this.child.on("exit", (code, signal) => {
      this.handleExit(new LauncherError(
        "CODEX_PROCESS_EXITED",
        `Codex App Server se cerró (${signal ?? `código ${code}`}).`,
      ));
    });
  }

  async request(method, params, timeoutMs = this.requestTimeoutMs) {
    if (!this.running) this.start();
    const id = this.nextId++;
    const line = this.encode({ id, method, ...(params === undefined ? {} : { params }) });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new LauncherError("CODEX_REQUEST_TIMEOUT", `Codex no respondió a ${method} a tiempo.`));
      }, timeoutMs);
      timeout.unref?.();
      this.pending.set(String(id), { resolve, reject, timeout, method });
      this.write(line).catch((error) => {
        clearTimeout(timeout);
        this.pending.delete(String(id));
        reject(error);
      });
    });
  }

  async notify(method, params) {
    await this.write(this.encode({ method, params }));
  }

  async respond(id, result) {
    await this.write(this.encode({ id, result }));
  }

  async respondError(id, code, message) {
    await this.write(this.encode({ id, error: { code, message } }));
  }

  encode(value) {
    const line = `${JSON.stringify(value)}\n`;
    if (Buffer.byteLength(line, "utf8") > MAXIMUM_REQUEST_BYTES) {
      throw new LauncherError("CODEX_REQUEST_TOO_LARGE", "La solicitud a Codex supera el tamaño permitido.");
    }
    return line;
  }

  async write(line) {
    if (!this.running || !this.child?.stdin.writable) {
      throw new LauncherError("CODEX_NOT_RUNNING", "Codex App Server no está disponible.");
    }
    await new Promise((resolve, reject) => {
      this.child.stdin.write(line, "utf8", (error) => error ? reject(error) : resolve());
    });
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAXIMUM_LINE_BYTES && !this.buffer.includes(0x0a)) {
      this.stop();
      return;
    }
    while (true) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) return;
      const line = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      if (line.length === 0) continue;
      if (line.length > MAXIMUM_LINE_BYTES) {
        this.stop();
        return;
      }
      this.handleLine(line.toString("utf8"));
    }
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.logger.error("Codex emitió JSON inválido.");
      this.stop();
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      this.logger.warn("Codex emitió un mensaje desconocido.");
      return;
    }
    if (
      (typeof message.id === "number" || typeof message.id === "string") &&
      typeof message.method !== "string"
    ) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(String(message.id));
      if (message.error && typeof message.error === "object") {
        pending.reject(new LauncherError(
          "CODEX_RPC_ERROR",
          typeof message.error.message === "string"
            ? message.error.message.slice(0, 500)
            : `Codex rechazó ${pending.method}.`,
        ));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method === "string") {
      if (message.id !== undefined) {
        this.emit("server-request", message);
      } else {
        this.emit("notification", message.method, message.params);
      }
    }
  }

  stop() {
    this.stoppedIntentionally = true;
    const child = this.child;
    this.child = null;
    child?.kill();
    this.buffer = Buffer.alloc(0);
    this.failPending(new LauncherError("CODEX_PROCESS_STOPPED", "Codex App Server se detuvo."));
  }

  handleExit(error) {
    const wasIntentional = this.stoppedIntentionally;
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.failPending(error);
    this.emit("exit", { error, intentional: wasIntentional });
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
