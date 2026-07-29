import { spawn } from "node:child_process";
import {
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { AtomicJsonStore } from "./storage.js";
import { LauncherError } from "./errors.js";

export class LegacyAppManager {
  constructor(options) {
    this.definitions = options.definitions;
    this.logger = options.logger;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.store = new AtomicJsonStore(path.join(options.userDataPath, "official-app-paths.json"), {
      paths: {},
    });
  }

  definition(appId) {
    const definition = this.definitions[appId];
    if (!definition) {
      throw new LauncherError("APP_NOT_OFFICIAL", "La aplicación no pertenece a la suite Cwenti.");
    }
    return definition;
  }

  async validatePath(appId, candidatePath) {
    const definition = this.definition(appId);
    const actualPath = await realpath(candidatePath);
    const details = await lstat(actualPath);
    const expectedDirectory = process.platform === "darwin";
    if ((expectedDirectory && !details.isDirectory()) || (!expectedDirectory && !details.isFile())) {
      throw new LauncherError("OFFICIAL_APP_PATH_INVALID", "La ubicación seleccionada no contiene una aplicación válida.");
    }
    const name = path.basename(actualPath).toLocaleLowerCase("en");
    if (!definition.expectedNames.some((expected) => expected.toLocaleLowerCase("en") === name)) {
      throw new LauncherError(
        "OFFICIAL_APP_NAME_MISMATCH",
        `Seleccione ${definition.productName}, no ${path.basename(actualPath)}.`,
      );
    }
    return actualPath;
  }

  async resolve(appId) {
    const definition = this.definition(appId);
    const state = await this.store.read();
    const candidates = [
      ...(definition.bundledCandidates?.[process.platform] ?? []),
      state.paths?.[appId],
      ...(definition.candidates[process.platform] ?? []),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        return await this.validatePath(appId, candidate);
      } catch {
        // Continue through known locations.
      }
    }
    return null;
  }

  async getStatus(appId) {
    const appPath = await this.resolve(appId);
    return {
      available: Boolean(appPath),
      appPath,
      productName: this.definition(appId).productName,
    };
  }

  async register(appId, selectedPath) {
    const appPath = await this.validatePath(appId, selectedPath);
    await this.store.update((state) => ({
      ...state,
      paths: { ...(state.paths ?? {}), [appId]: appPath },
    }));
    return this.getStatus(appId);
  }

  async open(appId) {
    const appPath = await this.resolve(appId);
    if (!appPath) {
      throw new LauncherError(
        "OFFICIAL_APP_NOT_FOUND",
        `${this.definition(appId).productName} no está localizada. Seleccione su aplicación instalada.`,
      );
    }
    if (process.platform === "darwin") {
      this.spawnProcess("/usr/bin/open", [appPath], {
        detached: true,
        stdio: "ignore",
        shell: false,
      }).unref();
    } else if (process.platform === "win32") {
      this.spawnProcess(appPath, [], {
        detached: true,
        stdio: "ignore",
        shell: false,
        windowsHide: false,
      }).unref();
    } else {
      throw new LauncherError("PLATFORM_UNSUPPORTED", "Cwenti solo admite macOS y Windows.");
    }
    this.logger.info("Aplicación oficial abierta.", { appId });
    return { appId, opened: true };
  }
}
