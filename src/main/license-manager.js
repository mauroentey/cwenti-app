import {
  createPublicKey,
  randomUUID,
  verify,
} from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";
import { AtomicJsonStore, readJsonFile, writeJsonAtomic } from "./storage.js";
import { LauncherError } from "./errors.js";

const LICENSE_FIELDS = [
  "licenseVersion",
  "licenseId",
  "organization",
  "issuedAt",
  "expiresAt",
  "seats",
  "products",
  "features",
];

export function addCalendarDaysUtc(date, days) {
  const result = new Date(date);
  if (Number.isNaN(result.getTime()) || !Number.isInteger(days)) {
    throw new LauncherError("DATE_INVALID", "La fecha de licencia no es válida.");
  }
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function normalizeOrganization(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseDate(value, field) {
  if (typeof value !== "string") {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", `El campo ${field} no es válido.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", `El campo ${field} no es una fecha UTC válida.`);
  }
  return date;
}

export function validateLicenseStructure(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "El archivo de licencia no contiene un objeto válido.");
  }
  const keys = Object.keys(document).sort();
  const expected = [...LICENSE_FIELDS, "signature"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "El archivo contiene campos faltantes o desconocidos.");
  }
  if (document.licenseVersion !== 1) {
    throw new LauncherError("LICENSE_VERSION_UNSUPPORTED", "La versión de licencia no es compatible.");
  }
  if (!/^lic_[A-Za-z0-9_-]{6,120}$/.test(document.licenseId)) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "El identificador de licencia no es válido.");
  }
  if (typeof document.organization !== "string" || document.organization.trim().length < 2 || document.organization.length > 200) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "La organización de la licencia no es válida.");
  }
  const issuedAt = parseDate(document.issuedAt, "issuedAt");
  const expiresAt = parseDate(document.expiresAt, "expiresAt");
  if (expiresAt <= issuedAt) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "La expiración debe ser posterior a la emisión.");
  }
  if (!Number.isInteger(document.seats) || document.seats < 1 || document.seats > 1_000_000) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "La cantidad de usuarios no es válida.");
  }
  for (const field of ["products", "features"]) {
    if (
      !Array.isArray(document[field]) ||
      document[field].length === 0 ||
      document[field].some((item) => typeof item !== "string" || !/^[a-z0-9-]{1,80}$/.test(item))
    ) {
      throw new LauncherError("LICENSE_STRUCTURE_INVALID", `El campo ${field} no es válido.`);
    }
  }
  if (!document.products.includes("launcher") && !document.products.includes("all-official-apps")) {
    throw new LauncherError("LICENSE_PRODUCT_INVALID", "La licencia no incluye este launcher.");
  }
  if (!document.features.includes("commercial-use")) {
    throw new LauncherError("LICENSE_FEATURE_INVALID", "La licencia no autoriza uso comercial.");
  }
  if (typeof document.signature !== "string" || document.signature.length < 40 || document.signature.length > 3_000) {
    throw new LauncherError("LICENSE_STRUCTURE_INVALID", "La firma de licencia no es válida.");
  }
  return { issuedAt, expiresAt };
}

export function verifyLicenseDocument(document, publicKeyBase64, now = new Date()) {
  const { issuedAt, expiresAt } = validateLicenseStructure(document);
  if (
    typeof publicKeyBase64 !== "string" ||
    publicKeyBase64.startsWith("[") ||
    publicKeyBase64.length < 40
  ) {
    throw new LauncherError(
      "LICENSE_KEY_NOT_CONFIGURED",
      "La clave pública de licencias todavía no está configurada en el launcher.",
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch (error) {
    throw new LauncherError("LICENSE_KEY_INVALID", "La clave pública configurada no es válida.", {
      cause: error,
    });
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new LauncherError("LICENSE_KEY_INVALID", "La clave pública debe ser Ed25519.");
  }
  const payload = Object.fromEntries(LICENSE_FIELDS.map((field) => [field, document[field]]));
  const valid = verify(
    null,
    Buffer.from(canonicalJson(payload), "utf8"),
    publicKey,
    Buffer.from(document.signature, "base64"),
  );
  if (!valid) {
    throw new LauncherError("LICENSE_SIGNATURE_INVALID", "La firma no coincide; el archivo fue modificado o no es auténtico.");
  }
  if (issuedAt > now) {
    throw new LauncherError("LICENSE_NOT_ACTIVE", "La licencia todavía no ha entrado en vigencia.");
  }
  return {
    valid: true,
    expired: expiresAt <= now,
    issuedAt,
    expiresAt,
  };
}

export class LicenseManager {
  constructor(options) {
    this.stateStore = new AtomicJsonStore(path.join(options.userDataPath, "license-state.json"), {
      mode: "unselected",
      trialRecord: null,
    });
    this.licensePath = path.join(options.userDataPath, "commercial.license.json");
    this.publicKey = options.publicKey;
    this.launcherVersion = options.launcherVersion;
    this.now = options.now ?? (() => new Date());
  }

  async selectPersonal(declarationAccepted) {
    if (declarationAccepted !== true) {
      throw new LauncherError("DECLARATION_REQUIRED", "Debe confirmar que la información es correcta.");
    }
    return this.stateStore.update((state) => ({
      mode: "personal",
      selectedAt: this.now().toISOString(),
      declarationAccepted: true,
      trialRecord: state.trialRecord ?? (state.mode === "trial" ? state : null),
    }));
  }

  async startTrial(input) {
    if (input?.declarationAccepted !== true || input?.noPriorTrialConfirmed !== true) {
      throw new LauncherError("DECLARATION_REQUIRED", "Debe confirmar la declaración y que la organización no usó la prueba.");
    }
    const organization = typeof input.organization === "string" ? input.organization.trim() : "";
    const normalizedOrganization = normalizeOrganization(organization);
    if (organization.length < 2 || organization.length > 200) {
      throw new LauncherError("ORGANIZATION_INVALID", "Ingrese un nombre de organización válido.");
    }
    if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
      throw new LauncherError("EMAIL_INVALID", "Ingrese un correo corporativo válido.");
    }
    if (typeof input.country !== "string" || input.country.trim().length < 2 || input.country.length > 100) {
      throw new LauncherError("COUNTRY_INVALID", "Ingrese un país válido.");
    }
    const previous = await this.stateStore.read();
    if (previous.mode === "trial" || previous.trialRecord) {
      throw new LauncherError("TRIAL_ALREADY_USED", "Este dispositivo ya registró una prueba comercial.");
    }
    const startedAt = this.now();
    const endsAt = addCalendarDaysUtc(startedAt, 30);
    const trialRecord = {
      organization,
      normalizedOrganization,
      email: input.email.trim().toLocaleLowerCase("en"),
      country: input.country.trim(),
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      launcherVersion: this.launcherVersion,
      localId: randomUUID(),
      declarationAccepted: true,
      noPriorTrialConfirmed: true,
    };
    return this.stateStore.write({
      mode: "trial",
      ...trialRecord,
      trialRecord,
    });
  }

  async activate(document) {
    const verification = verifyLicenseDocument(document, this.publicKey, this.now());
    if (verification.expired) {
      throw new LauncherError("LICENSE_EXPIRED", "La licencia comercial está vencida.");
    }
    await writeJsonAtomic(this.licensePath, document);
    await this.stateStore.update((state) => ({
      mode: "commercial",
      activatedAt: this.now().toISOString(),
      licenseId: document.licenseId,
      trialRecord: state.trialRecord ?? (state.mode === "trial" ? state : null),
    }));
    return this.getStatus();
  }

  async removeCommercialLicense() {
    await rm(this.licensePath, { force: true });
    await this.stateStore.update((state) => ({
      mode: "unselected",
      trialRecord: state.trialRecord ?? null,
    }));
    return this.getStatus();
  }

  async getStatus() {
    const state = await this.stateStore.read();
    if (state.mode === "personal") {
      return {
        mode: "personal",
        canRun: true,
        commercialUseAllowed: false,
        message: "Uso personal y no comercial. No autoriza usos comerciales.",
      };
    }
    if (state.mode === "trial") {
      const trial = state.trialRecord ?? state;
      const endsAt = new Date(trial.endsAt);
      const expired = endsAt <= this.now();
      return {
        mode: expired ? "trial-expired" : "trial",
        canRun: !expired,
        commercialUseAllowed: !expired,
        organization: trial.organization,
        startedAt: trial.startedAt,
        endsAt: trial.endsAt,
        localId: trial.localId,
        message: expired
          ? "La prueba terminó. Sus datos permanecen disponibles para exportación."
          : "Prueba comercial activa.",
      };
    }
    if (state.mode === "commercial") {
      const document = await readJsonFile(this.licensePath, null);
      if (!document) {
        return {
          mode: "invalid",
          canRun: false,
          commercialUseAllowed: false,
          message: "No se encontró el archivo de licencia activado.",
        };
      }
      try {
        const verification = verifyLicenseDocument(document, this.publicKey, this.now());
        return {
          mode: verification.expired ? "commercial-expired" : "commercial",
          canRun: !verification.expired,
          commercialUseAllowed: !verification.expired,
          organization: document.organization,
          expiresAt: document.expiresAt,
          seats: document.seats,
          products: document.products,
          features: document.features,
          licenseId: document.licenseId,
          message: verification.expired ? "La licencia comercial está vencida." : "Licencia comercial activa.",
        };
      } catch (error) {
        return {
          mode: "invalid",
          canRun: false,
          commercialUseAllowed: false,
          message: error.message,
        };
      }
    }
    return {
      mode: "unselected",
      canRun: false,
      commercialUseAllowed: false,
      message: "Seleccione una modalidad de uso para continuar.",
    };
  }
}
