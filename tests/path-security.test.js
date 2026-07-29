import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertSafeRelativePath,
  resolveExistingInside,
  safeAppDataPath,
} from "../src/main/paths.js";

test("se rechaza path traversal", () => {
  assert.throws(() => assertSafeRelativePath("../secret.txt"), { code: "PATH_INVALID" });
  assert.throws(() => assertSafeRelativePath("folder/../../secret.txt"), { code: "PATH_INVALID" });
  assert.throws(() => assertSafeRelativePath("C:\\secret.txt"), { code: "PATH_INVALID" });
});

test("se rechaza un symlink que sale del workspace", async (context) => {
  if (process.platform === "win32") context.skip("La creación de symlinks requiere privilegios adicionales en Windows.");
  const root = await mkdtemp(path.join(os.tmpdir(), "launcher-workspace-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "launcher-outside-"));
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await symlink(outside, path.join(root, "escape"), "dir");
  await assert.rejects(
    () => resolveExistingInside(root, "escape/secret.txt", { type: "file" }),
    { code: "SYMLINK_ESCAPE" },
  );
});

test("rutas de datos quedan separadas por aplicación", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "launcher-data-"));
  await mkdir(root, { recursive: true });
  const first = safeAppDataPath(root, "app-one", "history.json");
  const second = safeAppDataPath(root, "app-two", "history.json");
  assert.notEqual(first, second);
  assert.match(first, /app-one/);
  assert.match(second, /app-two/);
});
