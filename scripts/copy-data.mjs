import { existsSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "data");
const target = join(root, "dist", "data");

if (existsSync(source)) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log("Copied data/ -> dist/data/");
} else {
  console.log("No data/ folder, skipping copy.");
}
