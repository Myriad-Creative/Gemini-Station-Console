import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { parseLooseJson } from "@lib/json";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { normalizeAbilityReference } from "@lib/ability-manager/utils";
import { parseItemsFromData } from "@parser/items";
import { parseModsFromData } from "@parser/mods";
import type { AbilityDraft, StatusEffectDraft } from "@lib/ability-manager/types";
import type { Item, Mod } from "@lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

type LootTableAbility = {
  id: string;
  name: string;
  description: string;
  icon: string;
  cooldown: number | null;
  chargeTime: number | null;
  energyCost: number | null;
  attackRange: number | null;
  radiusLabel: string | null;
  radiusMeters: number | null;
  damageType: string | null;
  facingRequirement: string | null;
  primaryModSlot: string | null;
  secondaryModSlot: string | null;
  isGcdLocked: boolean;
  effectNames: string[];
  notes: string[];
  missing: boolean;
};

type LootTableModRecord = Pick<
  Mod,
  "id" | "name" | "slot" | "classRestriction" | "levelRequirement" | "itemLevel" | "rarity" | "durability" | "sellPrice" | "stats" | "icon" | "description"
> & {
  abilities: LootTableAbility[];
};

type LootTableItemRecord = Pick<Item, "id" | "name" | "levelRequirement" | "rarity" | "icon" | "type" | "description" | "stats">;

type LootTableEntry<TRecord> = {
  id: string;
  weight: number;
  probability: number;
  name: string | null;
  missing: boolean;
  record: TRecord | null;
};

type LootTableOption<TRecord> = {
  id: string;
  rolls: number;
  entryCount: number;
  totalWeight: number;
  entries: LootTableEntry<TRecord>[];
};

type EditableLootTableEntry = {
  id: string;
  weight: number;
};

type EditableLootTableDraft = {
  id: string;
  rolls: number;
  entries: EditableLootTableEntry[];
};

type LootKind = "mods" | "items";

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function normalizeId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^-?\d+(?:\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function readLooseJsonFile(filePath: string) {
  return parseLooseJson(await fsp.readFile(filePath, "utf-8"));
}

function parseJsonBlock(value: string): JsonObject {
  if (!value.trim()) return {};
  try {
    return asObject(parseLooseJson(value));
  } catch {
    return {};
  }
}

function firstText(source: JsonObject, keys: string[]) {
  for (const key of keys) {
    const text = normalizeOptionalText(source[key]);
    if (text) return text;
  }
  return null;
}

function firstNumber(source: JsonObject, keys: string[]) {
  for (const key of keys) {
    const numberValue = asNumber(source[key]);
    if (numberValue !== null && numberValue > 0) return numberValue;
  }
  return null;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferDamageType(ability: AbilityDraft, extraProperties: JsonObject) {
  const explicit = firstText(extraProperties, ["weapon_category", "damage_category", "damage_type"]);
  if (explicit) return titleCase(explicit);

  const haystack = `${ability.name} ${ability.script}`.toLowerCase();
  if (haystack.includes("beam")) return "Beam";
  if (haystack.includes("railgun") || haystack.includes("shrapnel") || haystack.includes("asteroid") || haystack.includes("torpedo") || haystack.includes("mine")) {
    return "Projectile";
  }
  if (ability.projectileScene || extraProperties.projectile_scene !== undefined) return "Energy";
  return null;
}

function resolveFacingRequirement(value: string) {
  const facing = asNumber(value);
  if (facing === 1) return "Facing: Front arc";
  if (facing === 2) return "Facing: Rear arc";
  if (facing === 3) return "Facing: Side arc";
  return null;
}

function resolveRadius(extraProperties: JsonObject) {
  const radiusNames = [
    "ground_target_radius",
    "explosion_radius",
    "explode_radius",
    "wave_radius",
    "impact_radius",
    "search_radius",
    "seek_radius",
  ];

  for (const key of radiusNames) {
    const radius = asNumber(extraProperties[key]);
    if (radius === null || radius <= 0) continue;
    return {
      label: key === "ground_target_radius" ? "Target radius" : "Radius",
      meters: radius,
    };
  }

  return {
    label: null,
    meters: null,
  };
}

function resolveNotes(extraProperties: JsonObject) {
  const notes: string[] = [];
  const note = normalizeOptionalText(extraProperties.tooltip_note);
  if (note) notes.push(note);

  if (Array.isArray(extraProperties.tooltip_notes)) {
    for (const entry of extraProperties.tooltip_notes) {
      const text = normalizeOptionalText(entry);
      if (text) notes.push(text);
    }
  }

  return notes;
}

function buildStatusEffectCatalog(statusEffects: StatusEffectDraft[]) {
  const byId = new Map<string, StatusEffectDraft>();
  for (const effect of statusEffects) {
    const id = normalizeId(effect.numericId);
    if (id) byId.set(id, effect);
  }
  return byId;
}

function buildAbilityCatalog(abilities: AbilityDraft[], statusEffects: StatusEffectDraft[]) {
  const statusEffectById = buildStatusEffectCatalog(statusEffects);
  const catalog = new Map<string, LootTableAbility>();

  for (const ability of abilities) {
    const id = normalizeAbilityReference(ability.id);
    if (!id) continue;

    const extraProperties = parseJsonBlock(ability.extraPropertiesJson);
    const attackRange =
      asNumber(ability.attackRange) ??
      firstNumber(extraProperties, ["attack_range", "range", "max_range", "range_max"]);
    const radius = resolveRadius(extraProperties);
    const effectNames = new Set<string>();

    for (const link of ability.linkedEffects) {
      const label = link.effectName || link.effectId || `#${link.numericId}`;
      effectNames.add(label);
    }

    for (const effectId of ability.appliesEffectIds) {
      const normalizedEffectId = normalizeId(effectId);
      const effect = statusEffectById.get(normalizedEffectId);
      effectNames.add(effect?.name || effect?.effectId || `#${normalizedEffectId}`);
    }

    catalog.set(id, {
      id,
      name: ability.name || id,
      description: ability.description,
      icon: ability.icon,
      cooldown: asNumber(ability.cooldown),
      chargeTime: asNumber(ability.chargeTime),
      energyCost: asNumber(ability.energyCost),
      attackRange,
      radiusLabel: radius.label,
      radiusMeters: radius.meters,
      damageType: inferDamageType(ability, extraProperties),
      facingRequirement: resolveFacingRequirement(ability.facingRequirement),
      primaryModSlot: normalizeOptionalText(ability.primaryModSlot),
      secondaryModSlot: normalizeOptionalText(ability.secondaryModSlot),
      isGcdLocked: ability.isGcdLocked,
      effectNames: [...effectNames],
      notes: resolveNotes(extraProperties),
      missing: false,
    });
  }

  return catalog;
}

function unresolvedAbility(id: string): LootTableAbility {
  return {
    id,
    name: `Missing ability ${id}`,
    description: "",
    icon: "",
    cooldown: null,
    chargeTime: null,
    energyCost: null,
    attackRange: null,
    radiusLabel: null,
    radiusMeters: null,
    damageType: null,
    facingRequirement: null,
    primaryModSlot: null,
    secondaryModSlot: null,
    isGcdLocked: true,
    effectNames: [],
    notes: [],
    missing: true,
  };
}

function buildModCatalog(mods: Mod[], abilityCatalog: Map<string, LootTableAbility>) {
  const catalog = new Map<string, LootTableModRecord>();
  for (const mod of mods) {
    const id = normalizeId(mod.id);
    if (!id) continue;
    catalog.set(id, {
      id: mod.id,
      name: mod.name,
      slot: mod.slot,
      classRestriction: mod.classRestriction,
      levelRequirement: mod.levelRequirement,
      itemLevel: mod.itemLevel,
      rarity: mod.rarity,
      durability: mod.durability,
      sellPrice: mod.sellPrice,
      stats: mod.stats,
      icon: mod.icon,
      description: mod.description,
      abilities: (mod.abilities ?? [])
        .map((abilityId) => normalizeAbilityReference(abilityId))
        .filter(Boolean)
        .map((abilityId) => abilityCatalog.get(abilityId) ?? unresolvedAbility(abilityId)),
    });
  }
  return catalog;
}

function buildItemCatalog(items: Item[]) {
  const catalog = new Map<string, LootTableItemRecord>();
  for (const item of items) {
    const id = normalizeId(item.id);
    if (!id) continue;
    catalog.set(id, {
      id: item.id,
      name: item.name,
      levelRequirement: item.levelRequirement,
      rarity: item.rarity,
      icon: item.icon,
      type: item.type,
      description: item.description,
      stats: item.stats,
    });
  }
  return catalog;
}

function parseTables<TRecord>(root: unknown, catalog: Map<string, TRecord>, getName: (record: TRecord) => string): LootTableOption<TRecord>[] {
  const tableRoot = asObject(asObject(root).tables);
  return Object.entries(tableRoot)
    .map(([id, value]) => {
      const table = asObject(value);
      const entries = Array.isArray(table.entries) ? table.entries : [];
      const normalizedEntriesWithoutProbability = entries
        .map((entryValue) => {
          const entry = asObject(entryValue);
          const entryId = normalizeId(entry.id);
          const weight = Number(entry.weight ?? 0);
          const record = catalog.get(entryId) ?? null;
          return {
            id: entryId,
            weight: Number.isFinite(weight) ? weight : 0,
            name: record ? getName(record) : null,
            missing: !record,
            record,
          };
        })
        .filter((entry) => entry.id && entry.weight > 0);
      const rolls = Number(table.rolls ?? 1);
      const totalWeight = normalizedEntriesWithoutProbability.reduce((total, entry) => total + entry.weight, 0);
      const normalizedEntries = normalizedEntriesWithoutProbability.map((entry) => ({
        ...entry,
        probability: totalWeight > 0 ? entry.weight / totalWeight : 0,
      }));

      return {
        id,
        rolls: Number.isFinite(rolls) ? rolls : 1,
        entryCount: normalizedEntries.length,
        totalWeight,
        entries: normalizedEntries,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" }));
}

function catalogValues<TRecord extends { id: string; name: string }>(catalog: Map<string, TRecord>) {
  return [...catalog.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
}

function normalizeTableId(value: unknown) {
  return String(value ?? "").trim();
}

function toJsonId(id: string) {
  return /^\d+$/.test(id) ? Number(id) : id;
}

function validateEditableTables(kind: LootKind, rawTables: unknown, catalog: Map<string, unknown>) {
  if (!Array.isArray(rawTables)) {
    return { tables: [] as EditableLootTableDraft[], errors: ["A loot table array is required."] };
  }

  const errors: string[] = [];
  const tableIds = new Set<string>();
  const tables = rawTables.map((rawTable, tableIndex): EditableLootTableDraft => {
    const table = asObject(rawTable);
    const id = normalizeTableId(table.id);
    const rolls = Number(table.rolls ?? 1);
    const entriesRaw = Array.isArray(table.entries) ? table.entries : [];

    if (!id) {
      errors.push(`Table ${tableIndex + 1} is missing an ID.`);
    } else if (!/^[A-Za-z0-9_.:-]+$/.test(id)) {
      errors.push(`Table "${id}" can only use letters, numbers, underscores, hyphens, periods, and colons.`);
    } else if (tableIds.has(id.toLowerCase())) {
      errors.push(`Duplicate table ID "${id}".`);
    }
    if (id) tableIds.add(id.toLowerCase());

    if (!Number.isFinite(rolls) || rolls <= 0) {
      errors.push(`Table "${id || tableIndex + 1}" must have a positive rolls value.`);
    }

    const entryIds = new Set<string>();
    const entries = entriesRaw.map((rawEntry, entryIndex): EditableLootTableEntry => {
      const entry = asObject(rawEntry);
      const entryId = normalizeId(entry.id);
      const weight = Number(entry.weight ?? 0);
      const label = `Table "${id || tableIndex + 1}" entry ${entryIndex + 1}`;

      if (!entryId) {
        errors.push(`${label} is missing an ID.`);
      } else if (entryIds.has(entryId)) {
        errors.push(`Table "${id || tableIndex + 1}" contains duplicate ${kind === "mods" ? "mod" : "item"} ID "${entryId}".`);
      } else if (!catalog.has(entryId)) {
        errors.push(`Table "${id || tableIndex + 1}" references unknown ${kind === "mods" ? "mod" : "item"} ID "${entryId}".`);
      }
      if (entryId) entryIds.add(entryId);

      if (!Number.isFinite(weight) || weight <= 0) {
        errors.push(`${label} must have a positive weight.`);
      }

      return {
        id: entryId,
        weight: Number.isFinite(weight) ? weight : 0,
      };
    });

    return {
      id,
      rolls: Number.isFinite(rolls) ? rolls : 1,
      entries,
    };
  });

  return { tables, errors };
}

function stringifyLootTables(tables: EditableLootTableDraft[]) {
  const root = {
    tables: Object.fromEntries(
      tables.map((table) => [
        table.id,
        {
          rolls: table.rolls,
          entries: table.entries.map((entry) => ({
            id: toJsonId(entry.id),
            weight: entry.weight,
          })),
        },
      ]),
    ),
  };
  return `${JSON.stringify(root, null, 2)}\n`;
}

async function loadLootWorkspace(root: string) {
  const [itemTablesRoot, modTablesRoot, itemsRoot, modsRoot] = await Promise.all([
    readLooseJsonFile(path.join(root, "scripts", "system", "loot", "ItemsLootTables.json")),
    readLooseJsonFile(path.join(root, "scripts", "system", "loot", "ModsLootTables.json")),
    readLooseJsonFile(path.join(root, "data", "database", "items", "items.json")).catch(() => null),
    readLooseJsonFile(path.join(root, "data", "database", "mods", "Mods.json")).catch(() => null),
  ]);
  const abilityDatabase = loadAbilityManagerDatabase(root);
  const abilityCatalog = buildAbilityCatalog(abilityDatabase.abilities, abilityDatabase.statusEffects);
  const itemCatalog = buildItemCatalog(parseItemsFromData(itemsRoot as Record<string, unknown> | unknown[] | null));
  const modCatalog = buildModCatalog(parseModsFromData(modsRoot as { mods: unknown[] | Record<string, unknown> } | unknown[] | null), abilityCatalog);

  return {
    itemTablesRoot,
    modTablesRoot,
    itemCatalog,
    modCatalog,
  };
}

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const root = localGameSource.gameRootPath;
    const { itemTablesRoot, modTablesRoot, itemCatalog, modCatalog } = await loadLootWorkspace(root);

    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game source",
      data: {
        items: parseTables(itemTablesRoot, itemCatalog, (item) => item.name),
        mods: parseTables(modTablesRoot, modCatalog, (mod) => mod.name),
        catalogs: {
          items: catalogValues(itemCatalog),
          mods: catalogValues(modCatalog),
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === "items" ? "items" : body?.kind === "mods" ? "mods" : null;
    if (!kind) {
      return NextResponse.json({ ok: false, error: "Save requires kind to be either mods or items." }, { status: 400 });
    }

    const root = localGameSource.gameRootPath;
    const { itemCatalog, modCatalog } = await loadLootWorkspace(root);
    const catalog = kind === "mods" ? modCatalog : itemCatalog;
    const { tables, errors } = validateEditableTables(kind, body?.tables, catalog);
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
    }

    const filePath = path.join(root, "scripts", "system", "loot", kind === "mods" ? "ModsLootTables.json" : "ItemsLootTables.json");
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, stringifyLootTables(tables), "utf-8");
    await loadAll();

    return NextResponse.json({
      ok: true,
      savedPath: filePath,
      savedCount: tables.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
