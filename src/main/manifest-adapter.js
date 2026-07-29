import { LauncherError } from "./errors.js";
import { assertSafeRelativePath } from "./paths.js";

const APP_ID = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Convierte metadatos explícitos de una aplicación existente al contrato del
 * launcher. No adivina descripciones, permisos ni rutas.
 */
export function adaptLegacyManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new LauncherError("ADAPTER_INPUT_INVALID", "Los metadatos de adaptación no son válidos.");
  }
  const requiredStrings = [
    "id",
    "name",
    "version",
    "description",
    "author",
    "entry",
    "icon",
    "instructions",
  ];
  for (const field of requiredStrings) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0) {
      throw new LauncherError("ADAPTER_FIELD_REQUIRED", `Debe proporcionar ${field}.`);
    }
  }
  if (!APP_ID.test(input.id) || !SEMVER.test(input.version)) {
    throw new LauncherError("ADAPTER_FIELD_INVALID", "El ID o la versión no son válidos.");
  }
  for (const field of ["entry", "icon", "instructions", "previewImage"]) {
    if (input[field]) assertSafeRelativePath(input[field]);
  }
  const permissionKeys = ["filesystem", "shell", "network", "externalLinks"];
  if (!input.permissions || !input.permissionReasons) {
    throw new LauncherError("ADAPTER_PERMISSIONS_REQUIRED", "Debe declarar permisos y justificaciones.");
  }
  for (const key of permissionKeys) {
    if (!input.permissions[key] || typeof input.permissionReasons[key] !== "string") {
      throw new LauncherError("ADAPTER_PERMISSIONS_REQUIRED", `Debe declarar y justificar ${key}.`);
    }
  }
  return {
    schemaVersion: 1,
    id: input.id,
    name: input.name.trim(),
    version: input.version,
    description: input.description.trim(),
    author: input.author.trim(),
    ...(input.repository ? { repository: input.repository } : {}),
    ...(input.homepage ? { homepage: input.homepage } : {}),
    entry: input.entry,
    icon: input.icon,
    ...(input.previewImage ? { previewImage: input.previewImage } : {}),
    instructions: input.instructions,
    license: "Prosperity-3.0.0",
    minimumLauncherVersion: input.minimumLauncherVersion ?? "0.1.0",
    supportedPlatforms: input.supportedPlatforms ?? ["darwin", "win32"],
    supportedArchitectures: input.supportedArchitectures ?? ["x64", "arm64"],
    permissions: structuredClone(input.permissions),
    permissionReasons: structuredClone(input.permissionReasons),
    declaredExecutables: structuredClone(input.declaredExecutables ?? []),
  };
}
