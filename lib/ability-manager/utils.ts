import { parseLooseJson } from "@lib/json";
import { STATUS_EFFECT_MODIFIER_KEYS } from "@lib/ability-manager/types";
import type {
  AbilityDraft,
  AbilityEffectLink,
  AbilityManagerDatabase,
  AbilityManagerStatusEffectOption,
  AbilityManagerSummary,
  AbilityManagerValidationIssue,
  AbilityLinkSource,
  StatusEffectModifierMap,
  StatusEffectDraft,
} from "@lib/ability-manager/types";

type JsonObject = Record<string, unknown>;

let abilityDraftCounter = 10_000;
let statusEffectDraftCounter = 10_000;

function createAbilityKey() {
  abilityDraftCounter += 1;
  return `ability-client-${abilityDraftCounter}`;
}

function createStatusEffectKey() {
  statusEffectDraftCounter += 1;
  return `status-effect-client-${statusEffectDraftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function cleanObject(source: JsonObject) {
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as JsonObject).length === 0) continue;
    next[key] = value;
  }
  return next;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return slug || "entry";
}

function parseJsonBlock(text: string, label: string) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = parseLooseJson<unknown>(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as JsonObject;
}

function parseNumberField(value: string, label: string, issues: AbilityManagerValidationIssue[], draftKey: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numberValue = Number(trimmed);
  if (!Number.isFinite(numberValue)) {
    issues.push({
      level: "error",
      draftKey,
      field,
      message: `${label} must be numeric.`,
    });
    return undefined;
  }
  return numberValue;
}

function parseNumericId(value: string) {
  const numberValue = Number(value.trim());
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
}

function nextNumericId(existingIds: string[], minimum = 1) {
  const numericIds = existingIds
    .map(parseNumericId)
    .filter((value): value is number => value !== null);
  const maxId = numericIds.length ? Math.max(...numericIds) : minimum - 1;
  return String(Math.max(maxId + 1, minimum));
}

function nextFileName(existingFileNames: string[], baseFileName: string) {
  const taken = new Set(existingFileNames.map((fileName) => fileName.trim().toLowerCase()).filter(Boolean));
  const extension = ".json";
  const strippedBase = baseFileName.toLowerCase().endsWith(extension) ? baseFileName.slice(0, -extension.length) : baseFileName;
  let candidate = `${strippedBase}.json`;
  let index = 1;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${strippedBase}_${index}.json`;
    index += 1;
  }
  return candidate;
}

function formatModifierLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sortModifierKeys(keys: Iterable<string>) {
  const knownOrder = new Map<string, number>(STATUS_EFFECT_MODIFIER_KEYS.map((key, index) => [key, index]));
  return [...new Set(keys)].sort((left, right) => {
    const leftOrder = knownOrder.get(left);
    const rightOrder = knownOrder.get(right);
    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.localeCompare(right);
  });
}

function createDefaultModifierMap(defaultValue = "0"): StatusEffectModifierMap {
  return Object.fromEntries(STATUS_EFFECT_MODIFIER_KEYS.map((key) => [key, defaultValue]));
}

function validateModifierMap(modifiers: StatusEffectModifierMap, label: string, issues: AbilityManagerValidationIssue[], draftKey: string, field: string) {
  for (const key of sortModifierKeys(Object.keys(modifiers))) {
    const value = modifiers[key] ?? "";
    const trimmed = value.trim();
    if (!trimmed) {
      issues.push({
        level: "error",
        draftKey,
        field,
        message: `${label} ${formatModifierLabel(key)} must be numeric.`,
      });
      continue;
    }
    parseNumberField(trimmed, `${label} ${formatModifierLabel(key)}`, issues, draftKey, field);
  }
}

function exportModifierMap(modifiers: StatusEffectModifierMap) {
  return Object.fromEntries(
    sortModifierKeys(Object.keys(modifiers)).map((key) => {
      const trimmed = (modifiers[key] ?? "").trim();
      return [key, trimmed ? Number(trimmed) : 0];
    }),
  );
}

export function inferAbilityDeliveryType(draft: AbilityDraft) {
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

export function computeAbilityLinkedEffects(draft: AbilityDraft, statusEffectOptions: AbilityManagerStatusEffectOption[]) {
  const grouped = new Map<number, Set<AbilityLinkSource>>();
  const statusEffectMap = new Map(statusEffectOptions.map((entry) => [entry.numericId, entry] as const));

  for (const link of draft.linkedEffects) {
    const current = grouped.get(link.numericId) ?? new Set<AbilityLinkSource>();
    for (const source of link.sources) {
      if (source !== "json") current.add(source);
    }
    grouped.set(link.numericId, current);
  }

  for (const effectId of draft.appliesEffectIds) {
    const numericId = parseNumericId(effectId);
    if (numericId === null) continue;
    const current = grouped.get(numericId) ?? new Set<AbilityLinkSource>();
    current.add("json");
    grouped.set(numericId, current);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(
      ([numericId, sources]): AbilityEffectLink => {
        const option = statusEffectMap.get(numericId);
        return {
          numericId,
          sources: [...sources],
          effectId: option?.effectId ?? null,
          effectName: option?.name ?? null,
          missing: !option,
        };
      },
    );
}

export function statusEffectOptionsFromDatabase(database: AbilityManagerDatabase | null): AbilityManagerStatusEffectOption[] {
  if (!database) return [];
  const seen = new Set<number>();
  return database.statusEffects
    .map((effect) => {
      const numericId = parseNumericId(effect.numericId);
      if (numericId === null) return null;
      if (seen.has(numericId)) return null;
      seen.add(numericId);
      return {
        numericId,
        effectId: effect.effectId,
        name: effect.name || effect.effectId || `Status ${numericId}`,
      };
    })
    .filter((entry): entry is AbilityManagerStatusEffectOption => entry !== null)
    .sort((left, right) => left.numericId - right.numericId);
}

export function createBlankAbility(existingIds: string[] = [], existingFileNames: string[] = []) {
  const id = nextNumericId(existingIds, 1);
  return {
    key: createAbilityKey(),
    sourceIndex: -1,
    id,
    fileName: nextFileName(existingFileNames, `${id.padStart(3, "0")}_new_ability`),
    script: "",
    deliveryType: "other",
    name: "",
    description: "",
    icon: "",
    threatType: "",
    threatMultiplier: "",
    validTargets: "",
    facingRequirement: "",
    minRangeType: "",
    maxRangeType: "",
    isGcdLocked: false,
    cooldown: "",
    chargeTime: "",
    energyCost: "",
    attackRange: "",
    powerPercent: "",
    baseDamage: "",
    projectileScene: "",
    appliesEffectIds: [],
    extraPropertiesJson: "",
    extraRootJson: "",
    linkedEffects: [],
    scriptPathResolved: null,
    sourcePath: null,
  } satisfies AbilityDraft;
}

export function cloneAbilityDraft(source: AbilityDraft, existingIds: string[] = [], existingFileNames: string[] = []) {
  const id = nextNumericId(existingIds, Math.max(parseNumericId(source.id) ?? 0, 0) + 1);
  return {
    ...source,
    key: createAbilityKey(),
    id,
    fileName: nextFileName(existingFileNames, `${id.padStart(3, "0")}_${slugify(source.name || source.fileName.replace(/\.json$/i, ""))}`),
    appliesEffectIds: [...source.appliesEffectIds],
    linkedEffects: [...source.linkedEffects],
  } satisfies AbilityDraft;
}

export function createBlankStatusEffect(existingNumericIds: string[] = [], existingFileNames: string[] = []) {
  const numericId = nextNumericId(existingNumericIds, 101);
  return {
    key: createStatusEffectKey(),
    sourceIndex: -1,
    numericId,
    fileName: nextFileName(existingFileNames, `${numericId}_new_status_effect`),
    script: "res://scripts/combat/StatusEffect.gd",
    effectId: "",
    name: "",
    description: "",
    icon: "",
    effectType: "0",
    duration: "",
    tickInterval: "",
    threatMultiplier: "1",
    isBuff: false,
    isDispellable: true,
    canStack: false,
    maxStacks: "1",
    showDuration: true,
    flatModifiers: createDefaultModifierMap("0"),
    percentModifiers: createDefaultModifierMap("0"),
    extraPropertiesJson: "",
    extraRootJson: "",
    linkedAbilityIds: [],
    linkedAbilityNames: [],
    sourcePath: null,
  } satisfies StatusEffectDraft;
}

export function cloneStatusEffectDraft(source: StatusEffectDraft, existingNumericIds: string[] = [], existingFileNames: string[] = []) {
  const numericId = nextNumericId(existingNumericIds, Math.max(parseNumericId(source.numericId) ?? 100, 100) + 1);
  return {
    ...source,
    key: createStatusEffectKey(),
    numericId,
    fileName: nextFileName(existingFileNames, `${numericId}_${slugify(source.effectId || source.name || source.fileName.replace(/\.json$/i, ""))}`),
    flatModifiers: { ...source.flatModifiers },
    percentModifiers: { ...source.percentModifiers },
    linkedAbilityIds: [...source.linkedAbilityIds],
    linkedAbilityNames: [...source.linkedAbilityNames],
  } satisfies StatusEffectDraft;
}

export function updateAbilityAt(database: AbilityManagerDatabase, draftKey: string, updater: (current: AbilityDraft) => AbilityDraft) {
  return {
    ...database,
    abilities: database.abilities.map((draft) => (draft.key === draftKey ? updater(draft) : draft)),
  };
}

export function insertAbilityAfter(database: AbilityManagerDatabase, afterKey: string | null, nextDraft: AbilityDraft) {
  if (!afterKey) {
    return { ...database, abilities: [nextDraft, ...database.abilities] };
  }
  const next = [...database.abilities];
  const index = next.findIndex((draft) => draft.key === afterKey);
  if (index === -1) next.unshift(nextDraft);
  else next.splice(index + 1, 0, nextDraft);
  return { ...database, abilities: next };
}

export function deleteAbilityAt(database: AbilityManagerDatabase, draftKey: string) {
  return {
    ...database,
    abilities: database.abilities.filter((draft) => draft.key !== draftKey),
  };
}

export function updateStatusEffectAt(database: AbilityManagerDatabase, draftKey: string, updater: (current: StatusEffectDraft) => StatusEffectDraft) {
  return {
    ...database,
    statusEffects: database.statusEffects.map((draft) => (draft.key === draftKey ? updater(draft) : draft)),
  };
}

export function insertStatusEffectAfter(database: AbilityManagerDatabase, afterKey: string | null, nextDraft: StatusEffectDraft) {
  if (!afterKey) {
    return { ...database, statusEffects: [nextDraft, ...database.statusEffects] };
  }
  const next = [...database.statusEffects];
  const index = next.findIndex((draft) => draft.key === afterKey);
  if (index === -1) next.unshift(nextDraft);
  else next.splice(index + 1, 0, nextDraft);
  return { ...database, statusEffects: next };
}

export function deleteStatusEffectAt(database: AbilityManagerDatabase, draftKey: string) {
  return {
    ...database,
    statusEffects: database.statusEffects.filter((draft) => draft.key !== draftKey),
  };
}

export function validateAbilityDrafts(abilities: AbilityDraft[], statusEffectOptions: AbilityManagerStatusEffectOption[]) {
  const issues: AbilityManagerValidationIssue[] = [];
  const idMap = new Map<string, string[]>();
  const fileMap = new Map<string, string[]>();
  const statusIds = new Set(statusEffectOptions.map((entry) => entry.numericId));

  for (const draft of abilities) {
    const id = draft.id.trim();
    if (!id) {
      issues.push({ level: "error", draftKey: draft.key, field: "id", message: "Ability id is required." });
    } else {
      const current = idMap.get(id) ?? [];
      current.push(draft.key);
      idMap.set(id, current);
      if (parseNumericId(id) === null) {
        issues.push({ level: "warning", draftKey: draft.key, field: "id", message: "Ability id is not numeric. Runtime indices are usually numeric." });
      }
    }

    const fileName = draft.fileName.trim();
    if (!fileName) {
      issues.push({ level: "error", draftKey: draft.key, field: "fileName", message: "Ability file name is required." });
    } else {
      const current = fileMap.get(fileName.toLowerCase()) ?? [];
      current.push(draft.key);
      fileMap.set(fileName.toLowerCase(), current);
      if (!fileName.toLowerCase().endsWith(".json")) {
        issues.push({ level: "warning", draftKey: draft.key, field: "fileName", message: "Ability file names should end in .json." });
      }
    }

    if (!draft.name.trim()) {
      issues.push({ level: "warning", draftKey: draft.key, field: "name", message: "Ability name is blank." });
    }
    if (!draft.script.trim()) {
      issues.push({ level: "warning", draftKey: draft.key, field: "script", message: "Ability script path is blank." });
    }
    if (!["energy", "beam", "projectile", "other"].includes(draft.deliveryType)) {
      issues.push({ level: "error", draftKey: draft.key, field: "deliveryType", message: "Delivery Type must be energy, beam, projectile, or other." });
    }

    parseNumberField(draft.threatType, "Threat Type", issues, draft.key, "threatType");
    parseNumberField(draft.threatMultiplier, "Threat Multiplier", issues, draft.key, "threatMultiplier");
    parseNumberField(draft.validTargets, "Valid Targets", issues, draft.key, "validTargets");
    parseNumberField(draft.facingRequirement, "Facing Requirement", issues, draft.key, "facingRequirement");
    parseNumberField(draft.minRangeType, "Min Range Type", issues, draft.key, "minRangeType");
    parseNumberField(draft.maxRangeType, "Max Range Type", issues, draft.key, "maxRangeType");
    parseNumberField(draft.cooldown, "Cooldown", issues, draft.key, "cooldown");
    parseNumberField(draft.chargeTime, "Charge Time", issues, draft.key, "chargeTime");
    parseNumberField(draft.energyCost, "Energy Cost", issues, draft.key, "energyCost");
    parseNumberField(draft.attackRange, "Attack Range", issues, draft.key, "attackRange");
    parseNumberField(draft.powerPercent, "Power Percent", issues, draft.key, "powerPercent");
    parseNumberField(draft.baseDamage, "Base Damage", issues, draft.key, "baseDamage");

    try {
      parseJsonBlock(draft.extraPropertiesJson, "Additional runtime JSON");
    } catch (error) {
      issues.push({ level: "error", draftKey: draft.key, field: "extraPropertiesJson", message: error instanceof Error ? error.message : String(error) });
    }
    try {
      parseJsonBlock(draft.extraRootJson, "Additional root JSON");
    } catch (error) {
      issues.push({ level: "error", draftKey: draft.key, field: "extraRootJson", message: error instanceof Error ? error.message : String(error) });
    }

    for (const effectId of draft.appliesEffectIds) {
      const numericId = parseNumericId(effectId);
      if (numericId === null) {
        issues.push({ level: "error", draftKey: draft.key, field: "appliesEffectIds", message: `Linked status effect id "${effectId}" is not numeric.` });
      } else if (!statusIds.has(numericId)) {
        issues.push({ level: "warning", draftKey: draft.key, field: "appliesEffectIds", message: `Linked status effect ${numericId} does not exist in the current workspace.` });
      }
    }
  }

  for (const [id, keys] of idMap.entries()) {
    if (keys.length < 2) continue;
    for (const draftKey of keys) {
      issues.push({ level: "error", draftKey, field: "id", message: `Ability id "${id}" already exists in this workspace.` });
    }
  }

  for (const [fileName, keys] of fileMap.entries()) {
    if (keys.length < 2) continue;
    for (const draftKey of keys) {
      issues.push({ level: "error", draftKey, field: "fileName", message: `Ability file name "${fileName}" already exists in this workspace.` });
    }
  }

  return issues;
}

export function validateStatusEffectDrafts(statusEffects: StatusEffectDraft[]) {
  const issues: AbilityManagerValidationIssue[] = [];
  const numericIdMap = new Map<string, string[]>();
  const effectIdMap = new Map<string, string[]>();
  const fileMap = new Map<string, string[]>();

  for (const draft of statusEffects) {
    const numericId = draft.numericId.trim();
    if (!numericId) {
      issues.push({ level: "error", draftKey: draft.key, field: "numericId", message: "Status effect numeric id is required." });
    } else {
      const current = numericIdMap.get(numericId) ?? [];
      current.push(draft.key);
      numericIdMap.set(numericId, current);
      if (parseNumericId(numericId) === null) {
        issues.push({ level: "error", draftKey: draft.key, field: "numericId", message: "Status effect numeric id must be numeric." });
      }
    }

    const effectId = draft.effectId.trim();
    if (!effectId) {
      issues.push({ level: "warning", draftKey: draft.key, field: "effectId", message: "Status effect properties.id is blank." });
    } else {
      const current = effectIdMap.get(effectId) ?? [];
      current.push(draft.key);
      effectIdMap.set(effectId, current);
    }

    const fileName = draft.fileName.trim();
    if (!fileName) {
      issues.push({ level: "error", draftKey: draft.key, field: "fileName", message: "Status effect file name is required." });
    } else {
      const current = fileMap.get(fileName.toLowerCase()) ?? [];
      current.push(draft.key);
      fileMap.set(fileName.toLowerCase(), current);
      if (!fileName.toLowerCase().endsWith(".json")) {
        issues.push({ level: "warning", draftKey: draft.key, field: "fileName", message: "Status effect file names should end in .json." });
      }
    }

    if (!draft.name.trim()) issues.push({ level: "warning", draftKey: draft.key, field: "name", message: "Status effect name is blank." });

    parseNumberField(draft.effectType, "Effect Type", issues, draft.key, "effectType");
    parseNumberField(draft.duration, "Duration", issues, draft.key, "duration");
    parseNumberField(draft.tickInterval, "Tick Interval", issues, draft.key, "tickInterval");
    parseNumberField(draft.threatMultiplier, "Threat Multiplier", issues, draft.key, "threatMultiplier");
    parseNumberField(draft.maxStacks, "Max Stacks", issues, draft.key, "maxStacks");
    validateModifierMap(draft.flatModifiers, "Flat Modifier", issues, draft.key, "flatModifiers");
    validateModifierMap(draft.percentModifiers, "Percent Modifier", issues, draft.key, "percentModifiers");
    try {
      parseJsonBlock(draft.extraPropertiesJson, "Additional runtime JSON");
    } catch (error) {
      issues.push({ level: "error", draftKey: draft.key, field: "extraPropertiesJson", message: error instanceof Error ? error.message : String(error) });
    }
    try {
      parseJsonBlock(draft.extraRootJson, "Additional root JSON");
    } catch (error) {
      issues.push({ level: "error", draftKey: draft.key, field: "extraRootJson", message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const [numericId, keys] of numericIdMap.entries()) {
    if (keys.length < 2) continue;
    for (const draftKey of keys) {
      issues.push({ level: "error", draftKey, field: "numericId", message: `Status effect numeric id "${numericId}" already exists in this workspace.` });
    }
  }

  for (const [effectId, keys] of effectIdMap.entries()) {
    if (keys.length < 2) continue;
    for (const draftKey of keys) {
      issues.push({ level: "warning", draftKey, field: "effectId", message: `Status effect properties.id "${effectId}" already exists in this workspace.` });
    }
  }

  for (const [fileName, keys] of fileMap.entries()) {
    if (keys.length < 2) continue;
    for (const draftKey of keys) {
      issues.push({ level: "error", draftKey, field: "fileName", message: `Status effect file name "${fileName}" already exists in this workspace.` });
    }
  }

  return issues;
}

function exportAbilityObject(draft: AbilityDraft) {
  const properties = cleanObject({
    delivery_type: draft.deliveryType,
    threat_type: draft.threatType.trim() ? Number(draft.threatType.trim()) : undefined,
    threat_multiplier: draft.threatMultiplier.trim() ? Number(draft.threatMultiplier.trim()) : undefined,
    valid_targets: draft.validTargets.trim() ? Number(draft.validTargets.trim()) : undefined,
    facing_requirement: draft.facingRequirement.trim() ? Number(draft.facingRequirement.trim()) : undefined,
    name: draft.name.trim(),
    description: draft.description.trim(),
    icon: draft.icon.trim(),
    min_range_type: draft.minRangeType.trim() ? Number(draft.minRangeType.trim()) : undefined,
    max_range_type: draft.maxRangeType.trim() ? Number(draft.maxRangeType.trim()) : undefined,
    is_gcd_locked: draft.isGcdLocked,
    cooldown: draft.cooldown.trim() ? Number(draft.cooldown.trim()) : undefined,
    charge_time: draft.chargeTime.trim() ? Number(draft.chargeTime.trim()) : undefined,
    energy_cost: draft.energyCost.trim() ? Number(draft.energyCost.trim()) : undefined,
    attack_range: draft.attackRange.trim() ? Number(draft.attackRange.trim()) : undefined,
    power_percent: draft.powerPercent.trim() ? Number(draft.powerPercent.trim()) : undefined,
    base_damage: draft.baseDamage.trim() ? Number(draft.baseDamage.trim()) : undefined,
    projectile_scene: draft.projectileScene.trim(),
    ...(draft.appliesEffectIds.length ? { applies_effect_ids: draft.appliesEffectIds.map((entry) => Number(entry)) } : {}),
    ...parseJsonBlock(draft.extraPropertiesJson, "Additional runtime JSON"),
  });

  return cleanObject({
    ...parseJsonBlock(draft.extraRootJson, "Additional root JSON"),
    id: parseNumericId(draft.id) ?? draft.id.trim(),
    script: draft.script.trim(),
    properties,
  });
}

function exportStatusEffectObject(draft: StatusEffectDraft) {
  const properties = cleanObject({
    id: draft.effectId.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    icon: draft.icon.trim(),
    effect_type: draft.effectType.trim() ? Number(draft.effectType.trim()) : undefined,
    duration: draft.duration.trim() ? Number(draft.duration.trim()) : undefined,
    tick_interval: draft.tickInterval.trim() ? Number(draft.tickInterval.trim()) : undefined,
    threat_multiplier: draft.threatMultiplier.trim() ? Number(draft.threatMultiplier.trim()) : undefined,
    is_buff: draft.isBuff,
    is_dispellable: draft.isDispellable,
    can_stack: draft.canStack,
    max_stacks: draft.maxStacks.trim() ? Number(draft.maxStacks.trim()) : undefined,
    show_duration: draft.showDuration,
    flat_modifiers: exportModifierMap(draft.flatModifiers),
    percent_modifiers: exportModifierMap(draft.percentModifiers),
    ...parseJsonBlock(draft.extraPropertiesJson, "Additional runtime JSON"),
  });

  return cleanObject({
    ...parseJsonBlock(draft.extraRootJson, "Additional root JSON"),
    id: parseNumericId(draft.numericId) ?? draft.numericId.trim(),
    script: draft.script.trim(),
    properties,
  });
}

export function stringifyAbilityDraft(draft: AbilityDraft) {
  return JSON.stringify(exportAbilityObject(draft), null, 2);
}

export function stringifyStatusEffectDraft(draft: StatusEffectDraft) {
  return JSON.stringify(exportStatusEffectObject(draft), null, 2);
}

export function stringifyAbilityIndexJson(abilities: AbilityDraft[]) {
  const index = Object.fromEntries(
    abilities
      .slice()
      .sort((left, right) => (parseNumericId(left.id) ?? 0) - (parseNumericId(right.id) ?? 0))
      .map((draft) => [String(parseNumericId(draft.id) ?? draft.id.trim()), `res://data/database/abilities/json/${draft.fileName.trim()}`]),
  );
  return JSON.stringify(index, null, 2);
}

export function stringifyStatusEffectIndexJson(statusEffects: StatusEffectDraft[]) {
  const index = Object.fromEntries(
    statusEffects
      .slice()
      .sort((left, right) => (parseNumericId(left.numericId) ?? 0) - (parseNumericId(right.numericId) ?? 0))
      .map((draft) => [String(parseNumericId(draft.numericId) ?? draft.numericId.trim()), `data/database/status_effects/json/${draft.fileName.trim()}`]),
  );
  return JSON.stringify(index, null, 2);
}

export function buildAbilityBundleFiles(abilities: AbilityDraft[]) {
  const files: Record<string, string> = {
    "data/database/abilities/json/_AbilityIndex.json": stringifyAbilityIndexJson(abilities),
  };

  for (const draft of abilities) {
    files[`data/database/abilities/json/${draft.fileName.trim()}`] = stringifyAbilityDraft(draft);
  }

  return files;
}

export function buildStatusEffectBundleFiles(statusEffects: StatusEffectDraft[]) {
  const files: Record<string, string> = {
    "data/database/status_effects/_StatusEffectIndex.json": stringifyStatusEffectIndexJson(statusEffects),
  };

  for (const draft of statusEffects) {
    files[`data/database/status_effects/json/${draft.fileName.trim()}`] = stringifyStatusEffectDraft(draft);
  }

  return files;
}

export function summarizeAbilityManager(
  database: AbilityManagerDatabase | null,
  abilityIssues: AbilityManagerValidationIssue[],
  statusEffectIssues: AbilityManagerValidationIssue[],
): AbilityManagerSummary {
  if (!database) {
    return {
      totalAbilities: 0,
      totalStatusEffects: 0,
      projectileCount: 0,
      beamCount: 0,
      linkedAbilityCount: 0,
      warningCount: 0,
      errorCount: 0,
    };
  }

  return {
    totalAbilities: database.abilities.length,
    totalStatusEffects: database.statusEffects.length,
    projectileCount: database.abilities.filter((draft) => inferAbilityDeliveryType(draft) === "projectile").length,
    beamCount: database.abilities.filter((draft) => inferAbilityDeliveryType(draft) === "beam").length,
    linkedAbilityCount: database.abilities.filter((draft) => draft.linkedEffects.length > 0).length,
    warningCount:
      abilityIssues.filter((issue) => issue.level === "warning").length +
      statusEffectIssues.filter((issue) => issue.level === "warning").length +
      database.diagnostics.filter((issue) => issue.level === "warning").length,
    errorCount:
      abilityIssues.filter((issue) => issue.level === "error").length +
      statusEffectIssues.filter((issue) => issue.level === "error").length +
      database.diagnostics.filter((issue) => issue.level === "error").length,
  };
}
