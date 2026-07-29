import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSuiteLock } from "../scripts/download-suite-bundles.js";

const versions = Object.freeze({
  clax: "0.1.6",
  kaikei: "0.1.2",
  noman: "0.1.2",
});

function artifact(repository, version, platform = "darwin-arm64") {
  return {
    url: `https://github.com/${repository}/releases/download/v${version}/app-${platform}.zip`,
    sha256: "a".repeat(64),
    sizeBytes: 42,
  };
}

function fixture() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-29T00:00:00.000Z",
    apps: {
      clax: {
        version: versions.clax,
        repository: "mauroentey/Clax",
        artifacts: {
          "darwin-arm64": artifact("mauroentey/Clax", versions.clax),
        },
      },
      kaikei: {
        version: versions.kaikei,
        repository: "mauroentey/kaikei",
        artifacts: {
          "darwin-arm64": artifact("mauroentey/kaikei", versions.kaikei),
        },
      },
      noman: {
        version: versions.noman,
        repository: "mauroentey/noman-wa",
        artifacts: {
          "darwin-arm64": artifact("mauroentey/noman-wa", versions.noman),
        },
      },
    },
  };
}

test("suite lock accepts only the versioned official Electron releases", () => {
  const definitions = validateSuiteLock(fixture(), {
    platform: "darwin",
    arch: "arm64",
    versions,
  });
  assert.deepEqual(
    definitions.map(({ id, version, repository }) => ({ id, version, repository })),
    [
      { id: "clax", version: "0.1.6", repository: "mauroentey/Clax" },
      { id: "kaikei", version: "0.1.2", repository: "mauroentey/kaikei" },
      { id: "noman", version: "0.1.2", repository: "mauroentey/noman-wa" },
    ],
  );
});

test("suite lock rejects an untrusted host", () => {
  const lock = fixture();
  lock.apps.clax.artifacts["darwin-arm64"].url =
    "https://example.com/mauroentey/Clax/releases/download/v0.1.6/Clax.zip";
  assert.throws(
    () => validateSuiteLock(lock, {
      platform: "darwin",
      arch: "arm64",
      versions,
    }),
    /not an official GitHub release ZIP/,
  );
});

test("suite lock rejects URL credentials and mutable query parameters", () => {
  const lock = fixture();
  lock.apps.clax.artifacts["darwin-arm64"].url =
    "https://token@github.com/mauroentey/Clax/releases/download/v0.1.6/Clax.zip?download=1";
  assert.throws(
    () => validateSuiteLock(lock, {
      platform: "darwin",
      arch: "arm64",
      versions,
    }),
    /not an official GitHub release ZIP/,
  );
});

test("suite lock rejects invalid integrity metadata", () => {
  const lock = fixture();
  lock.apps.kaikei.artifacts["darwin-arm64"].sha256 = "not-a-digest";
  assert.throws(
    () => validateSuiteLock(lock, {
      platform: "darwin",
      arch: "arm64",
      versions,
    }),
    /integrity metadata is invalid/,
  );
});

test("suite lock rejects a registry version mismatch", () => {
  const lock = fixture();
  lock.apps.noman.version = "9.9.9";
  assert.throws(
    () => validateSuiteLock(lock, {
      platform: "darwin",
      arch: "arm64",
      versions,
    }),
    /Noman version or repository is invalid/,
  );
});

test("suite lock rejects a platform without a release bundle", () => {
  assert.throws(
    () => validateSuiteLock(fixture(), {
      platform: "win32",
      arch: "x64",
      versions,
    }),
    /does not provide win32-x64/,
  );
});

test("committed suite lock covers the current macOS and Windows registry versions", async () => {
  const lock = JSON.parse(
    await readFile(new URL("../registry/suite-lock.json", import.meta.url), "utf8"),
  );
  for (const [platform, arch] of [
    ["darwin", "arm64"],
    ["win32", "x64"],
  ]) {
    const definitions = validateSuiteLock(lock, { platform, arch, versions });
    assert.deepEqual(definitions.map(({ id }) => id), ["clax", "kaikei", "noman"]);
  }
});
