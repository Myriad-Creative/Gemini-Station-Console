import fs from "fs";
import path from "path";
import { parseLooseJson } from "@lib/json";
import { normalizeAbilityReference } from "@lib/ability-manager/utils";
import { STATUS_EFFECT_MODIFIER_KEYS } from "@lib/ability-manager/types";
import type {
  AbilityDraft,
  AbilityEffectLink,
  AbilityLinkSource,
  AbilityManagerDatabase,
  AbilityManagerDiagnostic,
  AbilityManagerModOption,
  StatusEffectModifierMap,
  StatusEffectDraft,
} from "@lib/ability-manager/types";
import { parseMods } from "@parser/mods";

type JsonObject = Record<string, unknown>;

const ABILITIES_JSON_DIR = path.join("data", "database", "abilities", "json");
const STATUS_EFFECTS_JSON_DIR = path.join("data", "database", "status_effects", "json");

let abilityDraftCounter = 0;
let statusEffectDraftCounter = 0;

function createAbilityKey() {
  abilityDraftCounter += 1;
  return `ability-draft-${abilityDraftCounter}`;
}

function createStatusEffectKey() {
  statusEffectDraftCounter += 1;
  return `status-effect-draft-${statusEffectDraftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stableJsonBlock(value: unknown) {
  const objectValue = asObject(value);
  if (!Object.keys(objectValue).length) return "";
  return JSON.stringify(objectValue, null, 2);
}

function normalizeModifierMap(value: unknown) {
  const objectValue = asObject(value);
  const keys = [...new Set([...STATUS_EFFECT_MODIFIER_KEYS, ...Object.keys(objectValue)])].sort((left, right) => {
    const leftIndex = STATUS_EFFECT_MODIFIER_KEYS.indexOf(left as (typeof STATUS_EFFECT_MODIFIER_KEYS)[number]);
    const rightIndex = STATUS_EFFECT_MODIFIER_KEYS.indexOf(right as (typeof STATUS_EFFECT_MODIFIER_KEYS)[number]);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.localeCompare(right);
  });

  return Object.fromEntries(
    keys.map((key) => {
      const raw = objectValue[key];
      return [key, raw === undefined || raw === null || raw === "" ? "0" : String(raw)];
    }),
  ) as StatusEffectModifierMap;
}

function stripKnownKeys(source: JsonObject, keys: string[]) {
  const next: JsonObject = {};
  const known = new Set(keys);
  for (const [key, value] of Object.entries(source)) {
    if (known.has(key)) continue;
    next[key] = value;
  }
  return next;
}

function listJsonFiles(dir: string) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json") && !entry.name.startsWith("_"))
      .map((entry) => path.join(dir, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [] as string[];
  }
}

function readTextFile(filePath: string) {
  return fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
}

function parseJsonObjectFile(filePath: string) {
  const text = readTextFile(filePath);
  const parsed = parseLooseJson<unknown>(text);
  return asObject(parsed);
}

function detectDuplicateJsonObjectKeys(text: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const pattern = /^\s*"([^"]+)"\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const key = match[1];
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function resolveIndexedJsonPath(gameRoot: string, rawPath: string, defaultDir: string) {
  const trimmed = String(rawPath || "").trim();
  if (!trimmed) return path.join(defaultDir, path.basename(trimmed));
  if (trimmed.startsWith("res://")) return path.join(gameRoot, trimmed.slice("res://".length));
  if (trimmed.startsWith("data/")) return path.join(gameRoot, trimmed);
  return path.join(defaultDir, path.basename(trimmed));
}

function resolveScriptPath(gameRoot: string, scriptPath: unknown) {
  const value = String(scriptPath ?? "").trim();
  if (!value) return null;
  if (value.startsWith("res://")) return path.join(gameRoot, value.slice("res://".length));
  return path.join(gameRoot, value.replace(/^\/+/, ""));
}

function parseNumericIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((entry) => {
      const numberValue = Number(entry);
      return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
    })
    .filter((entry): entry is number => entry !== null);
}

function inferEffectLinksFromScript(scriptPath: string | null) {
  if (!scriptPath || !fs.existsSync(scriptPath)) return [] as { numericId: number; source: AbilityLinkSource }[];
  const text = readTextFile(scriptPath);
  const seen = new Map<number, Set<AbilityLinkSource>>();

  const constantPattern = /const\s+EFFECT_TID\s*:\s*int\s*=\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = constantPattern.exec(text))) {
    const numericId = Number(match[1]);
    if (!Number.isFinite(numericId)) continue;
    const current = seen.get(numericId) ?? new Set<AbilityLinkSource>();
    current.add("script_constant");
    seen.set(numericId, current);
  }

  const fallbackPattern = /apply_effect_by_id\((\d+)/g;
  while ((match = fallbackPattern.exec(text))) {
    const numericId = Number(match[1]);
    if (!Number.isFinite(numericId)) continue;
    const current = seen.get(numericId) ?? new Set<AbilityLinkSource>();
    current.add("script_fallback");
    seen.set(numericId, current);
  }

  return [...seen.entries()].flatMap(([numericId, sources]) => [...sources].map((source) => ({ numericId, source })));
}

function parseAbilityFileId(raw: JsonObject, indexedId: string, fileName: string) {
  const rawId = raw.id ?? indexedId;
  if (rawId !== undefined && rawId !== null && String(rawId).trim()) return String(rawId);
  const base = path.basename(fileName, ".json");
  const numericPrefix = base.match(/^(\d+)/)?.[1];
  return numericPrefix || base;
}

function inferLoadedDeliveryType(rawDeliveryType: unknown, properties: JsonObject, draftSeed: { script: string; fileName: string; name: string; projectileScene: string }) {
  const normalized = String(rawDeliveryType ?? "").trim().toLowerCase();
  if (normalized === "energy" || normalized === "beam" || normalized === "projectile" || normalized === "other") {
    return normalized;
  }
  const script = draftSeed.script.toLowerCase();
  const fileName = draftSeed.fileName.toLowerCase();
  const name = draftSeed.name.toLowerCase();
  if (draftSeed.projectileScene.trim()) return "projectile";
  if (script.includes("beam") || fileName.includes("beam") || name.includes("beam")) return "beam";
  if (script.includes("cannon") || script.includes("shot") || script.includes("bolt") || script.includes("blast") || script.includes("strike")) return "energy";
  if (fileName.includes("cannon") || fileName.includes("shot") || fileName.includes("bolt") || fileName.includes("blast") || fileName.includes("strike")) return "energy";
  if (name.includes("cannon") || name.includes("shot") || name.includes("bolt") || name.includes("blast") || name.includes("strike")) return "energy";
  if (properties.power_percent !== undefined || properties.base_damage !== undefined) return "energy";
  return "other";
}

function classifyAbilityDeliveryType(draft: AbilityDraft) {
  if (draft.deliveryType) return draft.deliveryType;
  const script = draft.script.toLowerCase();
  const fileName = draft.fileName.toLowerCase();
  const name = draft.name.toLowerCase();
  if (draft.projectileScene.trim()) return "projectile";
  if (script.includes("beam") || fileName.includes("beam") || name.includes("beam")) return "beam";
  if (script.includes("cannon") || script.includes("shot") || script.includes("bolt") || script.includes("blast") || script.includes("strike")) return "energy";
  if (fileName.includes("cannon") || fileName.includes("shot") || fileName.includes("bolt") || fileName.includes("blast") || fileName.includes("strike")) return "energy";
  if (name.includes("cannon") || name.includes("shot") || name.includes("bolt") || name.includes("blast") || name.includes("strike")) return "energy";
  return "other";
}

function buildEffectLinkEntries(
  numericIds: { numericId: number; source: AbilityLinkSource }[],
  statusEffectMap: Map<number, StatusEffectDraft>,
) {
  const grouped = new Map<number, Set<AbilityLinkSource>>();
  for (const { numericId, source } of numericIds) {
    const current = grouped.get(numericId) ?? new Set<AbilityLinkSource>();
    current.add(source);
    grouped.set(numericId, current);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(
      ([numericId, sources]): AbilityEffectLink => {
        const effect = statusEffectMap.get(numericId);
        return {
          numericId,
          sources: [...sources],
          effectId: effect?.effectId ?? null,
          effectName: effect?.name ?? null,
          missing: !effect,
        };
      },
    );
}

function loadStatusEffects(gameRoot: string, diagnostics: AbilityManagerDiagnostic[]) {
  const statusRoot = path.join(gameRoot, STATUS_EFFECTS_JSON_DIR);
  const indexPath = path.join(gameRoot, "data", "database", "status_effects", "_StatusEffectIndex.json");
  const fileMap = new Map<string, { indexedId: string; indexedPath: string | null }>();

  if (fs.existsSync(indexPath)) {
    const indexText = readTextFile(indexPath);
    for (const duplicateKey of detectDuplicateJsonObjectKeys(indexText)) {
      diagnostics.push({
        level: "warning",
        message: `Status effect index contains a duplicate key "${duplicateKey}".`,
      });
    }

    const parsedIndex = asObject(parseLooseJson<unknown>(indexText));
    for (const [indexedId, rawPath] of Object.entries(parsedIndex)) {
      const absolutePath = resolveIndexedJsonPath(gameRoot, String(rawPath ?? ""), statusRoot);
      fileMap.set(path.resolve(absolutePath), { indexedId, indexedPath: String(rawPath ?? "") || null });
      if (!fs.existsSync(absolutePath)) {
        diagnostics.push({
          level: "warning",
          message: `Status effect index entry ${indexedId} points to a missing file: ${rawPath}`,
        });
      }
    }
  }

  for (const file of listJsonFiles(statusRoot)) {
    if (!fileMap.has(path.resolve(file))) {
      fileMap.set(path.resolve(file), {
        indexedId: path.basename(file, ".json").match(/^(\d+)/)?.[1] ?? path.basename(file, ".json"),
        indexedPath: null,
      });
      diagnostics.push({
        level: "warning",
        message: `Status effect file ${path.basename(file)} exists but is not listed in _StatusEffectIndex.json.`,
      });
    }
  }

  const effects: StatusEffectDraft[] = [];
  for (const [absolutePath, indexed] of [...fileMap.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (!fs.existsSync(absolutePath)) continue;
    try {
      const raw = parseJsonObjectFile(absolutePath);
      const properties = asObject(raw.properties);
      const numericId = indexed.indexedId || path.basename(absolutePath, ".json").match(/^(\d+)/)?.[1] || String(raw.id ?? "");
      if (raw.id !== undefined && String(raw.id).trim() && String(raw.id).trim() !== String(numericId)) {
        diagnostics.push({
          level: "warning",
          message: `Status effect file ${path.basename(absolutePath)} has root id ${String(raw.id).trim()} but index/file id ${String(numericId)} is being used.`,
        });
      }
      const extraProperties = stripKnownKeys(properties, [
        "id",
        "name",
        "description",
        "icon",
        "effect_type",
        "duration",
        "tick_interval",
        "threat_multiplier",
        "is_buff",
        "is_dispellable",
        "can_stack",
        "max_stacks",
        "show_duration",
        "flat_modifiers",
        "percent_modifiers",
      ]);
      const extraRoot = stripKnownKeys(raw, ["id", "script", "properties"]);

      effects.push({
        key: createStatusEffectKey(),
        sourceIndex: effects.length,
        numericId: String(numericId).trim(),
        fileName: path.basename(absolutePath),
        script: String(raw.script ?? "").trim(),
        effectId: String(properties.id ?? "").trim(),
        name: String(properties.name ?? "").trim(),
        description: String(properties.description ?? "").trim(),
        icon: String(properties.icon ?? "").trim(),
        effectType: String(properties.effect_type ?? "").trim(),
        duration: properties.duration === undefined || properties.duration === null ? "" : String(properties.duration),
        tickInterval: properties.tick_interval === undefined || properties.tick_interval === null ? "" : String(properties.tick_interval),
        threatMultiplier: properties.threat_multiplier === undefined || properties.threat_multiplier === null ? "" : String(properties.threat_multiplier),
        isBuff: Boolean(properties.is_buff),
        isDispellable: Boolean(properties.is_dispellable),
        canStack: Boolean(properties.can_stack),
        maxStacks: properties.max_stacks === undefined || properties.max_stacks === null ? "" : String(properties.max_stacks),
        showDuration: Boolean(properties.show_duration),
        flatModifiers: normalizeModifierMap(properties.flat_modifiers),
        percentModifiers: normalizeModifierMap(properties.percent_modifiers),
        extraPropertiesJson: stableJsonBlock(extraProperties),
        extraRootJson: stableJsonBlock(extraRoot),
        linkedAbilityIds: [],
        linkedAbilityNames: [],
        sourcePath: absolutePath,
      });
    } catch (error) {
      diagnostics.push({
        level: "error",
        message: `Could not parse status effect file ${path.basename(absolutePath)}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return effects;
}

function loadAbilities(gameRoot: string, statusEffects: StatusEffectDraft[], diagnostics: AbilityManagerDiagnostic[]) {
  const abilityRoot = path.join(gameRoot, ABILITIES_JSON_DIR);
  const indexPath = path.join(abilityRoot, "_AbilityIndex.json");
  const fileMap = new Map<string, { indexedId: string; indexedPath: string | null }>();
  const statusEffectMap = new Map(
    statusEffects
      .map((effect) => {
        const numericId = Number(effect.numericId);
        return Number.isFinite(numericId) ? [numericId, effect] : null;
      })
      .filter((entry): entry is [number, StatusEffectDraft] => entry !== null),
  );

  if (fs.existsSync(indexPath)) {
    const indexText = readTextFile(indexPath);
    for (const duplicateKey of detectDuplicateJsonObjectKeys(indexText)) {
      diagnostics.push({
        level: "warning",
        message: `Ability index contains a duplicate key "${duplicateKey}".`,
      });
    }

    const parsedIndex = asObject(parseLooseJson<unknown>(indexText));
    for (const [indexedId, rawPath] of Object.entries(parsedIndex)) {
      const absolutePath = resolveIndexedJsonPath(gameRoot, String(rawPath ?? ""), abilityRoot);
      fileMap.set(path.resolve(absolutePath), { indexedId, indexedPath: String(rawPath ?? "") || null });
      if (!fs.existsSync(absolutePath)) {
        diagnostics.push({
          level: "warning",
          message: `Ability index entry ${indexedId} points to a missing file: ${rawPath}`,
        });
      }
    }
  }

  for (const file of listJsonFiles(abilityRoot)) {
    if (!fileMap.has(path.resolve(file))) {
      fileMap.set(path.resolve(file), {
        indexedId: path.basename(file, ".json").match(/^(\d+)/)?.[1] ?? path.basename(file, ".json"),
        indexedPath: null,
      });
      diagnostics.push({
        level: "warning",
        message: `Ability file ${path.basename(file)} exists but is not listed in _AbilityIndex.json.`,
      });
    }
  }

  const abilities: AbilityDraft[] = [];
  for (const [absolutePath, indexed] of [...fileMap.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (!fs.existsSync(absolutePath)) continue;
    try {
      const raw = parseJsonObjectFile(absolutePath);
      const properties = asObject(raw.properties);
      const scriptPathResolved = resolveScriptPath(gameRoot, raw.script);
      const scriptEffectIds = inferEffectLinksFromScript(scriptPathResolved);
      const linkedEffects = buildEffectLinkEntries(scriptEffectIds, statusEffectMap);
      const extraProperties = stripKnownKeys(properties, [
        "delivery_type",
        "threat_type",
        "threat_multiplier",
        "valid_targets",
        "requires_target",
        "facing_requirement",
        "name",
        "description",
        "icon",
        "min_range_type",
        "max_range_type",
        "is_gcd_locked",
        "cooldown",
        "charge_time",
        "energy_cost",
        "minimumModLevel",
        "apply_effects_to_caster",
        "effect_vfx_scene",
        "attack_range",
        "power_percent",
        "base_damage",
        "projectile_scene",
        "applies_effect_ids",
      ]);
      const extraRoot = stripKnownKeys(raw, ["id", "script", "properties"]);

      const draftSeed = {
        script: String(raw.script ?? "").trim(),
        fileName: path.basename(absolutePath),
        name: String(properties.name ?? "").trim(),
        projectileScene: String(properties.projectile_scene ?? "").trim(),
      };
      abilities.push({
        key: createAbilityKey(),
        sourceIndex: abilities.length,
        id: parseAbilityFileId(raw, indexed.indexedId, path.basename(absolutePath)),
        fileName: path.basename(absolutePath),
        script: String(raw.script ?? "").trim(),
        deliveryType: inferLoadedDeliveryType(properties.delivery_type, properties, draftSeed),
        name: String(properties.name ?? "").trim(),
        description: String(properties.description ?? "").trim(),
        icon: String(properties.icon ?? "").trim(),
        threatType: properties.threat_type === undefined || properties.threat_type === null ? "" : String(properties.threat_type),
        threatMultiplier: properties.threat_multiplier === undefined || properties.threat_multiplier === null ? "" : String(properties.threat_multiplier),
        validTargets: properties.valid_targets === undefined || properties.valid_targets === null ? "" : String(properties.valid_targets),
        requiresTarget: Boolean(properties.requires_target),
        facingRequirement: properties.facing_requirement === undefined || properties.facing_requirement === null ? "" : String(properties.facing_requirement),
        minRangeType: properties.min_range_type === undefined || properties.min_range_type === null ? "" : String(properties.min_range_type),
        maxRangeType: properties.max_range_type === undefined || properties.max_range_type === null ? "" : String(properties.max_range_type),
        isGcdLocked: Boolean(properties.is_gcd_locked),
        cooldown: properties.cooldown === undefined || properties.cooldown === null ? "" : String(properties.cooldown),
        chargeTime: properties.charge_time === undefined || properties.charge_time === null ? "" : String(properties.charge_time),
        energyCost: properties.energy_cost === undefined || properties.energy_cost === null ? "" : String(properties.energy_cost),
        minimumModLevel: properties.minimumModLevel === undefined || properties.minimumModLevel === null ? "" : String(properties.minimumModLevel),
        applyEffectsToCaster: Boolean(properties.apply_effects_to_caster),
        effectVfxScene: String(properties.effect_vfx_scene ?? "").trim(),
        attackRange: properties.attack_range === undefined || properties.attack_range === null ? "" : String(properties.attack_range),
        powerPercent: properties.power_percent === undefined || properties.power_percent === null ? "" : String(properties.power_percent),
        baseDamage: properties.base_damage === undefined || properties.base_damage === null ? "" : String(properties.base_damage),
        projectileScene: String(properties.projectile_scene ?? "").trim(),
        appliesEffectIds: parseNumericIdList(properties.applies_effect_ids).map(String),
        extraPropertiesJson: stableJsonBlock(extraProperties),
        extraRootJson: stableJsonBlock(extraRoot),
        linkedEffects,
        scriptPathResolved,
        sourcePath: absolutePath,
      });
    } catch (error) {
      diagnostics.push({
        level: "error",
        message: `Could not parse ability file ${path.basename(absolutePath)}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return abilities;
}

function loadMods(gameRoot: string) {
  return parseMods(gameRoot).map<AbilityManagerModOption>((mod) => ({
    id: mod.id.trim(),
    name: mod.name.trim() || mod.id.trim() || "Unnamed Mod",
    slot: mod.slot.trim(),
    rarity: mod.rarity,
    levelRequirement: mod.levelRequirement,
    description: mod.description?.trim() ?? "",
    abilityIds: [...new Set((mod.abilities ?? []).map((entry) => normalizeAbilityReference(entry)).filter(Boolean))],
  }));
}

function enrichStatusEffectsWithAbilityLinks(abilities: AbilityDraft[], statusEffects: StatusEffectDraft[]) {
  const byStatusId = new Map<string, { abilityIds: string[]; abilityNames: string[] }>();
  for (const ability of abilities) {
    for (const link of ability.linkedEffects) {
      const key = String(link.numericId);
      const current = byStatusId.get(key) ?? { abilityIds: [], abilityNames: [] };
      if (!current.abilityIds.includes(ability.id)) current.abilityIds.push(ability.id);
      const label = ability.name || ability.id;
      if (!current.abilityNames.includes(label)) current.abilityNames.push(label);
      byStatusId.set(key, current);
    }
  }

  return statusEffects.map((effect) => {
    const links = byStatusId.get(effect.numericId) ?? { abilityIds: [], abilityNames: [] };
    return {
      ...effect,
      linkedAbilityIds: links.abilityIds,
      linkedAbilityNames: links.abilityNames,
    };
  });
}

export function loadAbilityManagerDatabase(gameRoot: string): AbilityManagerDatabase {
  const diagnostics: AbilityManagerDiagnostic[] = [];
  const statusEffects = loadStatusEffects(gameRoot, diagnostics);
  const abilities = loadAbilities(gameRoot, statusEffects, diagnostics);
  const mods = loadMods(gameRoot);
  const enrichedStatusEffects = enrichStatusEffectsWithAbilityLinks(abilities, statusEffects);
  const modCatalogAvailable = fs.existsSync(path.join(gameRoot, "data", "database", "mods", "Mods.json"));

  const statusIds = new Set(enrichedStatusEffects.map((effect) => effect.numericId.trim()).filter(Boolean));
  const abilityIds = new Set<string>();
  for (const ability of abilities) {
    const id = ability.id.trim();
    if (!id) continue;
    if (abilityIds.has(id)) {
      diagnostics.push({
        level: "warning",
        message: `Duplicate ability id "${id}" detected in the local game root.`,
      });
    }
    abilityIds.add(id);

    for (const link of ability.linkedEffects) {
      if (!statusIds.has(String(link.numericId))) {
        diagnostics.push({
          level: "warning",
          message: `Ability "${ability.name || ability.id}" links to missing status effect ${link.numericId}.`,
        });
      }
    }
  }

  const effectIds = new Set<string>();
  for (const effect of enrichedStatusEffects) {
    const numericId = effect.numericId.trim();
    if (numericId) {
      if (effectIds.has(numericId)) {
        diagnostics.push({
          level: "warning",
          message: `Duplicate status effect numeric id "${numericId}" detected in the local game root.`,
        });
      }
      effectIds.add(numericId);
    }
  }

  return {
    sourceLabel: "Local game root",
    loadedAt: new Date().toISOString(),
    abilities,
    statusEffects: enrichedStatusEffects.map((effect) => {
      const numericId = Number(effect.numericId);
      const relatedAbilities = abilities.filter((ability) => ability.linkedEffects.some((link) => link.numericId === numericId));
      return {
        ...effect,
        linkedAbilityIds: relatedAbilities.map((ability) => ability.id),
        linkedAbilityNames: relatedAbilities.map((ability) => ability.name || ability.id),
      };
    }),
    mods,
    modCatalogAvailable,
    diagnostics,
  };
}

export function inferAbilityDeliveryType(draft: AbilityDraft) {
  return classifyAbilityDeliveryType(draft);
}
