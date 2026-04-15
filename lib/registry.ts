/**
 * Server-only module: uses Node.js fs/promises.
 * Do NOT import this file from client components.
 */
import path from "node:path";
import fs from "node:fs/promises";
import type { EvaluationRegistryEntry } from "./types";

export { buildRegistryEntry } from "./registryBuilder";

const REGISTRY_DIR = path.join(process.cwd(), "registro_evals");

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

export async function saveRegistryEntry(entry: EvaluationRegistryEntry): Promise<void> {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });

  const now = new Date(entry.timestamp);
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }); // YYYY-MM-DD
  const timeStr = now
    .toLocaleTimeString("en-GB", { timeZone: "America/Mexico_City", hour12: false })
    .replace(/:/g, "-"); // HH-MM-SS
  const safeDataset = sanitize(entry.datasetFileName.replace(/\.csv$/i, ""));
  const shortId = entry.id.slice(0, 8);

  const fileName = `${dateStr}_${timeStr}_${safeDataset}_${shortId}.json`;
  const filePath = path.join(REGISTRY_DIR, fileName);

  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
}

export async function getRegistryEntriesByDate(
  dateString: string // YYYY-MM-DD in America/Mexico_City
): Promise<EvaluationRegistryEntry[]> {
  try {
    await fs.mkdir(REGISTRY_DIR, { recursive: true });
    const files = await fs.readdir(REGISTRY_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json") && f.startsWith(dateString));

    const entries: EvaluationRegistryEntry[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(REGISTRY_DIR, file), "utf-8");
        entries.push(JSON.parse(content) as EvaluationRegistryEntry);
      } catch {
        // skip malformed files
      }
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}
