import { spawn } from "node:child_process";
import electronPath from "electron";
import path from "node:path";

const rootPath = path.resolve(import.meta.dirname, "..");
const child = spawn(electronPath, [rootPath], {
  cwd: rootPath,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    LAUNCHER_SMOKE_TEST: "1",
    NODE_ENV: "test",
  },
});
let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += String(chunk).slice(0, 8_000);
});
const timeout = setTimeout(() => {
  child.kill();
  process.stderr.write("La prueba de humo agotó 30 segundos.\n");
  process.exitCode = 1;
}, 30_000);
child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    process.stderr.write(stderr);
    process.exitCode = code ?? 1;
  } else {
    process.stdout.write("Ventana principal abierta y cargada correctamente.\n");
  }
});
