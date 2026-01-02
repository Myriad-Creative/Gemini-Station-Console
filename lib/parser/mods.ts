import path from "path";
import { Mod, StatMap } from "@lib/types";
import { readJson } from "./fileutils";

type RawMods = {
  mods: Array<any> | Record<string, any>;
} | Array<any>;

function normalizeMods(data: RawMods | null): Mod[] {
  if (!data) return [];
  const arr: any[] = Array.isArray(data) ? data : (Array.isArray((data as any).mods) ? (data as any).mods : Object.values((data as any).mods || {}));
  const mods: Mod[] = arr.map((m: any) => {
    const stats: StatMap = {};
    if (m.stats && typeof m.stats === "object") {
      for (const [k, v] of Object.entries(m.stats)) {
        const num = typeof v === "number" ? v : Number(v);
        if (!Number.isNaN(num)) stats[k] = num;
      }
    }
    let classRestriction: string[] | undefined = undefined;
    const cr = m.class_restriction ?? m.classRestriction;
    if (Array.isArray(cr)) classRestriction = cr.map(String);
    else if (typeof cr === "string") classRestriction = [cr];

    const abilities = Array.isArray(m.abilities) ? m.abilities : [];

    return {
      id: String(m.id ?? m.key ?? m.name),
      name: String(m.name ?? m.id ?? "Unknown"),
      slot: String(m.slot ?? m.mod_slot ?? "Unknown"),
      classRestriction,
      levelRequirement: Number(m.level_requirement ?? m.levelRequirement ?? 0),
      itemLevel: m.item_level ? Number(m.item_level) : undefined,
      rarity: Number(m.rarity ?? 0),
      durability: m.durability ? Number(m.durability) : undefined,
      sellPrice: m.sell_price ? Number(m.sell_price) : undefined,
      stats,
      abilities,
      icon: m.icon,
      description: m.description ?? m.desc ?? undefined
    };
  });
  return mods;
}

export function parseMods(repoRoot: string): Mod[] {
  const p = path.join(repoRoot, "data", "database", "mods", "Mods.json");
  const data = readJson<RawMods>(p);
  return normalizeMods(data);
}

export function parseModsFromData(data: RawMods | null): Mod[] {
  return normalizeMods(data);
}
