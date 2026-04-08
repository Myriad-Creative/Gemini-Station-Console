import {
  MOD_MAX_ABILITIES,
  MOD_MAX_STATS,
  MOD_REQUIRED_LEVEL_MAX,
  MOD_REQUIRED_LEVEL_MIN,
  calculateModBudgetSummary,
  clampModRequiredLevel,
  getModSupportedStatCounts,
  getModStatBudgetConfig,
  getModStatMaxAtRequiredLevel,
  isSignedModStat,
} from "@lib/mod-budget";

export type ValidationLevel = "error" | "warning";

export interface ValidationMessage {
  level: ValidationLevel;
  scope: "missions" | "mods";
  draftIndex?: number;
  itemId?: string;
  message: string;
}

export interface MissionObjectiveDraft {
  id: string;
  type: string;
  target_ids: string[];
  count: string;
  description: string;
  extraJson: string;
}

export interface DialogueLineDraft {
  id: string;
  speaker_id: string;
  speaker_name: string;
  text: string;
  mood: string;
  extraJson: string;
}

export interface MissionStepDraft {
  id: string;
  title: string;
  description: string;
  objectives: MissionObjectiveDraft[];
  dialogue: DialogueLineDraft[];
  completionDialogue: DialogueLineDraft[];
  extraJson: string;
}

export interface MissionDraft {
  id: string;
  title: string;
  giver_id: string;
  faction: string;
  repeatable: boolean;
  level: string;
  arcs: string[];
  tags: string[];
  prerequisites: string[];
  steps: MissionStepDraft[];
  notes: string;
  extraJson: string;
}

export interface ModStatDraft {
  key: string;
  value: string;
}

export interface ModAbilityDraft {
  id: string;
  budgetCost: string;
}

export interface ModGeneratedNameMetadata {
  displayName: string;
  source: "phrase_override" | "two_word_fallback" | "prefixed_phrase_override" | "prefixed_fallback";
  threatSign?: "positive" | "negative";
  corePhrase?: string;
  selectedPrefix?: string;
  descriptor?: string;
  baseTerm?: string;
  component?: string;
  modifier?: string;
  collisionResolved?: boolean;
}

export interface ModGeneratorMetadata {
  generatedBy: "auto";
  requestedRoles: string[];
  requestedSlots: string[];
  requestedStats: string[];
  roleId: string;
  slotId: string;
  level: number;
  rarity: number;
  primaryStat: string;
  secondaryStats: string[];
  abilityPool: Array<number | string>;
  selectedAbilities: Array<number | string>;
  finalRolledStats: Record<string, number>;
  threatSign?: "positive" | "negative";
  naming?: ModGeneratedNameMetadata;
}

export interface ModDraft {
  id: string;
  name: string;
  slot: string;
  classRestriction: string[];
  statsCapOverride: boolean;
  isQuestReward: boolean;
  isDungeonDrop: boolean;
  isBossDrop: boolean;
  levelRequirement: string;
  itemLevel: string;
  rarity: string;
  durability: string;
  sellPrice: string;
  stats: ModStatDraft[];
  abilities: ModAbilityDraft[];
  icon: string;
  description: string;
  extraJson: string;
  generatorMeta?: ModGeneratorMetadata;
}

export interface BulkModTemplateDraft {
  slot: string;
  classRestriction: string[];
  levelRequirement: string;
  rarity: string;
  durability: string;
  sellPrice: string;
  stats: ModStatDraft[];
  abilities: ModAbilityDraft[];
  icon: string;
  description: string;
}

type JsonObject = Record<string, unknown>;

export const MISSION_STORAGE_KEY = "gemini.console.authoring.missions.v1";
export const MISSION_WORKSPACE_SEED_KEY = `${MISSION_STORAGE_KEY}.workspace-seed`;
export const MOD_STORAGE_KEY = "gemini.console.authoring.mods.v1";
export const MISSION_CREATOR_CLEARED_EVENT = "gemini:mission-creator-workspace-cleared";

export function clearMissionCreatorWorkspaceStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MISSION_STORAGE_KEY);
  window.localStorage.removeItem(MISSION_WORKSPACE_SEED_KEY);
  window.dispatchEvent(new CustomEvent(MISSION_CREATOR_CLEARED_EVENT));
}

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "mod_001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    const nextValue = String(Number(digits) + 1).padStart(digits.length, "0");
    return `${prefix}${nextValue}`;
  }

  return `${trimmed}_001`;
}

export function nextGeneratedModId(existingIds: string[], previousId?: string) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = incrementTrailingNumber(previousId || existingIds[existingIds.length - 1] || "");

  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }

  return candidate;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function sanitizeFilenamePart(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildUniqueFilenames(values: string[]) {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const current = seen.get(value) ?? 0;
    seen.set(value, current + 1);
    if (!current) return value;

    const extensionIndex = value.lastIndexOf(".");
    const stem = extensionIndex === -1 ? value : value.slice(0, extensionIndex);
    const extension = extensionIndex === -1 ? "" : value.slice(extensionIndex);
    return `${stem}_${current + 1}${extension}`;
  });
}

function prettyExtraJson(value: JsonObject) {
  return Object.keys(value).length ? JSON.stringify(value, null, 2) : "";
}

function extractExtraJsonObject(value: unknown): JsonObject | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      return extractExtraJsonObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as JsonObject;
  const nested = "extraJson" in source ? extractExtraJsonObject(source.extraJson) ?? {} : {};
  const current = stripKeys(source, ["extraJson"]);
  return { ...nested, ...current };
}

function normalizeStoredExtraJson(value: unknown) {
  const extracted = extractExtraJsonObject(value);
  if (extracted) {
    return prettyExtraJson(extracted);
  }
  return typeof value === "string" ? value.trim() : prettyExtraJson(asObject(value));
}

function stripKeys(value: JsonObject, keys: string[]) {
  const hidden = new Set(keys);
  const out: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!hidden.has(key)) out[key] = entry;
  }
  return out;
}

function cleanObject<T extends JsonObject>(value: T): T {
  const out: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (entry === "") continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    if (entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) continue;
    out[key] = entry;
  }
  return out as T;
}

function parseScalarString(value: string): string | number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function normalizeGeneratorMetadata(value: unknown): ModGeneratorMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as JsonObject;
  const roleId = String(source.roleId ?? "").trim();
  const slotId = String(source.slotId ?? "").trim();
  const primaryStat = String(source.primaryStat ?? "").trim();
  if (!roleId || !slotId || !primaryStat) return undefined;

  const finalRolledStatsSource = asObject(source.finalRolledStats);
  const finalRolledStats = Object.fromEntries(
    Object.entries(finalRolledStatsSource)
      .map(([key, entry]) => [key, typeof entry === "number" ? entry : Number(entry)])
      .filter(([, entry]) => Number.isFinite(entry)),
  ) as Record<string, number>;

  const namingSource = asObject(source.naming);
  const displayName = String(namingSource.displayName ?? "").trim();
  const sourceType = String(namingSource.source ?? "").trim();
  const normalizedNaming =
    displayName && ["phrase_override", "two_word_fallback", "prefixed_phrase_override", "prefixed_fallback"].includes(sourceType)
      ? {
          displayName,
          source: sourceType as ModGeneratedNameMetadata["source"],
          threatSign:
            namingSource.threatSign === "positive" || namingSource.threatSign === "negative"
              ? (namingSource.threatSign as "positive" | "negative")
              : undefined,
          corePhrase: String(namingSource.corePhrase ?? namingSource.phrase ?? "").trim() || undefined,
          selectedPrefix: String(namingSource.selectedPrefix ?? "").trim() || undefined,
          descriptor: String(namingSource.descriptor ?? "").trim() || undefined,
          baseTerm: String(namingSource.baseTerm ?? "").trim() || undefined,
          component: String(namingSource.component ?? "").trim() || undefined,
          modifier: String(namingSource.modifier ?? "").trim() || undefined,
          collisionResolved: Boolean(namingSource.collisionResolved),
        }
      : undefined;

  return {
    generatedBy: "auto",
    requestedRoles: stringList(source.requestedRoles),
    requestedSlots: stringList(source.requestedSlots),
    requestedStats: stringList(source.requestedStats),
    roleId,
    slotId,
    level: Number(source.level ?? 0),
    rarity: Number(source.rarity ?? 0),
    primaryStat,
    secondaryStats: stringList(source.secondaryStats),
    abilityPool: stringList(source.abilityPool).map((entry) => parseScalarString(entry) ?? entry),
    selectedAbilities: stringList(source.selectedAbilities).map((entry) => parseScalarString(entry) ?? entry),
    finalRolledStats,
    threatSign:
      source.threatSign === "positive" || source.threatSign === "negative"
        ? (source.threatSign as "positive" | "negative")
        : undefined,
    naming: normalizedNaming,
  };
}

function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function looksLikeMission(value: JsonObject) {
  return (
    "id" in value ||
    "title" in value ||
    "steps" in value ||
    "objectives" in value ||
    "giver_id" in value ||
    "availability" in value ||
    "repeatable" in value
  );
}

function looksLikeMod(value: JsonObject) {
  return (
    "id" in value ||
    "name" in value ||
    "slot" in value ||
    "mod_slot" in value ||
    "stats" in value ||
    "rarity" in value
  );
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeMissionCollectionEntries(raw: unknown, keyName: string): unknown[] | null {
  const source = asObject(raw);
  const nested = source[keyName];
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return Object.entries(nested as JsonObject).map(([key, value]) => {
      const entry = asObject(value);
      return { id: entry.id ?? key, ...entry };
    });
  }
  return null;
}

export function uid(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function listFromCsv(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function listFromLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function csvFromList(values: string[]) {
  return values.join(", ");
}

export function numberString(input: unknown) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input !== "number" && typeof input !== "string") return "";
  return String(input);
}

function formatDraftNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  const normalized = Object.is(value, -0) ? 0 : value;
  return Number.isInteger(normalized) ? String(normalized) : String(Number(normalized.toFixed(2)));
}

export function parseNumber(input: string) {
  if (!input.trim()) return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

export function clampLevelInput(input: string) {
  const parsed = parseNumber(input);
  if (parsed === undefined) return input;
  return String(clampModRequiredLevel(parsed));
}

export function createModAbilityDraft(id = "", budgetCost = ""): ModAbilityDraft {
  return { id, budgetCost };
}

export function calculateDerivedSellPrice(levelRequirementInput: string, rarityInput: string) {
  const levelRequirement = parseNumber(levelRequirementInput.trim() ? clampLevelInput(levelRequirementInput).trim() : "");
  const rarity = parseNumber(rarityInput);
  if (levelRequirement === undefined || rarity === undefined) return undefined;

  const rarityMultiplier = rarity <= 0 ? 0.5 : rarity;
  return Math.ceil(levelRequirement * rarityMultiplier);
}

export function buildModBudgetSummary(mod: ModDraft) {
  return calculateModBudgetSummary({
    requiredLevel: parseNumber(mod.levelRequirement),
    rarity: parseNumber(mod.rarity),
    stats: mod.stats.map((entry) => ({
      key: entry.key.trim(),
      value: parseNumber(entry.value),
    })),
    abilities: mod.abilities.map((entry) => ({
      id: entry.id.trim(),
      budgetCost: parseNumber(entry.budgetCost),
    })),
  });
}

export function autoBalanceModDraft(
  mod: ModDraft,
  options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
) {
  const budget = buildModBudgetSummary(mod);
  let activeStatIndex = 0;

  const nextStats = mod.stats.map((stat) => {
    const key = stat.key.trim();
    if (!key) return stat;

    const statBudget = budget.stats[activeStatIndex];
    activeStatIndex += 1;
    if (!statBudget || statBudget.key !== key) return stat;

    const numericValue = parseNumber(stat.value);
    if (!mod.statsCapOverride && options.syncAllStatValuesToMax && statBudget.effectiveMaxValue !== undefined && statBudget.effectiveMaxValue > 0) {
      return {
        ...stat,
        value: formatDraftNumber(statBudget.effectiveMaxValue),
      };
    }

    if (!stat.value.trim() && options.fillBlankStatValues && statBudget.effectiveMaxValue !== undefined && statBudget.effectiveMaxValue > 0) {
      return {
        ...stat,
        value: formatDraftNumber(statBudget.effectiveMaxValue),
      };
    }

    if (mod.statsCapOverride) {
      return stat;
    }

    const clampMax = statBudget.currentMaxValue ?? statBudget.effectiveMaxValue;
    if (numericValue !== undefined && clampMax !== undefined && Math.abs(numericValue) > clampMax) {
      return {
        ...stat,
        value: formatDraftNumber(Math.sign(numericValue || 1) * clampMax),
      };
    }

    return stat;
  });

  return syncDerivedModFields({
    ...mod,
    stats: nextStats,
  });
}

export function syncDerivedModFields(mod: ModDraft): ModDraft {
  const budget = buildModBudgetSummary(mod);
  const normalizedLevelRequirement = mod.levelRequirement.trim() ? clampLevelInput(mod.levelRequirement).trim() : "";
  const derivedSellPrice = calculateDerivedSellPrice(normalizedLevelRequirement, mod.rarity);
  return {
    ...mod,
    levelRequirement: normalizedLevelRequirement,
    itemLevel: budget.itemLevel === undefined ? "" : String(budget.itemLevel),
    sellPrice: derivedSellPrice === undefined ? "" : String(derivedSellPrice),
    extraJson: normalizeStoredExtraJson(mod.extraJson),
  };
}

export function parseExtraJson(input: string): JsonObject {
  if (!input.trim()) return {};
  const value = JSON.parse(input);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Extra JSON must be an object.");
  }
  return value as JsonObject;
}

export function safeExtraJson(input: string): JsonObject {
  try {
    return parseExtraJson(input);
  } catch {
    return {};
  }
}

function normalizeImportedDialogueLine(raw: unknown): DialogueLineDraft {
  const source = asObject(raw);
  return {
    id: String(source.id ?? uid("line")),
    speaker_id: String(source.speaker_id ?? source.speakerId ?? ""),
    speaker_name: String(source.speaker_name ?? source.speakerName ?? source.speaker ?? ""),
    text: String(source.text ?? ""),
    mood: String(source.mood ?? source.emotion ?? ""),
    extraJson: prettyExtraJson(
      stripKeys(source, ["id", "speaker_id", "speakerId", "speaker_name", "speakerName", "speaker", "text", "mood", "emotion"]),
    ),
  };
}

function normalizeImportedObjective(raw: unknown): MissionObjectiveDraft {
  const source = asObject(raw);
  return {
    id: String(source.id ?? uid("objective")),
    type: String(source.type ?? "custom"),
    target_ids: Array.isArray(source.target_ids)
      ? (source.target_ids as unknown[]).map((entry) => String(entry))
      : source.target_id !== undefined
        ? [String(source.target_id)]
        : [],
    count: numberString(source.count ?? ""),
    description: String(source.description ?? ""),
    extraJson: prettyExtraJson(stripKeys(source, ["id", "type", "target_ids", "target_id", "count", "description"])),
  };
}

function normalizeImportedStep(raw: unknown, fallbackTitle: string): MissionStepDraft {
  const source = asObject(raw);
  return {
    id: String(source.id ?? uid("step")),
    title: String(source.title ?? fallbackTitle),
    description: String(source.description ?? ""),
    objectives: Array.isArray(source.objectives)
      ? (source.objectives as unknown[]).map((objective) => normalizeImportedObjective(objective))
      : [],
    dialogue: Array.isArray(source.dialogue)
      ? (source.dialogue as unknown[]).map((line) => normalizeImportedDialogueLine(line))
      : [],
    completionDialogue: Array.isArray(source.completion_dialogue)
      ? (source.completion_dialogue as unknown[]).map((line) => normalizeImportedDialogueLine(line))
      : Array.isArray(source.completionDialogue)
        ? (source.completionDialogue as unknown[]).map((line) => normalizeImportedDialogueLine(line))
        : [],
    extraJson: prettyExtraJson(
      stripKeys(source, ["id", "title", "description", "objectives", "dialogue", "completion_dialogue", "completionDialogue"]),
    ),
  };
}

function extractPrerequisiteIds(source: JsonObject) {
  const nestedPrerequisites = asObject(source.prerequisites);
  if (Array.isArray(nestedPrerequisites.mission_ids)) {
    return (nestedPrerequisites.mission_ids as unknown[]).map((entry) => String(entry)).filter(Boolean);
  }
  if (Array.isArray(source.required_missions)) {
    return (source.required_missions as unknown[]).map((entry) => String(entry)).filter(Boolean);
  }
  if (Array.isArray(source.prerequisites)) {
    return (source.prerequisites as unknown[])
      .map((entry) => {
        if (typeof entry === "string" || typeof entry === "number") return String(entry);
        const prerequisite = asObject(entry);
        return String(prerequisite.mission_id ?? prerequisite.id ?? "");
      })
      .filter(Boolean);
  }
  return [];
}

export function createObjectiveDraft(type = "custom"): MissionObjectiveDraft {
  return {
    id: uid("objective"),
    type,
    target_ids: [],
    count: "1",
    description: "",
    extraJson: "",
  };
}

export function createDialogueLineDraft(): DialogueLineDraft {
  return {
    id: uid("line"),
    speaker_id: "",
    speaker_name: "",
    text: "",
    mood: "",
    extraJson: "",
  };
}

export function createMissionStepDraft(title = "New Step"): MissionStepDraft {
  return {
    id: uid("step"),
    title,
    description: "",
    objectives: [createObjectiveDraft("talk")],
    dialogue: [],
    completionDialogue: [],
    extraJson: "",
  };
}

export function createMissionDraft(): MissionDraft {
  return {
    id: "",
    title: "",
    giver_id: "",
    faction: "",
    repeatable: false,
    level: "",
    arcs: [],
    tags: [],
    prerequisites: [],
    steps: [createMissionStepDraft("Step 1")],
    notes: "",
    extraJson: "",
  };
}

export function createModDraft(existingIds: string[] = [], previousId?: string): ModDraft {
  return syncDerivedModFields({
    id: nextGeneratedModId(existingIds, previousId),
    name: "",
    slot: "",
    classRestriction: ["None"],
    statsCapOverride: false,
    isQuestReward: false,
    isDungeonDrop: false,
    isBossDrop: false,
    levelRequirement: "",
    itemLevel: "",
    rarity: "0",
    durability: "",
    sellPrice: "",
    stats: [],
    abilities: [],
    icon: "",
    description: "",
    extraJson: "",
    generatorMeta: undefined,
  });
}

export function hydrateStoredMissionDraft(raw: unknown): MissionDraft {
  const source = asObject(raw);
  const normalized = normalizeImportedMission(source);
  return {
    ...normalized,
    notes: String(source.notes ?? normalized.notes ?? ""),
    extraJson: normalizeStoredExtraJson(source.extraJson ?? normalized.extraJson),
  };
}

export function hydrateStoredModDraft(raw: unknown): ModDraft {
  const source = asObject(raw);

  const stats = Array.isArray(source.stats)
    ? (source.stats as unknown[]).map((entry) => {
        const stat = asObject(entry);
        return {
          key: String(stat.key ?? ""),
          value: numberString(stat.value),
        };
      })
    : [];

  const abilities = Array.isArray(source.abilities)
    ? (source.abilities as unknown[]).map((entry) => {
        const ability = asObject(entry);
        return createModAbilityDraft(String(ability.id ?? ""), numberString(ability.budgetCost ?? ability.budget_cost ?? ""));
      })
    : [];

  return syncDerivedModFields({
    id: String(source.id ?? ""),
    name: String(source.name ?? ""),
    slot: String(source.slot ?? ""),
    classRestriction: stringList(source.classRestriction).length
      ? stringList(source.classRestriction)
      : stringList(source.class_restriction),
    statsCapOverride: parseBooleanFlag(source.statsCapOverride ?? source.stats_cap_override),
    isQuestReward: parseBooleanFlag(source.isQuestReward ?? source.is_quest_reward),
    isDungeonDrop: parseBooleanFlag(source.isDungeonDrop ?? source.is_dungeon_drop),
    isBossDrop: parseBooleanFlag(source.isBossDrop ?? source.is_boss_drop),
    levelRequirement: numberString(source.levelRequirement ?? source.level_requirement),
    itemLevel: numberString(source.itemLevel ?? source.item_level),
    rarity: numberString(source.rarity ?? 0),
    durability: numberString(source.durability),
    sellPrice: numberString(source.sellPrice ?? source.sell_price),
    stats,
    abilities,
    icon: String(source.icon ?? ""),
    description: String(source.description ?? ""),
    extraJson: normalizeStoredExtraJson(source.extraJson),
    generatorMeta: normalizeGeneratorMetadata(source.generatorMeta),
  });
}

export function duplicateMissionStepDraft(step: MissionStepDraft): MissionStepDraft {
  return {
    ...JSON.parse(JSON.stringify(step)),
    id: uid("step"),
    objectives: step.objectives.map((objective) => ({
      ...JSON.parse(JSON.stringify(objective)),
      id: uid("objective"),
    })),
    dialogue: step.dialogue.map((line) => ({
      ...JSON.parse(JSON.stringify(line)),
      id: uid("line"),
    })),
    completionDialogue: step.completionDialogue.map((line) => ({
      ...JSON.parse(JSON.stringify(line)),
      id: uid("line"),
    })),
  };
}

export function duplicateMissionDraft(draft: MissionDraft): MissionDraft {
  return {
    ...JSON.parse(JSON.stringify(draft)),
    id: draft.id ? `${draft.id}_copy` : "",
    title: draft.title ? `${draft.title} Copy` : "",
    steps: draft.steps.map((step) => duplicateMissionStepDraft(step)),
  };
}

export function duplicateModDraft(draft: ModDraft, existingIds: string[] = []): ModDraft {
  return syncDerivedModFields({
    ...JSON.parse(JSON.stringify(draft)),
    id: nextGeneratedModId(existingIds, draft.id),
    name: draft.name ? `${draft.name} Copy` : "",
  });
}

export function createBulkModDrafts(
  titles: string[],
  template: BulkModTemplateDraft,
  existingIds: string[] = [],
  previousId?: string,
): ModDraft[] {
  const knownIds = [...existingIds];
  let previous = previousId;

  return titles.map((title) => {
    const draft = createModDraft(knownIds, previous);
    const nextDraft: ModDraft = {
      ...draft,
      name: title.trim(),
      slot: template.slot.trim(),
      classRestriction: [...template.classRestriction],
      statsCapOverride: draft.statsCapOverride,
      isQuestReward: draft.isQuestReward,
      isDungeonDrop: draft.isDungeonDrop,
      isBossDrop: draft.isBossDrop,
      levelRequirement: template.levelRequirement.trim(),
      itemLevel: "",
      rarity: template.rarity.trim(),
      durability: template.durability.trim(),
      sellPrice: "",
      stats: template.stats.map((stat) => ({ ...stat })),
      abilities: template.abilities.map((ability) => ({ ...ability })),
      icon: template.icon.trim(),
      description: template.description,
      extraJson: "",
    };

    const syncedDraft = syncDerivedModFields(nextDraft);

    knownIds.push(syncedDraft.id);
    previous = syncedDraft.id;
    return syncedDraft;
  });
}

export function normalizeImportedMission(raw: unknown): MissionDraft {
  const source = asObject(raw);
  const stepEntries = Array.isArray(source.steps) ? (source.steps as unknown[]) : [];
  const topObjectives = Array.isArray(source.objectives) ? (source.objectives as unknown[]) : [];
  const hasTopDialogueField = Array.isArray(source.dialogue);
  const hasTopCompletionField = Array.isArray(source.completion_dialogue) || Array.isArray(source.completionDialogue);
  const topDialogue = hasTopDialogueField ? (source.dialogue as unknown[]) : [];
  const topCompletion = Array.isArray(source.completion_dialogue)
    ? (source.completion_dialogue as unknown[])
    : Array.isArray(source.completionDialogue)
      ? (source.completionDialogue as unknown[])
      : [];

  const steps = stepEntries.length
    ? stepEntries.map((step, index) => normalizeImportedStep(step, `Step ${index + 1}`))
    : [
        {
          ...createMissionStepDraft("Step 1"),
          objectives: topObjectives.length
            ? topObjectives.map((objective) => normalizeImportedObjective(objective))
            : [createObjectiveDraft("custom")],
          dialogue: topDialogue.map((line) => normalizeImportedDialogueLine(line)),
          completionDialogue: topCompletion.map((line) => normalizeImportedDialogueLine(line)),
        },
      ];
  let consumedTopDialogue = !stepEntries.length || !hasTopDialogueField;
  let consumedTopCompletion = !stepEntries.length || !hasTopCompletionField;

  if (stepEntries.length && steps.length) {
    if (topDialogue.length && !steps[0].dialogue.length) {
      steps[0] = {
        ...steps[0],
        dialogue: topDialogue.map((line) => normalizeImportedDialogueLine(line)),
      };
      consumedTopDialogue = true;
    }
    if (topCompletion.length && !steps[0].completionDialogue.length) {
      steps[0] = {
        ...steps[0],
        completionDialogue: topCompletion.map((line) => normalizeImportedDialogueLine(line)),
      };
      consumedTopCompletion = true;
    }
  }

  const strippedKeys = [
    "id",
    "title",
    "giver_id",
    "faction",
    "repeatable",
    "availability",
    "level",
    "level_min",
    "level_max",
    "arcs",
    "tags",
    "prerequisites",
    "required_missions",
    "steps",
    "objectives",
  ];
  if (consumedTopDialogue) strippedKeys.push("dialogue");
  if (consumedTopCompletion) strippedKeys.push("completion_dialogue", "completionDialogue");

  return {
    id: String(source.id ?? ""),
    title: String(source.title ?? ""),
    giver_id: String(source.giver_id ?? ""),
    faction: String(source.faction ?? ""),
    repeatable: Boolean(source.repeatable),
    level: numberString(
      source.level ??
        asObject(source.availability).level ??
        asObject(source.availability).level_min ??
        source.level_min ??
        asObject(source.availability).level_max ??
        source.level_max,
    ),
    arcs: stringList(source.arcs),
    tags: stringList(source.tags),
    prerequisites: extractPrerequisiteIds(source),
    steps,
    notes: "",
    extraJson: prettyExtraJson(stripKeys(source, strippedKeys)),
  };
}

export function normalizeImportedMissionCollection(raw: unknown): MissionDraft[] {
  if (Array.isArray(raw)) return raw.map((entry) => normalizeImportedMission(entry));

  const nestedMissions = normalizeMissionCollectionEntries(raw, "missions");
  if (nestedMissions) return nestedMissions.map((entry) => normalizeImportedMission(entry));

  const source = asObject(raw);
  if (!Object.keys(source).length) return [];
  if (looksLikeMission(source)) return [normalizeImportedMission(source)];

  return Object.entries(source)
    .filter(([, value]) => looksLikeMission(asObject(value)))
    .map(([key, value]) => {
      const entry = asObject(value);
      return normalizeImportedMission({ id: entry.id ?? key, ...entry });
    });
}

export function normalizeImportedMod(raw: unknown): ModDraft {
  const source = asObject(raw);
  const statsSource =
    Array.isArray(source.stats)
      ? (source.stats as unknown[]).map((entry) => {
          const stat = asObject(entry);
          return {
            key: String(stat.key ?? ""),
            value: numberString(stat.value),
          };
        })
      : source.stats && typeof source.stats === "object" && !Array.isArray(source.stats)
        ? Object.entries(source.stats as Record<string, unknown>).map(([key, value]) => ({
            key,
            value: numberString(value as string | number | null | undefined),
          }))
        : [];

  const abilitiesSource = Array.isArray(source.abilities)
    ? (source.abilities as unknown[]).map((entry) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const ability = asObject(entry);
          return createModAbilityDraft(
            String(ability.id ?? ability.ability_id ?? ability.key ?? ""),
            numberString(ability.budget_cost ?? ability.budgetCost ?? ""),
          );
        }
        return createModAbilityDraft(String(entry ?? ""), "");
      })
    : [];

  const importedExtra = extractExtraJsonObject(source.extraJson) ?? {};
  const sourceExtra = stripKeys(source, [
    "id",
    "key",
    "name",
    "slot",
    "mod_slot",
    "class_restriction",
    "classRestriction",
    "stats_cap_override",
    "statsCapOverride",
    "is_quest_reward",
    "isQuestReward",
    "is_dungeon_drop",
    "isDungeonDrop",
    "is_boss_drop",
    "isBossDrop",
    "level_requirement",
    "levelRequirement",
    "item_level",
    "itemLevel",
    "rarity",
    "durability",
    "sell_price",
    "sellPrice",
    "stats",
    "abilities",
    "icon",
    "description",
    "desc",
    "extraJson",
  ]);

  return syncDerivedModFields({
    id: String(source.id ?? source.key ?? ""),
    name: String(source.name ?? source.id ?? source.key ?? ""),
    slot: String(source.slot ?? source.mod_slot ?? ""),
    classRestriction: stringList(source.class_restriction).length
      ? stringList(source.class_restriction)
      : stringList(source.classRestriction),
    statsCapOverride: parseBooleanFlag(source.stats_cap_override ?? source.statsCapOverride),
    isQuestReward: parseBooleanFlag(source.is_quest_reward ?? source.isQuestReward),
    isDungeonDrop: parseBooleanFlag(source.is_dungeon_drop ?? source.isDungeonDrop),
    isBossDrop: parseBooleanFlag(source.is_boss_drop ?? source.isBossDrop),
    levelRequirement: numberString(source.level_requirement ?? source.levelRequirement),
    itemLevel: numberString(source.item_level ?? source.itemLevel),
    rarity: numberString(source.rarity ?? 0),
    durability: numberString(source.durability),
    sellPrice: numberString(source.sell_price ?? source.sellPrice),
    stats: statsSource,
    abilities: abilitiesSource,
    icon: String(source.icon ?? ""),
    description: String(source.description ?? source.desc ?? ""),
    extraJson: prettyExtraJson({ ...importedExtra, ...sourceExtra }),
    generatorMeta: undefined,
  });
}

export function normalizeImportedModCollection(raw: unknown): ModDraft[] {
  if (Array.isArray(raw)) return raw.map((entry) => normalizeImportedMod(entry));

  const nestedMods = normalizeMissionCollectionEntries(raw, "mods");
  if (nestedMods) return nestedMods.map((entry) => normalizeImportedMod(entry));

  const source = asObject(raw);
  if (!Object.keys(source).length) return [];
  if (looksLikeMod(source)) return [normalizeImportedMod(source)];

  return Object.entries(source)
    .filter(([, value]) => looksLikeMod(asObject(value)))
    .map(([key, value]) => {
      const entry = asObject(value);
      return normalizeImportedMod({ id: entry.id ?? key, ...entry });
    });
}

function exportMissionObjective(objective: MissionObjectiveDraft) {
  const extra = safeExtraJson(objective.extraJson);
  return cleanObject({
    ...extra,
    id: objective.id.trim() || undefined,
    type: objective.type.trim(),
    target_ids: objective.target_ids.map((entry) => entry.trim()).filter(Boolean),
    count: parseNumber(objective.count),
    description: objective.description.trim() || undefined,
  });
}

function exportDialogueLine(line: DialogueLineDraft) {
  const extra = safeExtraJson(line.extraJson);
  return cleanObject({
    ...extra,
    id: line.id.trim() || undefined,
    speaker_id: line.speaker_id.trim() || undefined,
    speaker_name: line.speaker_name.trim() || undefined,
    text: line.text.trim(),
    mood: line.mood.trim() || undefined,
  });
}

function exportMissionStep(step: MissionStepDraft) {
  const extra = safeExtraJson(step.extraJson);
  return cleanObject({
    ...extra,
    id: step.id.trim() || undefined,
    title: step.title.trim() || undefined,
    description: step.description.trim() || undefined,
    objectives: step.objectives.map((objective) => exportMissionObjective(objective)),
    dialogue: step.dialogue.map((line) => exportDialogueLine(line)),
    completion_dialogue: step.completionDialogue.map((line) => exportDialogueLine(line)),
  });
}

export function exportMissionDraft(draft: MissionDraft) {
  const extra = safeExtraJson(draft.extraJson);
  const steps = draft.steps.map((step) => exportMissionStep(step));
  const objectives = steps.flatMap((step) => (Array.isArray(step.objectives) ? step.objectives : []));

  return cleanObject({
    ...extra,
    id: draft.id.trim(),
    title: draft.title.trim(),
    giver_id: draft.giver_id.trim() || undefined,
    faction: draft.faction.trim() || undefined,
    repeatable: draft.repeatable,
    level: parseNumber(draft.level),
    arcs: draft.arcs.map((entry) => entry.trim()).filter(Boolean),
    tags: draft.tags.map((entry) => entry.trim()).filter(Boolean),
    prerequisites: draft.prerequisites.length
      ? {
          mission_ids: [...new Set(draft.prerequisites.map((entry) => entry.trim()).filter(Boolean))],
        }
      : undefined,
    objectives,
    steps,
  });
}

export function exportModDraft(mod: ModDraft) {
  const syncedMod = syncDerivedModFields(mod);
  const extra = safeExtraJson(mod.extraJson);
  const stats: Record<string, number> = {};
  for (const entry of syncedMod.stats) {
    const key = entry.key.trim();
    const value = parseNumber(entry.value);
    if (!key || value === undefined) continue;
    stats[key] = value;
  }

  return cleanObject({
    ...extra,
    id: parseScalarString(syncedMod.id) ?? syncedMod.id.trim(),
    name: syncedMod.name.trim(),
    slot: syncedMod.slot.trim(),
    class_restriction: (() => {
      const values = syncedMod.classRestriction.map((entry) => entry.trim()).filter(Boolean);
      if (!values.length) return undefined;
      return values.length === 1 ? values[0] : values;
    })(),
    stats_cap_override: syncedMod.statsCapOverride,
    is_quest_reward: syncedMod.isQuestReward,
    is_dungeon_drop: syncedMod.isDungeonDrop,
    is_boss_drop: syncedMod.isBossDrop,
    level_requirement: parseNumber(syncedMod.levelRequirement),
    item_level: parseNumber(syncedMod.itemLevel),
    rarity: parseNumber(syncedMod.rarity) ?? 0,
    durability: parseNumber(syncedMod.durability),
    sell_price: parseNumber(syncedMod.sellPrice),
    stats,
    abilities: syncedMod.abilities
      .map((entry) => parseScalarString(entry.id))
      .filter((entry): entry is string | number => entry !== undefined),
    icon: syncedMod.icon.trim() || undefined,
    description: syncedMod.description.trim() || undefined,
  });
}

export function exportModsJson(mods: ModDraft[]) {
  return mods.map((mod) => exportModDraft(mod));
}

export function missionFilename(mission: MissionDraft, index: number) {
  const safeId = sanitizeFilenamePart(mission.id || "");
  return `${safeId || `mission_${index + 1}`}.json`;
}

export function buildMissionFilenames(missions: MissionDraft[]) {
  return buildUniqueFilenames(missions.map((mission, index) => missionFilename(mission, index)));
}

export function modFilename(mod: ModDraft, index: number) {
  const safeId = sanitizeFilenamePart(mod.id || "");
  return `${safeId || `mod_${index + 1}`}.json`;
}

export function buildMissionManifest(missions: MissionDraft[]) {
  const filenames = buildMissionFilenames(missions);
  return missions.map((mission, index) => ({
    id: mission.id.trim(),
    title: mission.title.trim(),
    filename: filenames[index],
    prerequisites: mission.prerequisites.map((entry) => entry.trim()).filter(Boolean),
    step_count: mission.steps.length,
  }));
}

export function validateMissionDrafts(missions: MissionDraft[], knownMissionIds: string[] = []): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const knownIds = new Set(knownMissionIds.map((entry) => entry.trim()).filter(Boolean));
  const idCounts = new Map<string, number>();

  for (const [draftIndex, mission] of missions.entries()) {
    const id = mission.id.trim();
    if (!id) {
      messages.push({ level: "error", scope: "missions", draftIndex, message: "Mission id is required." });
    } else {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      knownIds.add(id);
    }

    if (!mission.title.trim()) {
      messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission title is required." });
    }

    const level = parseNumber(mission.level);
    if (mission.level.trim() && level === undefined) {
      messages.push({
        level: "error",
        scope: "missions",
        draftIndex,
        itemId: id || undefined,
        message: "Mission level must be a valid number.",
      });
    }

    try {
      parseExtraJson(mission.extraJson);
    } catch {
      if (mission.extraJson.trim()) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: "Mission extra JSON must be a valid JSON object.",
        });
      }
    }

    if (!mission.steps.length) {
      messages.push({ level: "warning", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission has no steps." });
    }

    for (const step of mission.steps) {
      if (!step.title.trim()) {
        messages.push({
          level: "warning",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step "${step.id || "untitled"}" is missing a title.`,
        });
      }

      try {
        parseExtraJson(step.extraJson);
      } catch {
        if (step.extraJson.trim()) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `Step "${step.title || step.id || "untitled"}" has invalid extra JSON.`,
          });
        }
      }

      if (!step.objectives.length) {
        messages.push({
          level: "warning",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step "${step.title || step.id || "untitled"}" has no objectives.`,
        });
      }

      for (const objective of step.objectives) {
        if (!objective.type.trim()) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `Objective "${objective.id || "untitled"}" in "${step.title || step.id || "untitled"}" is missing a type.`,
          });
        }

        try {
          parseExtraJson(objective.extraJson);
        } catch {
          if (objective.extraJson.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `Objective "${objective.id || "untitled"}" has invalid extra JSON.`,
            });
          }
        }
      }

      for (const line of [...step.dialogue, ...step.completionDialogue]) {
        if (!line.text.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `A dialogue line in "${step.title || step.id || "untitled"}" is missing text.`,
          });
        }

        try {
          parseExtraJson(line.extraJson);
        } catch {
          if (line.extraJson.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `A dialogue line in "${step.title || step.id || "untitled"}" has invalid extra JSON.`,
            });
          }
        }
      }
    }
  }

  for (const [draftIndex, mission] of missions.entries()) {
    const id = mission.id.trim();
    if (id && (idCounts.get(id) ?? 0) > 1) {
      messages.push({
        level: "error",
        scope: "missions",
        draftIndex,
        itemId: id,
        message: `Mission id "${id}" is duplicated in the current draft library.`,
      });
    }

    for (const prerequisite of mission.prerequisites.map((entry) => entry.trim()).filter(Boolean)) {
      if (id && prerequisite === id) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id,
          message: `Mission "${id}" cannot list itself as a prerequisite.`,
        });
      } else if (!knownIds.has(prerequisite)) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Prerequisite "${prerequisite}" does not match any known mission id.`,
        });
      }
    }
  }

  const graph = new Map<string, string[]>();
  for (const mission of missions) {
    const id = mission.id.trim();
    if (!id) continue;
    graph.set(id, mission.prerequisites.map((entry) => entry.trim()).filter((entry) => entry && idCounts.has(entry)));
  }

  const stack = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();

  function walk(node: string) {
    if (cycleNodes.has(node) || visited.has(node)) return;
    if (stack.has(node)) {
      cycleNodes.add(node);
      return;
    }

    stack.add(node);
    for (const next of graph.get(node) ?? []) {
      walk(next);
      if (cycleNodes.has(next)) cycleNodes.add(node);
    }
    stack.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) walk(node);

  if (cycleNodes.size) {
    for (const [draftIndex, mission] of missions.entries()) {
      const id = mission.id.trim();
      if (!id || !cycleNodes.has(id)) continue;
      messages.push({
        level: "error",
        scope: "missions",
        draftIndex,
        itemId: id,
        message: `Mission prerequisite cycle detected for "${id}".`,
      });
    }
  }

  return messages;
}

export function validateModDrafts(mods: ModDraft[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const idCounts = new Map<string, number>();

  for (const [draftIndex, mod] of mods.entries()) {
    const id = mod.id.trim();
    const syncedMod = syncDerivedModFields(mod);
    const levelRequirement = parseNumber(syncedMod.levelRequirement);
    const rarity = parseNumber(syncedMod.rarity);
    const budget = buildModBudgetSummary(syncedMod);
    const supportedStatCounts = rarity !== undefined ? getModSupportedStatCounts(rarity) : [];
    const activeStatCount = budget.activeStatCount;

    if (!id) {
      messages.push({ level: "warning", scope: "mods", draftIndex, message: "Mod id is blank." });
    } else {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    if (!mod.name.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Mod name is blank." });
    }

    if (!mod.slot.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Mod slot is blank." });
    }

    if (!syncedMod.levelRequirement.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Level requirement is blank." });
    } else if (levelRequirement === undefined) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Level requirement must be numeric.",
      });
    } else if (levelRequirement < MOD_REQUIRED_LEVEL_MIN || levelRequirement > MOD_REQUIRED_LEVEL_MAX) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: `Level requirement must stay between ${MOD_REQUIRED_LEVEL_MIN} and ${MOD_REQUIRED_LEVEL_MAX}.`,
      });
    }

    if (!syncedMod.rarity.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Rarity is blank." });
    } else if (rarity === undefined) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Rarity must be numeric.",
      });
    } else if (!(rarity in { 0: true, 1: true, 2: true, 3: true, 4: true })) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Rarity must be between 0 and 4.",
      });
    }

    if (!syncedMod.durability.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Durability is blank." });
    } else if (parseNumber(syncedMod.durability) === undefined) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Durability must be numeric.",
      });
    }

    if (!syncedMod.classRestriction.length) {
      messages.push({
        level: "warning",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Class restriction is blank.",
      });
    }

    if (!syncedMod.icon.trim()) {
      messages.push({ level: "warning", scope: "mods", draftIndex, itemId: id || undefined, message: "Icon is blank." });
    }

    try {
      parseExtraJson(syncedMod.extraJson);
    } catch {
      if (syncedMod.extraJson.trim()) {
        messages.push({
          level: "error",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: "Mod extra JSON must be a valid JSON object.",
        });
      }
    }

    const statKeys = new Set<string>();
    let activeValidationStatIndex = 0;
    if (syncedMod.stats.length > MOD_MAX_STATS) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: `A mod can have at most ${MOD_MAX_STATS} stats.`,
      });
    }

    for (const [statIndex, stat] of syncedMod.stats.entries()) {
      const key = stat.key.trim();
      const value = stat.value.trim();

      if (!key && !value) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat row ${statIndex + 1} is blank.`,
        });
        continue;
      }

      if (!key) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat row ${statIndex + 1} is missing a stat key.`,
        });
        continue;
      }

      const currentSlotIndex = activeValidationStatIndex;
      activeValidationStatIndex += 1;

      if (!value) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat "${key}" is missing a value.`,
        });
        continue;
      }

      if (parseNumber(value) === undefined) {
        messages.push({
          level: "error",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat "${key}" must have a numeric value.`,
        });
        continue;
      }

      if (!getModStatBudgetConfig(key)) {
        messages.push({
          level: "error",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat "${key}" is not supported by the current budget config.`,
        });
        continue;
      }

      if (!syncedMod.statsCapOverride && levelRequirement !== undefined) {
        const numericValue = parseNumber(value);
        const effectiveBudgetStat = budget.stats.find((entry) => entry.slotIndex === currentSlotIndex);
        const effectiveMaxValue = effectiveBudgetStat?.currentMaxValue ?? effectiveBudgetStat?.effectiveMaxValue;
        const maxAtLevel = effectiveMaxValue ?? getModStatMaxAtRequiredLevel(key, levelRequirement);
        const effectiveMagnitude = numericValue !== undefined && isSignedModStat(key) ? Math.abs(numericValue) : numericValue;
        if (maxAtLevel !== undefined && effectiveMagnitude !== undefined && effectiveMagnitude > maxAtLevel) {
          messages.push({
            level: "error",
            scope: "mods",
            draftIndex,
            itemId: id || undefined,
            message: `Stat "${key}" exceeds its current max of ${maxAtLevel}.`,
          });
        }
      }

      if (statKeys.has(key)) {
        messages.push({
          level: "error",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat key "${key}" is duplicated.`,
        });
      }
      statKeys.add(key);
    }

    if (!activeStatCount && !syncedMod.abilities.some((ability) => ability.id.trim())) {
      messages.push({
        level: "warning",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Add at least one stat or ability.",
      });
    } else if (supportedStatCounts.length && activeStatCount > Math.max(...supportedStatCounts)) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: `This rarity supports up to ${Math.max(...supportedStatCounts)} stats, but ${activeStatCount} are currently configured.`,
      });
    }

    if (syncedMod.abilities.length > MOD_MAX_ABILITIES) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: `A mod can have at most ${MOD_MAX_ABILITIES} abilities.`,
      });
    }

    for (const [abilityIndex, ability] of syncedMod.abilities.entries()) {
      const abilityId = ability.id.trim();
      const budgetCost = ability.budgetCost.trim();

      if (!abilityId && !budgetCost) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Ability row ${abilityIndex + 1} is blank.`,
        });
        continue;
      }

      if (!abilityId) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Ability row ${abilityIndex + 1} is missing an ability id.`,
        });
        continue;
      }

      if (budgetCost && parseNumber(budgetCost) === undefined) {
        messages.push({
          level: "error",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Ability "${abilityId}" must have a numeric extra slot cost.`,
        });
        continue;
      }

      if (budgetCost) {
        const numericBudgetCost = parseNumber(budgetCost);
        if (numericBudgetCost !== undefined && numericBudgetCost < 0) {
          messages.push({
            level: "error",
            scope: "mods",
            draftIndex,
            itemId: id || undefined,
            message: `Ability "${abilityId}" cannot have a negative extra budget cost.`,
          });
        }
      }
    }

    if (!syncedMod.statsCapOverride && rarity !== undefined && budget.targetScore !== undefined && budget.isOverBudget) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: `Budget exceeded the rarity cap: ${budget.totalBudgetSpent} spent against ${budget.targetScore}.`,
      });
    }
  }

  for (const [draftIndex, mod] of mods.entries()) {
    const id = mod.id.trim();
    if (id && (idCounts.get(id) ?? 0) > 1) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id,
        message: `Mod id "${id}" is duplicated in the current draft library.`,
      });
    }
  }

  return messages;
}
