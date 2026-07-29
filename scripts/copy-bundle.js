import { cp } from "node:fs/promises";

export async function copyBundle(source, destination) {
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
}
