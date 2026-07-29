import {
  access,
  readFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const rootPath = path.resolve(path.dirname(scriptPath), "..");
const expectedApps = Object.freeze([
  { id: "clax", productName: "Clax" },
  { id: "kaikei", productName: "Kaikei" },
  { id: "noman", productName: "Noman" },
]);

async function existingDirectory(candidates) {
  for (const candidate of candidates) {
    const details = await stat(candidate).catch(() => null);
    if (details?.isDirectory()) return candidate;
  }
  return null;
}

export async function verifyPackagedSuite(options) {
  const platform = options.platform;
  const releasePath = options.releasePath;
  const versions = options.versions;
  const resourcesPath = platform === "darwin"
    ? await existingDirectory([
        path.join(releasePath, "mac-arm64", "Cwenti.app", "Contents", "Resources"),
        path.join(releasePath, "mac", "Cwenti.app", "Contents", "Resources"),
        path.join(releasePath, "mac-x64", "Cwenti.app", "Contents", "Resources"),
      ])
    : await existingDirectory([
        path.join(releasePath, "win-unpacked", "resources"),
      ]);
  if (!resourcesPath) {
    throw new Error(`No packaged Cwenti resources were found for ${platform}.`);
  }

  const suiteRoot = path.join(resourcesPath, "bundled-apps");
  const manifest = JSON.parse(
    await readFile(path.join(suiteRoot, "suite-manifest.json"), "utf8"),
  );
  const manifestById = new Map(manifest.apps?.map((app) => [app.id, app]) ?? []);
  if (manifestById.size !== expectedApps.length) {
    throw new Error("The packaged suite manifest must contain exactly three official apps.");
  }

  for (const expected of expectedApps) {
    const entry = manifestById.get(expected.id);
    if (
      entry?.productName !== expected.productName ||
      entry?.version !== versions[expected.id]
    ) {
      throw new Error(`The packaged ${expected.productName} metadata is invalid.`);
    }
    const executable = platform === "darwin"
      ? path.join(
          suiteRoot,
          `${expected.productName}.app`,
          "Contents",
          "MacOS",
          expected.productName,
        )
      : path.join(
          suiteRoot,
          expected.productName,
          `${expected.productName}.exe`,
        );
    const details = await stat(executable).catch(() => null);
    if (!details?.isFile()) {
      throw new Error(`The packaged ${expected.productName} executable is missing.`);
    }
    await access(executable);
  }

  return {
    platform,
    resourcesPath,
    apps: expectedApps.map((app) => ({
      id: app.id,
      version: versions[app.id],
    })),
  };
}

async function run() {
  const registry = JSON.parse(
    await readFile(path.join(rootPath, "registry", "bundled-apps.json"), "utf8"),
  );
  const versions = Object.fromEntries(registry.apps.map((app) => [app.id, app.version]));
  const platform = process.env.CWENTI_BUNDLE_PLATFORM === "win32"
    ? "win32"
    : process.platform;
  if (!["darwin", "win32"].includes(platform)) {
    throw new Error("Packaged suite verification only supports macOS and Windows.");
  }
  const result = await verifyPackagedSuite({
    platform,
    releasePath: path.join(rootPath, "release"),
    versions,
  });
  process.stdout.write(
    `Verified ${result.apps.length} Electron apps in ${result.resourcesPath}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await run();
}
