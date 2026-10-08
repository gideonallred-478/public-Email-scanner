import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile(path, fallback) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

export async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}
