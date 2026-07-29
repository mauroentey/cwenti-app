import { appendFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const REDACTIONS = [
  /(?:sk|sess|token|key)-[A-Za-z0-9_-]{12,}/gi,
  /authorization\s*:\s*bearer\s+\S+/gi,
  /"?(?:accessToken|refreshToken|apiKey|signature)"?\s*:\s*"[^"]+"/gi,
];

function sanitize(value) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  for (const pattern of REDACTIONS) text = text.replace(pattern, "[REDACTED]");
  return text.slice(0, 8_000);
}

export class LocalLogger {
  constructor(directoryPath) {
    this.directoryPath = directoryPath;
    this.filePath = path.join(directoryPath, "launcher.log");
    this.queue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directoryPath, { recursive: true, mode: 0o700 });
    await this.prune();
  }

  info(message, details) {
    this.write("info", message, details);
  }

  warn(message, details) {
    this.write("warn", message, details);
  }

  error(message, details) {
    this.write("error", message, details);
  }

  write(level, message, details) {
    const entry = {
      at: new Date().toISOString(),
      level,
      message: sanitize(message),
      ...(details === undefined ? {} : { details: sanitize(details) }),
    };
    this.queue = this.queue
      .then(async () => {
        await this.rotateIfNeeded();
        await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
      })
      .catch(() => undefined);
  }

  async rotateIfNeeded() {
    const details = await stat(this.filePath).catch(() => null);
    if (!details || details.size < MAX_LOG_BYTES) return;
    const archivePath = path.join(this.directoryPath, `launcher-${Date.now()}.log`);
    await rename(this.filePath, archivePath);
  }

  async prune() {
    const now = Date.now();
    const entries = await readdir(this.directoryPath, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !/^launcher-\d+\.log$/.test(entry.name)) return;
      const filePath = path.join(this.directoryPath, entry.name);
      const details = await stat(filePath).catch(() => null);
      if (details && now - details.mtimeMs > MAX_LOG_AGE_MS) {
        await rm(filePath, { force: true });
      }
    }));
  }
}
