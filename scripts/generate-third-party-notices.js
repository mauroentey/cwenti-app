import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const rootPath = path.resolve(import.meta.dirname, "..");
const binary = process.platform === "win32"
  ? path.join(rootPath, "node_modules", ".bin", "license-checker-rseidelsohn.cmd")
  : path.join(rootPath, "node_modules", ".bin", "license-checker-rseidelsohn");
const { stdout } = await execFileAsync(binary, [
  "--production",
  "--json",
  "--start",
  rootPath,
], {
  cwd: rootPath,
  maxBuffer: 20 * 1024 * 1024,
  windowsHide: true,
});
const inventory = JSON.parse(stdout);
const packages = Object.entries(inventory).sort(([left], [right]) => left.localeCompare(right, "en"));
const lines = [
  "# Avisos de terceros",
  "",
  "Generado por `npm run licenses`. Cada dependencia conserva su propia licencia y sus avisos.",
  "",
  "| Paquete | Licencia | Repositorio o fuente |",
  "| --- | --- | --- |",
  ...packages.map(([name, details]) => {
    const license = String(details.licenses ?? "No indicada").replaceAll("|", "\\|");
    const source = String(details.repository ?? details.url ?? "").replaceAll("|", "\\|");
    return `| ${name.replaceAll("|", "\\|")} | ${license} | ${source} |`;
  }),
  "",
  "Electron, Codex y las demás dependencias no cambian de licencia por formar parte de este producto.",
  "",
];
await writeFile(path.join(rootPath, "THIRD_PARTY_NOTICES.md"), lines.join("\n"), "utf8");
process.stdout.write(`Inventario actualizado: ${packages.length} paquetes.\n`);
