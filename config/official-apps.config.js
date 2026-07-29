import path from "node:path";

/**
 * Ubicaciones conocidas de las tres aplicaciones oficiales existentes.
 * Las rutas elegidas manualmente se guardan en userData y tienen prioridad.
 */
export function officialAppDefinitions(documentsPath, bundledAppsPath = null) {
  const bundled = (macName, windowsName) => ({
    darwin: bundledAppsPath ? [path.join(bundledAppsPath, macName)] : [],
    win32: bundledAppsPath ? [path.join(bundledAppsPath, windowsName, `${windowsName}.exe`)] : [],
  });

  return Object.freeze({
    clax: {
      productName: "Clax",
      expectedNames: ["Clax.app", "Clax.exe"],
      bundledCandidates: bundled("Clax.app", "Clax"),
      candidates: {
        darwin: [
          "/Applications/Clax.app",
          path.join(documentsPath, "Build", "release", "mac-arm64", "Clax.app"),
        ],
        win32: [
          path.join(documentsPath, "Build", "release", "win-unpacked", "Clax.exe"),
        ],
      },
    },
    kaikei: {
      productName: "Kaikei",
      expectedNames: ["Kaikei.app", "Kaikei.exe"],
      bundledCandidates: bundled("Kaikei.app", "Kaikei"),
      candidates: {
        darwin: [
          "/Applications/Kaikei.app",
          path.join(documentsPath, "Kaikei", "release", "mac-arm64", "Kaikei.app"),
          path.join(documentsPath, "Kaikei", "release", "mac", "Kaikei.app"),
        ],
        win32: [
          path.join(documentsPath, "Kaikei", "release", "win-unpacked", "Kaikei.exe"),
        ],
      },
    },
    noman: {
      productName: "Noman",
      expectedNames: ["Noman.app", "Noman.exe"],
      bundledCandidates: bundled("Noman.app", "Noman"),
      candidates: {
        darwin: [
          "/Applications/Noman.app",
          path.join(documentsPath, "noman", "release", "mac-arm64", "Noman.app"),
          path.join(documentsPath, "noman", "release", "Noman para macOS", "Noman.app"),
        ],
        win32: [
          path.join(documentsPath, "noman", "release", "win-unpacked", "Noman.exe"),
        ],
      },
    },
  });
}
