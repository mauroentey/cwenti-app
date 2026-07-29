import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LauncherError } from "./errors.js";

const MAXIMUM_JSON_BYTES = 5 * 1024 * 1024;

export async function ensurePrivateDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
}

export async function readJsonFile(filePath, fallback = null) {
  try {
    const text = await readFile(filePath, { encoding: "utf8", flag: "r" });
    if (Buffer.byteLength(text, "utf8") > MAXIMUM_JSON_BYTES) {
      throw new LauncherError("JSON_TOO_LARGE", "El archivo local supera el tamaño permitido.");
    }
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) {
      throw new LauncherError("JSON_INVALID", "Un archivo local contiene JSON inválido.", {
        cause: error,
      });
    }
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  const directoryPath = path.dirname(filePath);
  await ensurePrivateDirectory(directoryPath);
  const encoded = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(encoded, "utf8") > MAXIMUM_JSON_BYTES) {
    throw new LauncherError("JSON_TOO_LARGE", "Los datos locales superan el tamaño permitido.");
  }
  const temporaryPath = path.join(directoryPath, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(encoded, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export class AtomicJsonStore {
  constructor(filePath, defaultValue = {}) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this.queue = Promise.resolve();
  }

  async read() {
    const value = await readJsonFile(this.filePath, this.defaultValue);
    return structuredClone(value);
  }

  async write(value) {
    this.queue = this.queue.then(() => writeJsonAtomic(this.filePath, value));
    await this.queue;
    return structuredClone(value);
  }

  async update(updater) {
    let result;
    this.queue = this.queue.then(async () => {
      const current = await readJsonFile(this.filePath, this.defaultValue);
      result = await updater(structuredClone(current));
      await writeJsonAtomic(this.filePath, result);
    });
    await this.queue;
    return structuredClone(result);
  }
}
