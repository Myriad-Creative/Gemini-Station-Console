import type { ShipJsonObject, ShipJsonValue, ShipProfile, ShipThrusterDraft, ShipWeaponChargePointDraft } from "@lib/ship-lab/types";

export const SHIP_KNOWN_TOP_LEVEL_FIELDS = [
  "id",
  "display_name",
  "description",
  "inherits",
  "scene",
  "sprite",
  "sprite_scale",
  "starter",
  "purchase",
  "stats",
  "mod_slots",
  "cargo",
  "tags",
  "abilities",
  "thrusters",
  "weapon_charge_point",
  "weapon_charge_points",
  "weapon_charge_vfx_point",
  "weapon_charge_vfx_points",
  "charge_point",
  "charge_points",
  "charge_vfx_point",
  "charge_vfx_points",
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

export const DEFAULT_SHIP_STAT_VALUES = {
  armor: 100.0,
  shields: 10.0,
  shield_regen: 1.0,
  armor_regen: 0.0,
  targeting: 5.0,
  evasion: 4.0,
  threat_generation: 0.0,
  hacking: 1.0,
  damage_reflect: 0.0,
  damage_reduction: 0.0,
  stealth: 0.0,
  sensors: 5.0,
  salvage_bonus: 0.0,
  heat_resistance: 0.0,
  speed: 500.0,
  turn_rate: 2.5,
  power: 20.0,
  overclock: 0.0,
  crit_chance: 5.0,
  energy_regen_rate: 1.0,
  energy: 100.0,
  weapon_recharge_pct: 0.0,
} satisfies Record<(typeof DEFAULT_SHIP_STATS)[number], number>;

export const DEFAULT_SHIP_MOD_SLOT_VALUES = {
  engine: 2,
  weapon: 2,
  armor: 2,
  shield: 2,
  sensor: 1,
  utility: 4,
  wildcard: 0,
} satisfies Record<(typeof DEFAULT_MOD_SLOT_KEYS)[number], number>;

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDraftKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function booleanFromUnknown(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return false;
}

export function formatPlacementNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function normalizePlacementVectorDraft(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { x: formatPlacementNumber(value), y: formatPlacementNumber(value) };
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return { x: formatPlacementNumber(parsed), y: formatPlacementNumber(parsed) };
  }
  if (Array.isArray(value) && value.length >= 2) {
    return { x: stringFromNumberLike(value[0]), y: stringFromNumberLike(value[1]) };
  }
  const record = asRecord(value);
  if ("x" in record || "y" in record) {
    return { x: stringFromNumberLike(record.x), y: stringFromNumberLike(record.y) };
  }
  return { x: "", y: "" };
}

function normalizePlacementVectorDraftWithFallback(value: unknown, fallbackX: number, fallbackY: number) {
  const normalized = normalizePlacementVectorDraft(value);
  return {
    x: normalized.x || formatPlacementNumber(fallbackX),
    y: normalized.y || formatPlacementNumber(fallbackY),
  };
}

function stringFromNumberLike(value: unknown) {
  if (typeof value === "number") return formatPlacementNumber(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function parseRequiredPlacementNumber(value: string, label: string) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isFinite(parsed)) {
    throw new Error(`${label} must be numeric.`);
  }
  return parsed;
}

function parsePlacementVectorDraft(xValue: string, yValue: string, label: string, fallbackX: number, fallbackY: number) {
  const xSource = xValue.trim() || formatPlacementNumber(fallbackX);
  const ySource = yValue.trim() || formatPlacementNumber(fallbackY);
  const x = Number(xSource);
  const y = Number(ySource);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`${label} must use numeric X and Y values.`);
  }
  return [x, y];
}

export function normalizeShipThrusterDrafts(value: unknown): ShipThrusterDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const source = asRecord(entry);
      if (!Object.keys(source).length) return null;
      const position = normalizePlacementVectorDraftWithFallback(source.position, 0, 0);
      const scale = normalizePlacementVectorDraftWithFallback(source.scale, 1, 1);
      return {
        key: createDraftKey("thruster"),
        position_x: position.x,
        position_y: position.y,
        scale_x: scale.x,
        scale_y: scale.y,
        rotation_degrees: stringFromNumberLike(source.rotation_degrees ?? 0) || "0",
        z_index: stringFromNumberLike(source.z_index ?? -2) || "-2",
        enabled: source.enabled === undefined ? true : booleanFromUnknown(source.enabled),
        velocity_threshold: stringFromNumberLike(source.velocity_threshold ?? 5) || "5",
      };
    })
    .filter((entry): entry is ShipThrusterDraft => entry !== null);
}

export function normalizeShipWeaponChargePointDrafts(source: ShipJsonObject | Record<string, unknown>): ShipWeaponChargePointDraft[] {
  const value =
    source.weapon_charge_points ??
    source.charge_points ??
    source.weapon_charge_vfx_points ??
    source.charge_vfx_points;
  const singleValue =
    source.weapon_charge_point ??
    source.charge_point ??
    source.weapon_charge_vfx_point ??
    source.charge_vfx_point;
  const entries = Array.isArray(value) ? value : singleValue === undefined ? [] : [singleValue];
  return entries
    .map((entry) => {
      const pointSource = asRecord(entry);
      if (!Object.keys(pointSource).length && entry === null) return null;
      const position = Object.keys(pointSource).length ? normalizePlacementVectorDraftWithFallback(pointSource.position, 0, -120) : normalizePlacementVectorDraftWithFallback(entry, 0, -120);
      const scale = normalizePlacementVectorDraftWithFallback(pointSource.scale, 1, 1);
      return {
        key: createDraftKey("weapon-charge"),
        position_x: position.x,
        position_y: position.y,
        scale_x: scale.x,
        scale_y: scale.y,
        z_index: stringFromNumberLike(pointSource.z_index ?? 20) || "20",
        enabled: pointSource.enabled === undefined ? true : booleanFromUnknown(pointSource.enabled),
      };
    })
    .filter((entry): entry is ShipWeaponChargePointDraft => entry !== null);
}

export function createShipThrusterDraft(positionX = 0, positionY = 120): ShipThrusterDraft {
  return {
    key: createDraftKey("thruster"),
    position_x: formatPlacementNumber(positionX),
    position_y: formatPlacementNumber(positionY),
    scale_x: "0.5",
    scale_y: "0.5",
    rotation_degrees: "0",
    z_index: "-2",
    enabled: true,
    velocity_threshold: "5",
  };
}

export function createShipWeaponChargePointDraft(positionX = 0, positionY = -120): ShipWeaponChargePointDraft {
  return {
    key: createDraftKey("weapon-charge"),
    position_x: formatPlacementNumber(positionX),
    position_y: formatPlacementNumber(positionY),
    scale_x: "1",
    scale_y: "1",
    z_index: "20",
    enabled: true,
  };
}

export function serializeShipThrusters(thrusters: ShipThrusterDraft[]) {
  return thrusters.map((thruster, index) => ({
    position: parsePlacementVectorDraft(thruster.position_x, thruster.position_y, `thruster ${index + 1} position`, 0, 0),
    scale: parsePlacementVectorDraft(thruster.scale_x, thruster.scale_y, `thruster ${index + 1} scale`, 1, 1),
    rotation_degrees: parseRequiredPlacementNumber(thruster.rotation_degrees, `thruster ${index + 1} rotation_degrees`),
    z_index: parseRequiredPlacementNumber(thruster.z_index, `thruster ${index + 1} z_index`),
    enabled: thruster.enabled,
    velocity_threshold: parseRequiredPlacementNumber(thruster.velocity_threshold, `thruster ${index + 1} velocity_threshold`),
  }));
}

export function serializeShipWeaponChargePoints(points: ShipWeaponChargePointDraft[]) {
  return points.map((point, index) => ({
    position: parsePlacementVectorDraft(point.position_x, point.position_y, `weapon charge point ${index + 1} position`, 0, -120),
    scale: parsePlacementVectorDraft(point.scale_x, point.scale_y, `weapon charge point ${index + 1} scale`, 1, 1),
    z_index: parseRequiredPlacementNumber(point.z_index, `weapon charge point ${index + 1} z_index`),
    enabled: point.enabled,
  }));
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
    display_name: "New Ship",
    description: "New player ship profile.",
    scene: "res://scenes/ships/PlayerShip.tscn",
    sprite: "res://scenes/entities/npc/Trainer.png",
    starter: false,
    purchase: {
      buy_price: 0,
      sell_price: 0,
      available_from_start: false,
    },
    stats: { ...DEFAULT_SHIP_STAT_VALUES },
    mod_slots: { ...DEFAULT_SHIP_MOD_SLOT_VALUES },
    cargo: {
      base_cargo_slots: 20,
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
  if (record.thrusters !== undefined && !Array.isArray(record.thrusters)) return "thrusters must be an array.";
  if (record.weapon_charge_points !== undefined && !Array.isArray(record.weapon_charge_points)) return "weapon_charge_points must be an array.";
  return "";
}
