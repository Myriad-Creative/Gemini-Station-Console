import JSON5 from "json5";
import {
  BUILT_IN_MOB_STAT_KEYS,
  MOB_BOOLEAN_FIELDS,
  MOB_KNOWN_TOP_LEVEL_FIELDS,
  MOB_NUMERIC_FIELDS,
} from "@lib/mob-lab/constants";
import type {
  MobDraft,
  MobLabImportResult,
  MobLabParseStrategy,
  MobLabSourceShape,
  MobLabSummary,
  MobLabWorkspace,
  MobValidationIssue,
  ScanTierDraft,
} from "@lib/mob-lab/types";

type JsonObject = Record<string, unknown>;
const SCAN_RESERVED_KEYS = ["Faction", "Class", "Notes", "tiers"] as const;

let draftCounter = 0;

function createDraftKey() {
  draftCounter += 1;
  return `mob-draft-${draftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringOrEmpty(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDraftNumber(value: unknown) {
  if (typeof value !== "number") return stringOrEmpty(value).trim();
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function stringListFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
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

function stripKeys(source: JsonObject, keys: readonly string[]) {
  const excluded = new Set(keys);
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (!excluded.has(key)) next[key] = value;
  }
  return next;
}

function cleanObject(source: JsonObject) {
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    next[key] = value;
  }
  return next;
}

function formatJsonBlock(source: JsonObject) {
  return Object.keys(source).length ? JSON.stringify(source, null, 2) : "";
}

function parseScalar(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseObjectTextarea(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};

  let parsed: unknown;
  try {
    parsed = JSON5.parse(trimmed);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as JsonObject;
}

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "mob_001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }

  return `${trimmed}_001`;
}

function orderedStatKeys(stats: Record<string, string>) {
  const customKeys = Object.keys(stats)
    .filter((key) => !BUILT_IN_MOB_STAT_KEYS.includes(key as (typeof BUILT_IN_MOB_STAT_KEYS)[number]))
    .sort((left, right) => left.localeCompare(right));
  return [...BUILT_IN_MOB_STAT_KEYS, ...customKeys];
}

function normalizeScanTierText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function normalizeScanDraft(value: unknown) {
  const scanSource = asObject(value);
  const rawTiers = scanSource.tiers;
  const tiersSource = rawTiers && typeof rawTiers === "object" && !Array.isArray(rawTiers) ? (rawTiers as JsonObject) : null;
  const scanExtra = stripKeys(scanSource, ["Faction", "Class", "Notes"]);
  if (tiersSource) {
    delete scanExtra.tiers;
  }

  return {
    scan_faction: stringOrEmpty(scanSource.Faction).trim(),
    scan_class: stringOrEmpty(scanSource.Class).trim(),
    scan_notes: stringOrEmpty(scanSource.Notes).trim(),
    scan_tiers: tiersSource
      ? Object.entries(tiersSource).map(([threshold, tierValue]) => ({
          key: createDraftKey(),
          threshold: String(threshold).trim(),
          text: normalizeScanTierText(tierValue),
        }))
      : [],
    scan_extra_json: formatJsonBlock(scanExtra),
  };
}

function parseScanTierValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const startsLikeJson = (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!startsLikeJson) return trimmed;

  try {
    return JSON5.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function buildScanObject(mob: MobDraft) {
  const scanExtra = parseObjectTextarea(mob.scan_extra_json, "Scan Extra JSON");
  const tiers = mob.scan_tiers.reduce<JsonObject>((accumulator, tier) => {
    const threshold = tier.threshold.trim();
    const text = tier.text.trim();
    if (!threshold && !text) return accumulator;
    if (!threshold) return accumulator;
    accumulator[threshold] = parseScanTierValue(text);
    return accumulator;
  }, {});

  const known = cleanObject({
    Faction: mob.scan_faction.trim(),
    Class: mob.scan_class.trim(),
    Notes: mob.scan_notes.trim(),
    tiers,
  });

  const next = { ...known } as JsonObject;
  for (const [key, value] of Object.entries(scanExtra)) {
    if (SCAN_RESERVED_KEYS.includes(key as (typeof SCAN_RESERVED_KEYS)[number])) continue;
    next[key] = value;
  }

  return Object.keys(next).length ? next : undefined;
}

function normalizeImportedMob(source: JsonObject, sourceIndex: number): MobDraft {
  const statsSource = asObject(source.stats);
  const stats: Record<string, string> = {};
  const scanDraft = normalizeScanDraft(source.scan);

  for (const key of Object.keys(statsSource)) {
    stats[key] = formatDraftNumber(statsSource[key]);
  }

  return {
    key: createDraftKey(),
    sourceIndex,
    id: stringOrEmpty(source.id).trim(),
    display_name: stringOrEmpty(source.display_name).trim(),
    meta_description: "",
    scene: stringOrEmpty(source.scene).trim(),
    sprite: stringOrEmpty(source.sprite).trim(),
    faction: stringOrEmpty(source.faction).trim(),
    level: formatDraftNumber(source.level),
    ai_type: stringOrEmpty(source.ai_type).trim(),
    abilities: stringListFromUnknown(source.abilities),
    stats,
    can_attack: booleanFromUnknown(source.can_attack),
    comms_directory: stringListFromUnknown(source.comms_directory),
    hail_can_hail_target: booleanFromUnknown(source.hail_can_hail_target),
    hail_greeting: stringOrEmpty(source.hail_greeting).trim(),
    hail_image: stringOrEmpty(source.hail_image).trim(),
    hail_name: stringOrEmpty(source.hail_name).trim(),
    hail_portrait: stringOrEmpty(source.hail_portrait).trim(),
    is_vendor: booleanFromUnknown(source.is_vendor),
    item_drop_chance: formatDraftNumber(source.item_drop_chance),
    item_loot_table: stringOrEmpty(source.item_loot_table).trim(),
    item_no_duplicates: booleanFromUnknown(source.item_no_duplicates),
    max_mod_rarity: formatDraftNumber(source.max_mod_rarity),
    merchant_profile: stringOrEmpty(source.merchant_profile).trim(),
    min_mod_rarity: formatDraftNumber(source.min_mod_rarity),
    mob_end: formatDraftNumber(source.mob_end),
    mob_tag: stringOrEmpty(source.mob_tag).trim(),
    mod_drop_chance: formatDraftNumber(source.mod_drop_chance),
    mod_loot_table: stringOrEmpty(source.mod_loot_table).trim(),
    mod_no_duplicates: booleanFromUnknown(source.mod_no_duplicates),
    poi_require_discovery: booleanFromUnknown(source.poi_require_discovery),
    poi_show: booleanFromUnknown(source.poi_show),
    repair_cost: formatDraftNumber(source.repair_cost),
    scan_faction: scanDraft.scan_faction,
    scan_class: scanDraft.scan_class,
    scan_notes: scanDraft.scan_notes,
    scan_tiers: scanDraft.scan_tiers,
    scan_extra_json: scanDraft.scan_extra_json,
    services: stringListFromUnknown(source.services),
    extra_json: formatJsonBlock(stripKeys(source, MOB_KNOWN_TOP_LEVEL_FIELDS)),
  };
}

function normalizeImportedRoot(root: unknown) {
  if (Array.isArray(root)) {
    return {
      shape: "array" as MobLabSourceShape,
      mobs: root.map((entry, index) => normalizeImportedMob(asObject(entry), index)),
    };
  }

  if (root && typeof root === "object") {
    const entries = Object.values(root as JsonObject);
    return {
      shape: "record" as MobLabSourceShape,
      mobs: entries.map((entry, index) => normalizeImportedMob(asObject(entry), index)),
    };
  }

  throw new Error("Mob import expects a JSON array or object map.");
}

export function nextGeneratedMobId(existingIds: string[], previousId?: string) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = incrementTrailingNumber(previousId || "");

  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }

  return candidate;
}

export function createBlankMobDraft(existingIds: string[] = []): MobDraft {
  const stats = Object.fromEntries(BUILT_IN_MOB_STAT_KEYS.map((key) => [key, "0"])) as Record<string, string>;

  return {
    key: createDraftKey(),
    sourceIndex: -1,
    id: nextGeneratedMobId(existingIds, "mob_000"),
    display_name: "",
    meta_description: "",
    scene: "",
    sprite: "",
    faction: "Mob",
    level: "1",
    ai_type: "BasicAI",
    abilities: [],
    stats,
    can_attack: true,
    comms_directory: [],
    hail_can_hail_target: false,
    hail_greeting: "",
    hail_image: "",
    hail_name: "",
    hail_portrait: "",
    is_vendor: false,
    item_drop_chance: "",
    item_loot_table: "",
    item_no_duplicates: false,
    max_mod_rarity: "",
    merchant_profile: "",
    min_mod_rarity: "",
    mob_end: "",
    mob_tag: "",
    mod_drop_chance: "",
    mod_loot_table: "",
    mod_no_duplicates: false,
    poi_require_discovery: false,
    poi_show: false,
    repair_cost: "",
    scan_faction: "",
    scan_class: "",
    scan_notes: "",
    scan_tiers: [],
    scan_extra_json: "",
    services: [],
    extra_json: "",
  };
}

export function createBlankScanTierDraft(): ScanTierDraft {
  return {
    key: createDraftKey(),
    threshold: "",
    text: "",
  };
}

export function createBlankMobWorkspace(): MobLabWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    sourceShape: "array",
    parseStrategy: "strict",
    strictJsonValid: true,
    importedAt: new Date().toISOString(),
    mobs: [createBlankMobDraft()],
  };
}

export function cloneMobDraft(source: MobDraft, existingIds: string[]) {
  return {
    ...source,
    key: createDraftKey(),
    id: nextGeneratedMobId(existingIds, source.id || "mob_000"),
    display_name: source.display_name ? `${source.display_name} Copy` : "",
    meta_description: source.meta_description,
    abilities: [...source.abilities],
    stats: { ...source.stats },
    comms_directory: [...source.comms_directory],
    scan_tiers: source.scan_tiers.map((tier) => ({ ...tier, key: createDraftKey() })),
    services: [...source.services],
  } satisfies MobDraft;
}

export function importMobWorkspace(text: string, sourceLabel: string | null, sourceType: "uploaded" | "pasted" = "uploaded"): MobLabImportResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  let parsed: unknown;
  let parseStrategy: MobLabParseStrategy = "strict";
  let strictJsonValid = true;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    strictJsonValid = false;
    parseStrategy = "json5";
    parsed = JSON5.parse(cleaned);
  }

  const normalized = normalizeImportedRoot(parsed);
  return {
    workspace: {
      sourceType,
      sourceLabel,
      sourceShape: normalized.shape,
      parseStrategy,
      strictJsonValid,
      importedAt: new Date().toISOString(),
      mobs: normalized.mobs,
    },
    warnings: strictJsonValid ? [] : ["Imported with tolerant JSON5 parsing because the file is not strict JSON."],
  };
}

export function validateMobDrafts(mobs: MobDraft[]): MobValidationIssue[] {
  const issues: MobValidationIssue[] = [];
  const ids = new Map<string, string[]>();

  for (const mob of mobs) {
    const id = mob.id.trim();
    if (!id) {
      issues.push({
        level: "error",
        mobKey: mob.key,
        field: "id",
        message: "Mob ID is required.",
      });
    } else {
      const current = ids.get(id) ?? [];
      current.push(mob.key);
      ids.set(id, current);
    }

    for (const field of MOB_NUMERIC_FIELDS) {
      const value = mob[field].trim();
      if (!value) continue;
      if (Number.isNaN(Number(value))) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field,
          message: `${field} must be numeric.`,
        });
      }
    }

    for (const [statKey, value] of Object.entries(mob.stats)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (Number.isNaN(Number(trimmed))) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field: `stats.${statKey}`,
          message: `${statKey} must be numeric.`,
        });
      }
    }

    for (const [index, tier] of mob.scan_tiers.entries()) {
      const threshold = tier.threshold.trim();
      const text = tier.text.trim();
      if (!threshold && !text) continue;
      if (!threshold && text) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field: "scan_tiers",
          message: `Scan tier ${index + 1} needs a numeric threshold.`,
        });
        continue;
      }
      if (Number.isNaN(Number(threshold))) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field: "scan_tiers",
          message: `Scan tier ${index + 1} threshold must be numeric.`,
        });
      }
    }

    if (mob.scan_extra_json.trim()) {
      try {
        const scanExtra = parseObjectTextarea(mob.scan_extra_json, "Scan Extra JSON");
        const reservedKeys = Object.keys(scanExtra).filter((key) =>
          SCAN_RESERVED_KEYS.includes(key as (typeof SCAN_RESERVED_KEYS)[number]),
        );
        if (reservedKeys.length) {
          issues.push({
            level: "warning",
            mobKey: mob.key,
            field: "scan_extra_json",
            message: `Scan Extra JSON includes reserved keys that will be ignored: ${reservedKeys.join(", ")}.`,
          });
        }
      } catch (error) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field: "scan_extra_json",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (mob.extra_json.trim()) {
      try {
        const extra = parseObjectTextarea(mob.extra_json, "Extra JSON");
        const reservedKeys = Object.keys(extra).filter((key) =>
          MOB_KNOWN_TOP_LEVEL_FIELDS.includes(key as (typeof MOB_KNOWN_TOP_LEVEL_FIELDS)[number]),
        );
        if (reservedKeys.length) {
          issues.push({
            level: "warning",
            mobKey: mob.key,
            field: "extra_json",
            message: `Extra JSON includes reserved keys that will be ignored: ${reservedKeys.join(", ")}.`,
          });
        }
      } catch (error) {
        issues.push({
          level: "error",
          mobKey: mob.key,
          field: "extra_json",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  for (const [id, mobKeys] of ids.entries()) {
    if (mobKeys.length < 2) continue;
    for (const mobKey of mobKeys) {
      issues.push({
        level: "error",
        mobKey,
        field: "id",
        message: `Mob ID "${id}" already exists in this workspace.`,
      });
    }
  }

  return issues;
}

export function summarizeMobWorkspace(workspace: MobLabWorkspace | null, issues: MobValidationIssue[]): MobLabSummary {
  if (!workspace) {
    return {
      totalMobs: 0,
      factionCount: 0,
      aiTypeCount: 0,
      duplicateIdCount: 0,
      errorCount: 0,
    };
  }

  const duplicateIds = new Set(
    issues
      .filter((issue) => issue.field === "id" && issue.message.includes("already exists"))
      .map((issue) => issue.message.match(/"(.+?)"/)?.[1] ?? issue.message),
  );

  return {
    totalMobs: workspace.mobs.length,
    factionCount: new Set(workspace.mobs.map((mob) => mob.faction.trim()).filter(Boolean)).size,
    aiTypeCount: new Set(workspace.mobs.map((mob) => mob.ai_type.trim()).filter(Boolean)).size,
    duplicateIdCount: duplicateIds.size,
    errorCount: issues.filter((issue) => issue.level === "error").length,
  };
}

export function serializeMobDraft(mob: MobDraft) {
  const extra = parseObjectTextarea(mob.extra_json, "Extra JSON");
  const scan = buildScanObject(mob);
  const stats = orderedStatKeys(mob.stats).reduce<Record<string, number>>((accumulator, key) => {
    const value = mob.stats[key]?.trim();
    if (!value) return accumulator;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error(`${key} must be numeric.`);
    }
    accumulator[key] = parsed;
    return accumulator;
  }, {});

  const abilities = mob.abilities.map((entry) => entry.trim()).filter(Boolean).map((entry) => parseScalar(entry));
  const services = mob.services.map((entry) => entry.trim()).filter(Boolean);
  const commsDirectory = mob.comms_directory.map((entry) => entry.trim()).filter(Boolean);

  const known = cleanObject({
    id: mob.id.trim(),
    display_name: mob.display_name.trim(),
    scene: mob.scene.trim(),
    sprite: mob.sprite.trim(),
    faction: mob.faction.trim(),
    level: parseScalar(mob.level),
    abilities: abilities.filter((entry) => entry !== undefined),
    ai_type: mob.ai_type.trim(),
    can_attack: mob.can_attack,
    is_vendor: mob.is_vendor,
    merchant_profile: mob.merchant_profile.trim(),
    repair_cost: parseScalar(mob.repair_cost),
    services,
    comms_directory: commsDirectory,
    hail_can_hail_target: mob.hail_can_hail_target,
    hail_name: mob.hail_name.trim(),
    hail_greeting: mob.hail_greeting.trim(),
    hail_image: mob.hail_image.trim(),
    hail_portrait: mob.hail_portrait.trim(),
    poi_show: mob.poi_show,
    poi_require_discovery: mob.poi_require_discovery,
    mob_tag: mob.mob_tag.trim(),
    mob_end: parseScalar(mob.mob_end),
    item_loot_table: mob.item_loot_table.trim(),
    item_drop_chance: parseScalar(mob.item_drop_chance),
    item_no_duplicates: mob.item_no_duplicates,
    mod_loot_table: mob.mod_loot_table.trim(),
    mod_drop_chance: parseScalar(mob.mod_drop_chance),
    min_mod_rarity: parseScalar(mob.min_mod_rarity),
    max_mod_rarity: parseScalar(mob.max_mod_rarity),
    mod_no_duplicates: mob.mod_no_duplicates,
    scan,
    stats,
  });

  const next = { ...known } as JsonObject;
  for (const [key, value] of Object.entries(extra)) {
    if (MOB_KNOWN_TOP_LEVEL_FIELDS.includes(key as (typeof MOB_KNOWN_TOP_LEVEL_FIELDS)[number])) continue;
    next[key] = value;
  }

  return next;
}

export function serializeMobWorkspace(workspace: MobLabWorkspace) {
  const serialized = workspace.mobs.map((mob) => serializeMobDraft(mob));
  if (workspace.sourceShape === "record") {
    return serialized.reduce<Record<string, unknown>>((accumulator, mob) => {
      accumulator[String(mob.id)] = mob;
      return accumulator;
    }, {});
  }
  return serialized;
}

export function stringifyMobWorkspace(workspace: MobLabWorkspace) {
  return JSON.stringify(serializeMobWorkspace(workspace), null, 2);
}

export function stringifySingleMob(mob: MobDraft) {
  return JSON.stringify(serializeMobDraft(mob), null, 2);
}

export function updateMobDraftAt(
  workspace: MobLabWorkspace,
  mobKey: string,
  updater: (current: MobDraft) => MobDraft,
) {
  return {
    ...workspace,
    mobs: workspace.mobs.map((mob) => (mob.key === mobKey ? updater(mob) : mob)),
  };
}

export function deleteMobDraftAt(workspace: MobLabWorkspace, mobKey: string) {
  return {
    ...workspace,
    mobs: workspace.mobs.filter((mob) => mob.key !== mobKey),
  };
}

export function insertMobDraftAfter(workspace: MobLabWorkspace, afterMobKey: string | null, nextMob: MobDraft) {
  if (!afterMobKey) {
    return {
      ...workspace,
      mobs: [...workspace.mobs, nextMob],
    };
  }

  const index = workspace.mobs.findIndex((mob) => mob.key === afterMobKey);
  if (index === -1) {
    return {
      ...workspace,
      mobs: [...workspace.mobs, nextMob],
    };
  }

  return {
    ...workspace,
    mobs: [...workspace.mobs.slice(0, index + 1), nextMob, ...workspace.mobs.slice(index + 1)],
  };
}

export function duplicateMobIdMap(mobs: MobDraft[]) {
  const byId = new Map<string, string[]>();
  for (const mob of mobs) {
    const id = mob.id.trim();
    if (!id) continue;
    const current = byId.get(id) ?? [];
    current.push(mob.key);
    byId.set(id, current);
  }

  return new Map(Array.from(byId.entries()).filter(([, mobKeys]) => mobKeys.length > 1));
}

export function mobFieldBooleanDefaults() {
  return Object.fromEntries(MOB_BOOLEAN_FIELDS.map((key) => [key, false])) as Record<string, boolean>;
}
