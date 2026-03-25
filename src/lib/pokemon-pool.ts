// src/lib/pokemon-pool.ts
import { readFileSync } from "fs";
import { join } from "path";

let cachedPool: Record<number, Record<string, unknown>> | null = null;

export function loadPokemonPool(): Record<number, Record<string, unknown>> {
  if (cachedPool) return cachedPool;
  const filePath = join(process.cwd(), "public", "pokemon-bball-stats-augmented.json");
  const data: Record<string, unknown>[] = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedPool = {};
  for (const p of data) {
    cachedPool[p.id as number] = p;
  }
  return cachedPool;
}
