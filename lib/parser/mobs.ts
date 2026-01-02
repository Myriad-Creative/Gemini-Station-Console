import path from "path";
import { readJson } from "./fileutils";
import { Mob, StatMap } from "@lib/types";

type RawMobs = Record<string, any> | any[] | null;

function normalizeMobs(data: RawMobs): Mob[] {
  if (!data) return [];
  const arr: any[] = Array.isArray(data) ? data : Object.values(data);
  return arr.map((m: any): Mob => {
    const stats: StatMap = {};
    if (m.stats && typeof m.stats === "object") {
      for (const [k, v] of Object.entries(m.stats)) {
        const num = typeof v === "number" ? v : Number(v);
        if (!Number.isNaN(num)) stats[k] = num;
      }
    }
    return {
      id: String(m.id ?? m.key ?? m.name),
      displayName: m.display_name ?? m.name ?? undefined,
      level: typeof m.level === "number" ? m.level : (m.level ? Number(m.level) : undefined),
      faction: m.faction ?? undefined,
      abilities: Array.isArray(m.abilities) ? m.abilities : undefined,
      stats
    };
  });
}

export function parseMobs(repoRoot: string): Mob[] {
  const p = path.join(repoRoot, "data", "database", "mobs", "mobs.json");
  const data = readJson<Record<string, any> | any[]>(p);
  return normalizeMobs(data);
}

export function parseMobsFromData(data: RawMobs): Mob[] {
  return normalizeMobs(data);
}
