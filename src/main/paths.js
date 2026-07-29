import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { LauncherError } from "./errors.js";

const SAFE_RELATIVE_PATH = /^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._@() -]+(?:\/[A-Za-z0-9._@() -]+)*$/;

export function assertSafeRelativePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length > 240 ||
    !SAFE_RELATIVE_PATH.test(relativePath)
  ) {
    throw new LauncherError("PATH_INVALID", "La ruta relativa no es válida.");
  }
  return relativePath;
}

export function isPathInside(rootPath, candidatePath, allowRoot = false) {
  const difference = path.relative(rootPath, candidatePath);
  if (difference === "") return allowRoot;
  return !difference.startsWith("..") && !path.isAbsolute(difference);
}

export async function resolveExistingInside(rootPath, relativePath, options = {}) {
  assertSafeRelativePath(relativePath);
  const rootRealPath = await realpath(rootPath);
  const candidatePath = path.resolve(rootRealPath, relativePath);
  if (!isPathInside(rootRealPath, candidatePath)) {
    throw new LauncherError("PATH_ESCAPE", "La ruta intenta salir del workspace.");
  }
  const candidateRealPath = await realpath(candidatePath);
  if (!isPathInside(rootRealPath, candidateRealPath, options.allowRoot === true)) {
    throw new LauncherError("SYMLINK_ESCAPE", "Un enlace simbólico intenta salir del workspace.");
  }
  if (options.type) {
    const stats = await lstat(candidateRealPath);
    if (options.type === "file" && !stats.isFile()) {
      throw new LauncherError("PATH_NOT_FILE", "La ruta seleccionada no es un archivo.");
    }
    if (options.type === "directory" && !stats.isDirectory()) {
      throw new LauncherError("PATH_NOT_DIRECTORY", "La ruta seleccionada no es una carpeta.");
    }
  }
  return candidateRealPath;
}

export async function resolveWritableInside(rootPath, relativePath) {
  assertSafeRelativePath(relativePath);
  const rootRealPath = await realpath(rootPath);
  const candidatePath = path.resolve(rootRealPath, relativePath);
  if (!isPathInside(rootRealPath, candidatePath)) {
    throw new LauncherError("PATH_ESCAPE", "La ruta intenta salir del workspace.");
  }
  const parentRealPath = await realpath(path.dirname(candidatePath));
  if (!isPathInside(rootRealPath, parentRealPath, true)) {
    throw new LauncherError("SYMLINK_ESCAPE", "Un enlace simbólico intenta salir del workspace.");
  }
  return candidatePath;
}

export function safeAppDataPath(basePath, appId, ...segments) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(appId)) {
    throw new LauncherError("APP_ID_INVALID", "El identificador de aplicación no es válido.");
  }
  const root = path.join(basePath, "apps-data", appId);
  const candidate = path.join(root, ...segments);
  if (!isPathInside(root, candidate, true)) {
    throw new LauncherError("PATH_ESCAPE", "La ruta de datos de aplicación no es válida.");
  }
  return candidate;
}
