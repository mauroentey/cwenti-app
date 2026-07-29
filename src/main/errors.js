export class LauncherError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "LauncherError";
    this.code = code;
    this.safeDetails = options.safeDetails ?? null;
  }
}

export function toPublicError(error) {
  if (error instanceof LauncherError) {
    return {
      code: error.code,
      message: error.message,
      details: error.safeDetails,
    };
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: "Ocurrió un error inesperado. Consulte Actividad o exporte el diagnóstico.",
    details: null,
  };
}
