import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addCalendarDaysUtc,
  canonicalJson,
  LicenseManager,
  verifyLicenseDocument,
} from "../src/main/license-manager.js";

function fixture(overrides = {}) {
  const pair = generateKeyPairSync("ed25519");
  const payload = {
    licenseVersion: 1,
    licenseId: "lic_test_123456",
    organization: "Empresa Ejemplo S.A.S.",
    issuedAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2027-07-01T00:00:00.000Z",
    seats: 25,
    products: ["launcher", "all-official-apps"],
    features: ["commercial-use", "updates"],
    ...overrides,
  };
  const signature = sign(null, Buffer.from(canonicalJson(payload)), pair.privateKey).toString("base64");
  return {
    document: { ...payload, signature },
    publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

test("la prueba termina exactamente 30 días calendario después", () => {
  const start = new Date("2026-01-31T18:42:10.000Z");
  assert.equal(addCalendarDaysUtc(start, 30).toISOString(), "2026-03-02T18:42:10.000Z");
});

test("una licencia Ed25519 vigente se valida", () => {
  const { document, publicKey } = fixture();
  const result = verifyLicenseDocument(document, publicKey, new Date("2026-08-01T00:00:00.000Z"));
  assert.equal(result.valid, true);
  assert.equal(result.expired, false);
});

test("una licencia vencida conserva validación criptográfica pero marca expiración", () => {
  const { document, publicKey } = fixture();
  const result = verifyLicenseDocument(document, publicKey, new Date("2028-01-01T00:00:00.000Z"));
  assert.equal(result.expired, true);
});

test("una firma de otra clave se rechaza", () => {
  const first = fixture();
  const second = fixture();
  assert.throws(
    () => verifyLicenseDocument(first.document, second.publicKey, new Date("2026-08-01T00:00:00.000Z")),
    { code: "LICENSE_SIGNATURE_INVALID" },
  );
});

test("modificar un archivo firmado invalida la licencia", () => {
  const { document, publicKey } = fixture();
  const modified = { ...document, seats: 500 };
  assert.throws(
    () => verifyLicenseDocument(modified, publicKey, new Date("2026-08-01T00:00:00.000Z")),
    { code: "LICENSE_SIGNATURE_INVALID" },
  );
});

test("una prueba vencida bloquea ejecución sin borrar el estado", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "launcher-license-"));
  const manager = new LicenseManager({
    userDataPath: directory,
    publicKey: fixture().publicKey,
    launcherVersion: "0.1.0",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  await manager.startTrial({
    organization: "Ejemplo S.A.S.",
    email: "legal@example.com",
    country: "Colombia",
    declarationAccepted: true,
    noPriorTrialConfirmed: true,
  });
  manager.now = () => new Date("2026-08-01T00:00:00.000Z");
  const status = await manager.getStatus();
  assert.equal(status.mode, "trial-expired");
  assert.equal(status.canRun, false);
  assert.equal(status.organization, "Ejemplo S.A.S.");
});
