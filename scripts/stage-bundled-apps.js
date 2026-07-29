import {
  access,
  cp,
  lstat,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootPath = path.resolve(path.dirname(scriptPath), "..");
const platform = process.env.CWENTI_BUNDLE_PLATFORM?.trim() || process.platform;
const platformDirectory = platform === "win32" ? "win32" : "darwin";
const documentsPath = path.join(os.homedir(), "Documents");
const destinationRoot = path.join(rootPath, "bundled-apps", platformDirectory);

const definitions = platform === "win32"
  ? [
      {
        id: "clax",
        name: "Clax",
        env: "CWENTI_CLAX_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "win32", "Clax"),
          path.join(documentsPath, "Build", "release", "win-unpacked"),
        ],
      },
      {
        id: "kaikei",
        name: "Kaikei",
        env: "CWENTI_KAIKEI_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "win32", "Kaikei"),
          path.join(documentsPath, "Kaikei", "release", "win-unpacked"),
        ],
      },
      {
        id: "noman",
        name: "Noman",
        env: "CWENTI_NOMAN_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "win32", "Noman"),
          path.join(documentsPath, "noman", "release", "win-unpacked"),
        ],
      },
    ]
  : [
      {
        id: "clax",
        name: "Clax",
        env: "CWENTI_CLAX_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "darwin", "Clax.app"),
          path.join(documentsPath, "Build", "release", "mac-arm64", "Clax.app"),
          "/Applications/Clax.app",
        ],
      },
      {
        id: "kaikei",
        name: "Kaikei",
        env: "CWENTI_KAIKEI_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "darwin", "Kaikei.app"),
          path.join(documentsPath, "Kaikei", "release", "mac-arm64", "Kaikei.app"),
          path.join(documentsPath, "Kaikei", "release", "mac", "Kaikei.app"),
          "/Applications/Kaikei.app",
        ],
      },
      {
        id: "noman",
        name: "Noman",
        env: "CWENTI_NOMAN_APP",
        fallbacks: [
          path.join(rootPath, ".suite-downloads", "darwin", "Noman.app"),
          path.join(documentsPath, "noman", "release", "mac-arm64", "Noman.app"),
          path.join(documentsPath, "noman", "release", "Noman para macOS", "Noman.app"),
          "/Applications/Noman.app",
        ],
      },
    ];

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveSource(definition) {
  const configured = process.env[definition.env]?.trim();
  const candidates = configured ? [configured] : definition.fallbacks;
  for (const candidate of candidates) {
    if (await exists(candidate)) return path.resolve(candidate);
  }
  throw new Error(
    `No se encontró ${definition.name}. Configure ${definition.env} con la ruta de su build empaquetado.`,
  );
}

async function normalizeWindowsSource(source, appName) {
  const details = await lstat(source);
  const directory = details.isDirectory() ? source : path.dirname(source);
  const executable = path.join(directory, `${appName}.exe`);
  if (!(await exists(executable))) {
    throw new Error(`${directory} no contiene ${appName}.exe.`);
  }
  return directory;
}

await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });

const manifest = {
  createdAt: new Date().toISOString(),
  platform,
  apps: [],
};

for (const definition of definitions) {
  let source = await resolveSource(definition);
  if (platform === "win32") {
    source = await normalizeWindowsSource(source, definition.name);
  } else if (path.basename(source) !== `${definition.name}.app`) {
    throw new Error(`${source} no es ${definition.name}.app.`);
  }

  const destination = platform === "win32"
    ? path.join(destinationRoot, definition.name)
    : path.join(destinationRoot, `${definition.name}.app`);
  process.stdout.write(`Incluyendo ${definition.name} desde ${source}\n`);
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
  });
  manifest.apps.push({
    id: definition.id,
    productName: definition.name,
    relativePath: path.relative(destinationRoot, destination),
  });
}

await writeFile(
  path.join(destinationRoot, "suite-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`Suite preparada en ${destinationRoot}\n`);
