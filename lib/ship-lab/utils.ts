import type { ShipJsonObject, ShipJsonValue, ShipProfile } from "@lib/ship-lab/types";

export const SHIP_KNOWN_TOP_LEVEL_FIELDS = [
  "id",
  "display_name",
  "description",
  "inherits",
  "scene",
  "sprite",
  "starter",
  "purchase",
  "stats",
  "mod_slots",
  "cargo",
  "tags",
  "abilities",
] as const;

export const DEFAULT_SHIP_STATS = [
  "armor",
  "shields",
  "shield_regen",
  "armor_regen",
  "targeting",
  "evasion",
  "threat_generation",
  "hacking",
  "damage_reflect",
  "damage_reduction",
  "stealth",
  "sensors",
  "salvage_bonus",
  "heat_resistance",
  "speed",
  "turn_rate",
  "power",
  "overclock",
  "crit_chance",
  "energy_regen_rate",
  "energy",
  "weapon_recharge_pct",
] as const;

export const DEFAULT_MOD_SLOT_KEYS = ["engine", "weapon", "armor", "shield", "sensor", "utility", "wildcard"] as const;

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function slugifyShipId(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "ship";
}

export function fileNameForShipId(id: string) {
  return `${slugifyShipId(id)}.json`;
}

export function labelize(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function numberOrStringFromInput(value: string): number | string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

export function parseJsonObjectText(value: string, label: string): ShipJsonObject {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as ShipJsonObject;
}

export function parseJsonArrayText(value: string, label: string): ShipJsonValue[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  return parsed as ShipJsonValue[];
}

export function extraJsonFromProfile(data: ShipJsonObject | null) {
  if (!data) return "";
  const extra: ShipJsonObject = {};
  const known = new Set<string>(SHIP_KNOWN_TOP_LEVEL_FIELDS);
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) extra[key] = value;
  }
  return Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "";
}

export function createBlankShipData(existingIds: string[]) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let index = 1;
  let id = "ship_001";
  while (taken.has(id)) {
    index += 1;
    id = `ship_${String(index).padStart(3, "0")}`;
  }

  return {
    id,
    display_name: "",
    description: "",
    scene: "res://scenes/ships/PlayerShip.tscn",
    sprite: "res://assets/ships/player_default.png",
    starter: false,
    purchase: {
      buy_price: 0,
      sell_price: 0,
      available_from_start: false,
    },
    stats: Object.fromEntries(DEFAULT_SHIP_STATS.map((key) => [key, 0])),
    mod_slots: Object.fromEntries(DEFAULT_MOD_SLOT_KEYS.map((key) => [key, 0])),
    cargo: {
      base_cargo_slots: 0,
      cargo_compartment_limit: -1,
    },
  } satisfies ShipJsonObject;
}

export function createShipDataFromProfile(profile: ShipProfile, existingIds: string[]) {
  const source = cloneJson(profile.data ?? {});
  const baseId = slugifyShipId(String(source.id || profile.id || "ship"));
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = `${baseId}_copy`;
  let index = 2;
  while (taken.has(candidate)) {
    candidate = `${baseId}_copy_${index}`;
    index += 1;
  }
  source.id = candidate;
  source.display_name = source.display_name ? `${String(source.display_name)} Copy` : "";
  source.starter = false;
  return source;
}

export function validateShipProfile(profile: unknown) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "A ship JSON object is required.";
  const record = profile as Record<string, unknown>;
  const id = String(record.id ?? "").trim();
  if (!id) return "Ship ID is required.";
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return "Ship ID cannot contain path separators.";
  if (record.stats !== undefined && (!record.stats || typeof record.stats !== "object" || Array.isArray(record.stats))) return "stats must be an object.";
  if (record.mod_slots !== undefined && (!record.mod_slots || typeof record.mod_slots !== "object" || Array.isArray(record.mod_slots))) return "mod_slots must be an object.";
  if (record.cargo !== undefined && (!record.cargo || typeof record.cargo !== "object" || Array.isArray(record.cargo))) return "cargo must be an object.";
  if (record.purchase !== undefined && (!record.purchase || typeof record.purchase !== "object" || Array.isArray(record.purchase))) return "purchase must be an object.";
  if (record.tags !== undefined && (!Array.isArray(record.tags) || record.tags.some((entry) => typeof entry !== "string"))) return "tags must be an array of strings.";
  if (record.abilities !== undefined && !Array.isArray(record.abilities)) return "abilities must be an array.";
  return "";
}
