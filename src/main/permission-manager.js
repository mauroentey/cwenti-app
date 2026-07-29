import { AtomicJsonStore } from "./storage.js";
import { safeAppDataPath } from "./paths.js";
import { LauncherError } from "./errors.js";

export class PermissionManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.stores = new Map();
  }

  storeFor(appId) {
    if (!this.stores.has(appId)) {
      const filePath = safeAppDataPath(this.userDataPath, appId, "permissions.json");
      this.stores.set(appId, new AtomicJsonStore(filePath, { consent: null }));
    }
    return this.stores.get(appId);
  }

  async getConsent(appId, manifest) {
    const state = await this.storeFor(appId).read();
    const consent = state.consent;
    const samePermissions = consent &&
      JSON.stringify(consent.permissions) === JSON.stringify(manifest.permissions);
    return {
      accepted: Boolean(consent?.accepted && samePermissions),
      acceptedAt: consent?.acceptedAt ?? null,
      permissions: manifest.permissions,
      reasons: manifest.permissionReasons,
    };
  }

  async accept(appId, manifest, declarationAccepted) {
    if (declarationAccepted !== true) {
      throw new LauncherError("PERMISSION_CONSENT_REQUIRED", "Debe aceptar los permisos para abrir la aplicación.");
    }
    const consent = {
      accepted: true,
      acceptedAt: new Date().toISOString(),
      manifestVersion: manifest.version,
      permissions: manifest.permissions,
      reasons: manifest.permissionReasons,
    };
    await this.storeFor(appId).write({ consent });
    return consent;
  }

  async revoke(appId) {
    await this.storeFor(appId).write({ consent: null });
    return { accepted: false };
  }
}
