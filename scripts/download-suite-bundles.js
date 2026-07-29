import { createWriteStream } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import extract from "extract-zip";
import { copyBundle } from "./copy-bundle.js";

const scriptPath = fileURLToPath(import.meta.url);
const rootPath = path.resolve(path.dirname(scriptPath), "..");
const platform = process.env.CWENTI_BUNDLE_PLATFORM?.trim() || process.platform;
const platformDirectory = platform === "win32" ? "win32" : "darwin";
const destinationRoot = path.join(rootPath, ".suite-downloads", platformDirectory);
const token = process.env.CWENTI_BUNDLE_TOKEN?.trim();

const definitions = [
  { id: "clax", name: "Clax", env: "CWENTI_CLAX_BUNDLE_URL" },
  { id: "kaikei", name: "Kaikei", env: "CWENTI_KAIKEI_BUNDLE_URL" },
  { id: "noman", name: "Noman", env: "CWENTI_NOMAN_BUNDLE_URL" },
];

async function findEntry(directory, expectedName) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.name.toLocaleLowerCase("en") === expectedName.toLocaleLowerCase("en")) {
      return candidate;
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const nested = await findEntry(candidate, expectedName);
      if (nested) return nested;
    }
  }
  return null;
}

async function download(url, target) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`La URL de ${parsed.hostname} debe usar HTTPS.`);
  }
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(parsed, { headers, redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar ${parsed.hostname}: HTTP ${response.status}.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { flags: "wx" }));
}

await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });

for (const definition of definitions) {
  const bundleUrl = process.env[definition.env]?.trim();
  if (!bundleUrl) {
    throw new Error(`Configure ${definition.env} con el ZIP publicado de ${definition.name}.`);
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `cwenti-${definition.id}-`));
  try {
    const archivePath = path.join(temporaryRoot, "bundle.zip");
    const extractedPath = path.join(temporaryRoot, "extracted");
    await mkdir(extractedPath);
    process.stdout.write(`Descargando ${definition.name}…\n`);
    await download(bundleUrl, archivePath);
    await extract(archivePath, { dir: extractedPath });

    const expectedName = platform === "win32"
      ? `${definition.name}.exe`
      : `${definition.name}.app`;
    const entry = await findEntry(extractedPath, expectedName);
    if (!entry) {
      throw new Error(`El ZIP de ${definition.name} no contiene ${expectedName}.`);
    }

    const source = platform === "win32" ? path.dirname(entry) : entry;
    const destination = platform === "win32"
      ? path.join(destinationRoot, definition.name)
      : path.join(destinationRoot, expectedName);
    await copyBundle(source, destination);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

process.stdout.write(`Builds descargados en ${destinationRoot}\n`);
