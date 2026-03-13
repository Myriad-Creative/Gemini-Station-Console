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
  level_min: string;
  level_max: string;
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

export interface ModDraft {
  id: string;
  name: string;
  slot: string;
  classRestriction: string[];
  levelRequirement: string;
  itemLevel: string;
  rarity: string;
  durability: string;
  sellPrice: string;
  stats: ModStatDraft[];
  abilities: string[];
  icon: string;
  description: string;
  extraJson: string;
}

type JsonObject = Record<string, unknown>;

export const MISSION_STORAGE_KEY = "gemini.console.authoring.missions.v1";
export const MOD_STORAGE_KEY = "gemini.console.authoring.mods.v1";

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

export function csvFromList(values: string[]) {
  return values.join(", ");
}

export function numberString(input: unknown) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input !== "number" && typeof input !== "string") return "";
  return String(input);
}

export function parseNumber(input: string) {
  if (!input.trim()) return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
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
    level_min: "",
    level_max: "",
    arcs: [],
    tags: [],
    prerequisites: [],
    steps: [createMissionStepDraft("Step 1")],
    notes: "",
    extraJson: "",
  };
}

export function createModDraft(existingIds: string[] = [], previousId?: string): ModDraft {
  return {
    id: nextGeneratedModId(existingIds, previousId),
    name: "",
    slot: "",
    classRestriction: [],
    levelRequirement: "",
    itemLevel: "",
    rarity: "0",
    durability: "",
    sellPrice: "",
    stats: [{ key: "power", value: "" }],
    abilities: [],
    icon: "",
    description: "",
    extraJson: "",
  };
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
  return {
    ...JSON.parse(JSON.stringify(draft)),
    id: nextGeneratedModId(existingIds, draft.id),
    name: draft.name ? `${draft.name} Copy` : "",
  };
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
    level_min: numberString(asObject(source.availability).level_min ?? source.level_min),
    level_max: numberString(asObject(source.availability).level_max ?? source.level_max),
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
    source.stats && typeof source.stats === "object" && !Array.isArray(source.stats)
      ? (source.stats as Record<string, unknown>)
      : {};

  return {
    id: String(source.id ?? source.key ?? ""),
    name: String(source.name ?? source.id ?? source.key ?? ""),
    slot: String(source.slot ?? source.mod_slot ?? ""),
    classRestriction: stringList(source.class_restriction).length
      ? stringList(source.class_restriction)
      : stringList(source.classRestriction),
    levelRequirement: numberString(source.level_requirement ?? source.levelRequirement),
    itemLevel: numberString(source.item_level ?? source.itemLevel),
    rarity: numberString(source.rarity ?? 0),
    durability: numberString(source.durability),
    sellPrice: numberString(source.sell_price ?? source.sellPrice),
    stats: Object.entries(statsSource).length
      ? Object.entries(statsSource).map(([key, value]) => ({
          key,
          value: numberString(value as string | number | null | undefined),
        }))
      : [{ key: "power", value: "" }],
    abilities: stringList(source.abilities),
    icon: String(source.icon ?? ""),
    description: String(source.description ?? source.desc ?? ""),
    extraJson: prettyExtraJson(
      stripKeys(source, [
        "id",
        "key",
        "name",
        "slot",
        "mod_slot",
        "class_restriction",
        "classRestriction",
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
      ]),
    ),
  };
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
  const availability = cleanObject({
    level_min: parseNumber(draft.level_min),
    level_max: parseNumber(draft.level_max),
  });
  const steps = draft.steps.map((step) => exportMissionStep(step));
  const objectives = steps.flatMap((step) => (Array.isArray(step.objectives) ? step.objectives : []));

  return cleanObject({
    ...extra,
    id: draft.id.trim(),
    title: draft.title.trim(),
    giver_id: draft.giver_id.trim() || undefined,
    faction: draft.faction.trim() || undefined,
    repeatable: draft.repeatable,
    availability: Object.keys(availability).length ? availability : undefined,
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
  const extra = safeExtraJson(mod.extraJson);
  const stats: Record<string, number> = {};
  for (const entry of mod.stats) {
    const key = entry.key.trim();
    const value = parseNumber(entry.value);
    if (!key || value === undefined) continue;
    stats[key] = value;
  }

  return cleanObject({
    ...extra,
    id: mod.id.trim(),
    name: mod.name.trim(),
    slot: mod.slot.trim(),
    class_restriction: mod.classRestriction.map((entry) => entry.trim()).filter(Boolean),
    level_requirement: parseNumber(mod.levelRequirement),
    item_level: parseNumber(mod.itemLevel),
    rarity: parseNumber(mod.rarity) ?? 0,
    durability: parseNumber(mod.durability),
    sell_price: parseNumber(mod.sellPrice),
    stats,
    abilities: mod.abilities.map((entry) => entry.trim()).filter(Boolean),
    icon: mod.icon.trim() || undefined,
    description: mod.description.trim() || undefined,
  });
}

export function exportModsJson(mods: ModDraft[]) {
  return {
    mods: mods.map((mod) => exportModDraft(mod)),
  };
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

    const min = parseNumber(mission.level_min);
    const max = parseNumber(mission.level_max);
    if (min !== undefined && max !== undefined && min > max) {
      messages.push({
        level: "error",
        scope: "missions",
        draftIndex,
        itemId: id || undefined,
        message: `Level min (${min}) is greater than level max (${max}).`,
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
    if (!id) {
      messages.push({ level: "error", scope: "mods", draftIndex, message: "Mod id is required." });
    } else {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    if (!mod.name.trim()) {
      messages.push({ level: "error", scope: "mods", draftIndex, itemId: id || undefined, message: "Mod name is required." });
    }

    if (!mod.slot.trim()) {
      messages.push({ level: "error", scope: "mods", draftIndex, itemId: id || undefined, message: "Mod slot is required." });
    }

    if (parseNumber(mod.levelRequirement) === undefined) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Level requirement must be numeric.",
      });
    }

    if (parseNumber(mod.rarity) === undefined) {
      messages.push({
        level: "error",
        scope: "mods",
        draftIndex,
        itemId: id || undefined,
        message: "Rarity must be numeric.",
      });
    }

    try {
      parseExtraJson(mod.extraJson);
    } catch {
      if (mod.extraJson.trim()) {
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
    for (const stat of mod.stats) {
      const key = stat.key.trim();
      if (!key) continue;
      if (statKeys.has(key)) {
        messages.push({
          level: "warning",
          scope: "mods",
          draftIndex,
          itemId: id || undefined,
          message: `Stat key "${key}" is duplicated.`,
        });
      }
      statKeys.add(key);
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
