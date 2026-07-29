import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { copyBundle } from "../scripts/copy-bundle.js";

test(
  "conserva enlaces simbólicos relativos al preparar una app de macOS",
  { skip: process.platform === "win32" },
  async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "cwenti-copy-"));
    try {
      const source = path.join(temporaryRoot, "source");
      const destination = path.join(temporaryRoot, "destination");
      const versionDirectory = path.join(source, "Versions", "A");
      await mkdir(versionDirectory, { recursive: true });
      await writeFile(path.join(versionDirectory, "Example"), "binary", "utf8");
      await symlink("A", path.join(source, "Versions", "Current"));
      await symlink(
        "Versions/Current/Example",
        path.join(source, "Example"),
      );

      await copyBundle(source, destination);

      assert.equal(
        await readlink(path.join(destination, "Versions", "Current")),
        "A",
      );
      assert.equal(
        await readlink(path.join(destination, "Example")),
        "Versions/Current/Example",
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
);
