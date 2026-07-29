import { readFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { LauncherError } from "./errors.js";
import {
  loadJsonSchema,
  validateRegistryDocument,
} from "./manifest-validator.js";

async function fetchJsonLimited(url, options) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new LauncherError("REGISTRY_URL_INVALID", "El registro remoto debe usar HTTPS.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new LauncherError("REGISTRY_DOWNLOAD_FAILED", `El registro respondió con estado ${response.status}.`);
    }
    if (new URL(response.url).protocol !== "https:") {
      throw new LauncherError("REGISTRY_URL_INVALID", "El registro redirigió a un protocolo no permitido.");
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > options.maximumBytes) {
      throw new LauncherError("REGISTRY_TOO_LARGE", "El registro remoto supera el tamaño permitido.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > options.maximumBytes) {
      throw new LauncherError("REGISTRY_TOO_LARGE", "El registro remoto supera el tamaño permitido.");
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new LauncherError("REGISTRY_JSON_INVALID", "El registro remoto no contiene JSON válido.", {
        cause: error,
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new LauncherError("REGISTRY_TIMEOUT", "La consulta del registro agotó el tiempo de espera.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export class RegistryManager {
  constructor(options) {
    this.rootPath = options.rootPath;
    this.registryUrl = options.registryUrl;
    this.timeoutMs = options.timeoutMs;
    this.logger = options.logger;
    this.schema = null;
    this.bundled = null;
    this.remote = null;
  }

  async initialize() {
    this.schema = await loadJsonSchema(path.join(this.rootPath, "registry", "registry.schema.json"));
    const bundledPath = path.join(this.rootPath, "registry", "bundled-apps.json");
    this.bundled = validateRegistryDocument(
      JSON.parse(await readFile(bundledPath, "utf8")),
      this.schema,
    );
    return this.getCatalog();
  }

  async refresh() {
    if (
      typeof this.registryUrl !== "string" ||
      this.registryUrl.length === 0 ||
      this.registryUrl.startsWith("[")
    ) {
      return this.getCatalog();
    }
    try {
      const document = await fetchJsonLimited(this.registryUrl, {
        timeoutMs: this.timeoutMs,
        maximumBytes: 2 * 1024 * 1024,
      });
      validateRegistryDocument(document, this.schema);
      const officialIds = new Set(this.bundled.apps.map((app) => app.id));
      for (const app of document.apps) {
        if (!officialIds.has(app.id)) {
          throw new LauncherError(
            "REGISTRY_APP_NOT_OFFICIAL",
            `El registro remoto contiene una aplicación no incluida en la lista oficial: ${app.id}.`,
          );
        }
        if (app.availability !== "remote") {
          throw new LauncherError("REGISTRY_SOURCE_INVALID", "Las actualizaciones remotas deben declarar disponibilidad remote.");
        }
      }
      this.remote = document;
      this.logger.info("Registro oficial actualizado.", {
        generatedAt: document.generatedAt,
        appCount: document.apps.length,
      });
    } catch (error) {
      this.logger.warn("No se pudo actualizar el registro oficial.", { message: error.message });
    }
    return this.getCatalog();
  }

  getCatalog() {
    if (!this.bundled) {
      throw new LauncherError("REGISTRY_NOT_READY", "El registro todavía no está inicializado.");
    }
    const remoteById = new Map((this.remote?.apps ?? []).map((app) => [app.id, app]));
    return this.bundled.apps.map((bundledApp) => {
      const remoteApp = remoteById.get(bundledApp.id);
      if (remoteApp && semver.gt(remoteApp.version, bundledApp.version)) {
        return {
          ...bundledApp,
          ...remoteApp,
          name: bundledApp.name,
          description: bundledApp.description,
          category: bundledApp.category,
        };
      }
      return structuredClone(bundledApp);
    });
  }

  getApp(appId) {
    const app = this.getCatalog().find((candidate) => candidate.id === appId);
    if (!app) throw new LauncherError("APP_NOT_FOUND", "La aplicación no está en el registro oficial.");
    return app;
  }
}
