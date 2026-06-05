import path from "path";
import { Mod, StatMap } from "@lib/types";
import { readJson } from "./fileutils";

type RawMods = {
  mods: Array<any> | Record<string, any>;
} | Array<any>;

const CARGO_SLOT_KEYS = ["cargo_slots", "cargo_space", "cargo_capacity_slots"];

function readCargoSlotValue(mod: any) {
  for (const key of CARGO_SLOT_KEYS) {
    const value = mod?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

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
    const cargoSlots = readCargoSlotValue(m);
    if (cargoSlots !== undefined && stats.cargo_slots === undefined) {
      const num = typeof cargoSlots === "number" ? cargoSlots : Number(cargoSlots);
      if (!Number.isNaN(num)) stats.cargo_slots = num;
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
      statsCapOverride: Boolean(m.stats_cap_override ?? m.statsCapOverride),
      isQuestReward: Boolean(m.is_quest_reward ?? m.isQuestReward),
      isDungeonDrop: Boolean(m.is_dungeon_drop ?? m.isDungeonDrop),
      isBossDrop: Boolean(m.is_boss_drop ?? m.isBossDrop),
      levelRequirement: Number(m.level_requirement ?? m.levelRequirement ?? 0),
      itemLevel: m.item_level ? Number(m.item_level) : undefined,
      rarity: Number(m.rarity ?? 0),
      durability: m.durability ? Number(m.durability) : undefined,
      sellPrice: m.sell_price ? Number(m.sell_price) : undefined,
      buyPrice: m.buy_price ? Number(m.buy_price) : undefined,
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
