import path from "path";
import { readJson } from "./fileutils";
import { Item } from "@lib/types";

type RawItems = Record<string, any> | any[] | null;

function normalizeItems(data: RawItems): Item[] {
  if (!data) return [];
  const arr: any[] = Array.isArray(data) ? data : Object.values(data);
  return arr.map((it: any): Item => ({
    id: String(it.id ?? it.key ?? it.name),
    name: String(it.name ?? it.id ?? "Unknown"),
    levelRequirement: Number(it.level_requirement ?? it.levelRequirement ?? 0),
    rarity: Number(it.rarity ?? 0),
    icon: it.icon ?? it.icon_path ?? undefined,
    type: it.type ?? it.category ?? undefined,
    stats: typeof it.stats === "object" ? it.stats : {}
  }));
}

export function parseItems(repoRoot: string): Item[] {
  const p = path.join(repoRoot, "data", "database", "items", "items.json");
  const data = readJson<Record<string, any> | any[]>(p);
  return normalizeItems(data);
}

export function parseItemsFromData(data: RawItems): Item[] {
  return normalizeItems(data);
}
