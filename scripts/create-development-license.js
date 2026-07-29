import {
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../src/main/license-manager.js";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const organization = argument("organization", "Organización de desarrollo");
const outputPath = path.resolve(argument("out", "development-licenses/development.license.json"));
const keyDirectory = path.resolve(argument("key-dir", "development-licenses/keys"));
const days = Number(argument("days", "30"));
if (!Number.isInteger(days) || days < 1 || days > 3_650) {
  throw new Error("--days debe ser un entero entre 1 y 3650.");
}

await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
const privateKeyPath = path.join(keyDirectory, "development-private.pem");
const publicKeyPath = path.join(keyDirectory, "development-public.der.base64.txt");
let privateKey;
if (await stat(privateKeyPath).then(() => true).catch(() => false)) {
  privateKey = await readFile(privateKeyPath);
} else {
  const pair = generateKeyPairSync("ed25519");
  privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" });
  const publicDer = pair.publicKey.export({ format: "der", type: "spki" });
  await writeFile(privateKeyPath, privateKey, { mode: 0o600, flag: "wx" });
  await writeFile(publicKeyPath, `${publicDer.toString("base64")}\n`, { mode: 0o600, flag: "wx" });
}

const issuedAt = new Date();
const expiresAt = new Date(issuedAt);
expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
const payload = {
  licenseVersion: 1,
  licenseId: `lic_dev_${randomUUID().replaceAll("-", "")}`,
  organization,
  issuedAt: issuedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
  seats: 25,
  products: ["launcher", "all-official-apps"],
  features: ["commercial-use", "updates"],
};
const signature = sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString("base64");
await writeFile(outputPath, `${JSON.stringify({ ...payload, signature }, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
});
process.stdout.write([
  `Licencia de desarrollo creada en ${outputPath}`,
  `Clave pública en ${publicKeyPath}`,
  "Copie la clave pública Base64 a config/product.config.js solo para pruebas locales.",
  "La clave privada y development-licenses/ están excluidas de Git y del paquete.",
  "",
].join("\n"));
