import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { productConfig } from "../config/product.config.js";

const rootUrl = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, rootUrl), "utf8");
}

function fingerprint(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, "base64");
  const key = createPublicKey({
    key: der,
    format: "der",
    type: "spki",
  });
  assert.equal(key.asymmetricKeyType, "ed25519");
  return createHash("sha256").update(der).digest("hex");
}

test("repository metadata consistently applies Prosperity 3.0.0", async () => {
  const packageMetadata = JSON.parse(await read("package.json"));
  const packageLock = JSON.parse(await read("package-lock.json"));
  const license = await read("LICENSE");
  const builderConfig = await read("electron-builder.config.js");

  assert.equal(packageMetadata.license, "SEE LICENSE IN LICENSE");
  assert.equal(packageLock.packages[""].license, "SEE LICENSE IN LICENSE");
  assert.match(license, /^# The Prosperity Public License 3\.0\.0/m);
  assert.match(license, /^Contributor: Mauricio Samper$/m);
  assert.match(license, /^Source Code: https:\/\/github\.com\/mauroentey\/cwenti-app$/m);
  for (const legalFile of [
    "LICENSE",
    "COMMERCIAL-LICENSE.md",
    "TRADEMARKS.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.match(builderConfig, new RegExp(`"${legalFile.replace(".", "\\.")}"`));
  }
});

test("production Ed25519 public keys are configured and distinct", () => {
  assert.equal(
    fingerprint(productConfig.licensePublicKeyEd25519),
    "12f9980ad1bc43b70aefdeeb40362191e49bd0ffefad25423bde149d1ac6b504",
  );
  assert.equal(
    fingerprint(productConfig.packagePublicKeyEd25519),
    "a3515f5ae8bd13ebdec13faf9e60bfb0e5f1155b003f0be2251331c935b88f54",
  );
  assert.notEqual(productConfig.licensePublicKeyEd25519, productConfig.packagePublicKeyEd25519);
});

test("third-party notices do not mislabel Cwenti as an unlicensed dependency", async () => {
  const notices = await read("THIRD_PARTY_NOTICES.md");
  assert.doesNotMatch(notices, /\|\s*cwenti@/i);
  assert.doesNotMatch(notices, /\|\s*official-apps-launcher@/i);
});
