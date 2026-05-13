import type { ValidationMessage } from "@lib/authoring";
import { parseLooseJson } from "@lib/json";

type JsonObject = Record<string, unknown>;

export const MISSION_MODES = ["single", "sequential", "all"] as const;
export const MISSION_OBJECTIVE_TYPES = [
  "talk",
  "scan",
  "collect",
  "acquire",
  "kill",
  "mine",
  "sell",
  "buy",
  "travel",
  "explore",
  "hail",
  "repair",
] as const;
export const MISSION_PREREQUISITE_STATES = ["turned_in", "completed", "accepted"] as const;

export type MissionMode = (typeof MISSION_MODES)[number];
export type MissionObjectiveType = (typeof MISSION_OBJECTIVE_TYPES)[number];
export type MissionPrerequisiteState = (typeof MISSION_PREREQUISITE_STATES)[number];

export interface MissionMetaDraft {
  notes: string;
  author: string;
  dateCreated: string;
  lastEditDate: string;
  extraJson: string;
}

export interface MissionRewardDraft {
  credits: string;
  xp: string;
  itemRewards: MissionRewardItemDraft[];
  modIds: string[];
  reputationEntries: string[];
}

export interface MissionRewardItemDraft {
  key: string;
  itemId: string;
  count: string;
}

export interface MissionPrerequisiteDraft {
  key: string;
  id: string;
  state: string;
}

export interface MissionConversationResponseDraft {
  key: string;
  text: string;
}

export interface MissionConversationBeatDraft {
  key: string;
  speaker: string;
  text: string;
  responses: MissionConversationResponseDraft[];
}

export interface MissionConversationDraft {
  key: string;
  id: string;
  beats: MissionConversationBeatDraft[];
}

export interface MissionObjectiveDraft {
  key: string;
  type: string;
  targetIds: string[];
  targetTags: string[];
  targetType: string;
  itemId: string;
  count: string;
  dropChance: string;
  seconds: string;
  sectorId: string;
  region: string;
  contactId: string;
  conversationId: string;
  fullRepair: boolean;
  description: string;
  objective: string;
  progressLabel: string;
  extraJson: string;
}

export interface MissionStepDraft {
  key: string;
  mode: string;
  description: string;
  objectives: MissionObjectiveDraft[];
}

export interface MissionDraft {
  sourceRelativePath: string;
  id: string;
  title: string;
  level: string;
  image: string;
  giver_id: string;
  turn_in_to: string;
  missionClass: string;
  faction: string;
  description: string;
  descriptionComplete: string;
  progressLabel: string;
  repeatable: boolean;
  meta: MissionMetaDraft;
  extraJson: string;
  arcs: string[];
  tags: string[];
  dialogParticipants: string[];
  prerequisites: MissionPrerequisiteDraft[];
  rewards: MissionRewardDraft;
  steps: MissionStepDraft[];
  conversations: MissionConversationDraft[];
}

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
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

function numberString(input: unknown) {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input !== "number" && typeof input !== "string") return "";
  return String(input);
}

function parseNumber(input: string) {
  if (!input.trim()) return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

function parseScalar(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parsePositiveInteger(input: string, fallback = 1) {
  const parsed = parseNumber(input);
  if (parsed === undefined) return fallback;
  return Math.max(1, Math.round(parsed));
}

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }
  return `${trimmed}_001`;
}

export function normalizeMissionIdSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function normalizeMissionIdValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const withoutPrefix = normalized.startsWith("mission.")
    ? normalized.slice("mission.".length)
    : normalized === "mission"
      ? ""
      : normalized.replace(/^mission[._-]+/, "");
  const slug = normalizeMissionIdSlug(withoutPrefix);
  return slug ? `mission.${slug}` : "mission.";
}

export function generateMissionIdFromTitle(title: string, existingIds: string[] = [], currentId?: string) {
  const slug = normalizeMissionIdSlug(title);
  if (!slug) return "mission.";

  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  if (currentId?.trim()) taken.delete(currentId.trim());

  let candidate = `mission.${slug}`;
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

function normalizeMode(value: unknown): string {
  const normalized = String(value ?? "single").trim().toLowerCase();
  return MISSION_MODES.includes(normalized as MissionMode) ? normalized : "single";
}

function normalizeObjectiveType(value: unknown): string {
  const normalized = String(value ?? "talk").trim().toLowerCase();
  return MISSION_OBJECTIVE_TYPES.includes(normalized as MissionObjectiveType) ? normalized : "talk";
}

function parseLooseObjectList(values: string[]) {
  return values
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return parseLooseJson(entry);
      } catch {
        return parseScalar(entry) ?? entry;
      }
    });
}

function normalizeTargetIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (raw === null || raw === undefined) return [];
  const scalar = String(raw).trim();
  return scalar ? [scalar] : [];
}

function looksLikeMission(value: JsonObject) {
  return (
    "id" in value ||
    "title" in value ||
    "steps" in value ||
    "giver_id" in value ||
    "rewards" in value ||
    "turn_in_to" in value
  );
}

const MISSION_KNOWN_TOP_LEVEL_KEYS = [
  "id",
  "title",
  "level",
  "image",
  "giver_id",
  "turn_in_to",
  "turnin_to",
  "recipient_id",
  "class",
  "faction",
  "description",
  "description_complete",
  "complete_description",
  "progress_label",
  "repeatable",
  "meta",
  "arcs",
  "tags",
  "dialogParticipants",
  "dialog_participants",
  "prerequisites",
  "rewards",
  "steps",
  "conversations",
  "sourceRelativePath",
] as const;

const MISSION_META_KNOWN_KEYS = [
  "notes",
  "author",
  "date_created",
  "created_at",
  "created",
  "last_edit_date",
  "last_edited",
  "updated_at",
  "modified_at",
] as const;

const MISSION_OBJECTIVE_KNOWN_KEYS = [
  "type",
  "target_id",
  "target_ids",
  "target_tag",
  "target_tags",
  "target_type",
  "target_types",
  "item_id",
  "item_ids",
  "count",
  "required",
  "required_count",
  "qty",
  "quantity",
  "amount",
  "drop_chance",
  "seconds",
  "sector_id",
  "region",
  "contact_id",
  "conversation_id",
  "full",
  "description",
  "objective",
  "progress_label",
] as const;

function stripKnownKeys(source: JsonObject, knownKeys: readonly string[]) {
  const known = new Set<string>(knownKeys);
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key)) next[key] = value;
  }
  return next;
}

function formatJsonBlock(source: JsonObject) {
  return Object.keys(source).length ? JSON.stringify(source, null, 2) : "";
}

function parseExtraJson(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = parseLooseJson(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as JsonObject;
}

function mergeExtraJson(known: JsonObject, extraJson: string, label: string, reservedKeys: readonly string[]) {
  const next = { ...known };
  const reserved = new Set<string>(reservedKeys);
  const extra = parseExtraJson(extraJson, label);
  for (const [key, value] of Object.entries(extra)) {
    if (!reserved.has(key)) next[key] = value;
  }
  return next;
}

function currentMissionTimestamp() {
  return new Date().toISOString();
}

function normalizeMissionCollectionEntries(raw: unknown, keyName: string): unknown[] | null {
  const source = asObject(raw);
  const nested = source[keyName];
  if (Array.isArray(nested)) return nested;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return Object.entries(nested as JsonObject).map(([key, value]) => ({ id: key, ...asObject(value) }));
  }
  return null;
}

export function csvFromList(values: string[]) {
  return values.join(", ");
}

export function listFromCsv(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createMissionConversationResponseDraft(text = ""): MissionConversationResponseDraft {
  return {
    key: uid("response"),
    text,
  };
}

export function createMissionConversationBeatDraft(speaker = ""): MissionConversationBeatDraft {
  return {
    key: uid("beat"),
    speaker,
    text: "",
    responses: [],
  };
}

export function createMissionConversationDraft(id = ""): MissionConversationDraft {
  return {
    key: uid("conversation"),
    id,
    beats: [createMissionConversationBeatDraft()],
  };
}

export function createMissionObjectiveDraft(type: MissionObjectiveType = "talk"): MissionObjectiveDraft {
  return {
    key: uid("objective"),
    type,
    targetIds: [],
    targetTags: [],
    targetType: "",
    itemId: "",
    count: type === "collect" || type === "acquire" || type === "kill" || type === "mine" || type === "scan" || type === "buy" || type === "sell" ? "1" : "",
    dropChance: type === "collect" ? "1.0" : "",
    seconds: type === "travel" ? "1" : "",
    sectorId: "",
    region: "",
    contactId: "",
    conversationId: "",
    fullRepair: true,
    description: "",
    objective: "",
    progressLabel: "",
    extraJson: "",
  };
}

export function createMissionStepDraft(mode: MissionMode = "single"): MissionStepDraft {
  return {
    key: uid("step"),
    mode,
    description: "",
    objectives: [createMissionObjectiveDraft("talk")],
  };
}

export function createMissionDraft(): MissionDraft {
  const now = currentMissionTimestamp();
  return {
    sourceRelativePath: "",
    id: "mission.",
    title: "",
    level: "1",
    image: "",
    giver_id: "",
    turn_in_to: "",
    missionClass: "",
    faction: "",
    description: "",
    descriptionComplete: "",
    progressLabel: "",
    repeatable: false,
    meta: {
      notes: "",
      author: "",
      dateCreated: now,
      lastEditDate: now,
      extraJson: "",
    },
    extraJson: "",
    arcs: [],
    tags: [],
    dialogParticipants: [],
    prerequisites: [],
    rewards: {
      credits: "0",
      xp: "0",
      itemRewards: [],
      modIds: [],
      reputationEntries: [],
    },
    steps: [createMissionStepDraft("single")],
    conversations: [],
  };
}

export function hydrateStoredMissionDraft(raw: unknown): MissionDraft {
  return normalizeImportedMission(raw);
}

export function duplicateMissionConversationDraft(
  conversation: MissionConversationDraft,
  existingIds: string[] = [],
): MissionConversationDraft {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  const baseId = conversation.id.trim();
  let nextId = baseId ? `${baseId}_copy` : "";
  while (nextId && taken.has(nextId)) {
    nextId = `${nextId}_copy`;
  }

  return {
    key: uid("conversation"),
    id: nextId,
    beats: conversation.beats.map((beat) => ({
      key: uid("beat"),
      speaker: beat.speaker,
      text: beat.text,
      responses: beat.responses.map((response) => ({
        key: uid("response"),
        text: response.text,
      })),
    })),
  };
}

export function duplicateMissionObjectiveDraft(objective: MissionObjectiveDraft): MissionObjectiveDraft {
  return {
    ...objective,
    key: uid("objective"),
    targetIds: [...objective.targetIds],
    targetTags: [...objective.targetTags],
  };
}

export function duplicateMissionStepDraft(step: MissionStepDraft): MissionStepDraft {
  return {
    key: uid("step"),
    mode: step.mode,
    description: step.description,
    objectives: step.objectives.map((objective) => duplicateMissionObjectiveDraft(objective)),
  };
}

export function duplicateMissionDraft(draft: MissionDraft): MissionDraft {
  const now = currentMissionTimestamp();
  return {
    ...draft,
    sourceRelativePath: "",
    id: draft.id.trim() ? `${draft.id.trim()}_copy` : "mission.",
    title: draft.title.trim() ? `${draft.title.trim()} Copy` : "",
    meta: {
      notes: draft.meta.notes,
      author: draft.meta.author,
      dateCreated: now,
      lastEditDate: now,
      extraJson: draft.meta.extraJson,
    },
    extraJson: draft.extraJson,
    arcs: [...draft.arcs],
    tags: [...draft.tags],
    dialogParticipants: [...draft.dialogParticipants],
    prerequisites: draft.prerequisites.map((prerequisite) => ({
      key: uid("prerequisite"),
      id: prerequisite.id,
      state: prerequisite.state,
    })),
    rewards: {
      credits: draft.rewards.credits,
      xp: draft.rewards.xp,
      itemRewards: draft.rewards.itemRewards.map((reward) => ({
        key: uid("reward_item"),
        itemId: reward.itemId,
        count: reward.count,
      })),
      modIds: [...draft.rewards.modIds],
      reputationEntries: [...draft.rewards.reputationEntries],
    },
    steps: draft.steps.map((step) => duplicateMissionStepDraft(step)),
    conversations: draft.conversations.map((conversation) =>
      duplicateMissionConversationDraft(
        conversation,
        draft.conversations.map((entry) => entry.id),
      ),
    ),
  };
}

function normalizeImportedConversationResponse(raw: unknown): MissionConversationResponseDraft {
  const source = asObject(raw);
  return createMissionConversationResponseDraft(String(source.text ?? ""));
}

function normalizeImportedConversationBeat(raw: unknown): MissionConversationBeatDraft {
  const source = asObject(raw);
  return {
    key: uid("beat"),
    speaker: String(source.speaker ?? ""),
    text: String(source.text ?? ""),
    responses: Array.isArray(source.responses)
      ? (source.responses as unknown[]).map((entry) => normalizeImportedConversationResponse(entry))
      : [],
  };
}

function normalizeImportedConversation(raw: unknown, fallbackId: string): MissionConversationDraft {
  const source = asObject(raw);
  return {
    key: uid("conversation"),
    id: String(source.id ?? fallbackId),
    beats: Array.isArray(source.beats) ? (source.beats as unknown[]).map((entry) => normalizeImportedConversationBeat(entry)) : [],
  };
}

function inferDialogParticipants(
  conversations: MissionConversationDraft[],
  steps: MissionStepDraft[],
  explicitParticipants: string[] = [],
) {
  return Array.from(
    new Set([
      ...explicitParticipants.map((entry) => entry.trim()).filter(Boolean),
      ...conversations.flatMap((conversation) => conversation.beats.map((beat) => beat.speaker.trim()).filter(Boolean)),
      ...steps
        .flatMap((step) => step.objectives)
        .filter((objective) => normalizeObjectiveType(objective.type) === "talk")
        .map((objective) => objective.contactId.trim())
        .filter(Boolean),
    ]),
  );
}

function normalizeImportedObjective(raw: unknown): MissionObjectiveDraft {
  const source = asObject(raw);
  return {
    key: uid("objective"),
    type: normalizeObjectiveType(source.type),
    targetIds: normalizeTargetIds(source.target_id ?? source.target_ids),
    targetTags: stringList(source.target_tags ?? source.target_tag),
    targetType: String(source.target_type ?? (Array.isArray(source.target_types) ? source.target_types[0] : source.target_types) ?? ""),
    itemId: numberString(source.item_id ?? source.item_ids),
    count: numberString(source.count ?? source.required ?? source.required_count ?? source.qty ?? source.quantity ?? source.amount),
    dropChance: numberString(source.drop_chance),
    seconds: numberString(source.seconds),
    sectorId: String(source.sector_id ?? ""),
    region: String(source.region ?? ""),
    contactId: String(source.contact_id ?? ""),
    conversationId: String(source.conversation_id ?? ""),
    fullRepair: parseBooleanFlag(source.full ?? true),
    description: String(source.description ?? ""),
    objective: String(source.objective ?? ""),
    progressLabel: String(source.progress_label ?? ""),
    extraJson: formatJsonBlock(stripKnownKeys(source, MISSION_OBJECTIVE_KNOWN_KEYS)),
  };
}

function normalizeImportedStep(raw: unknown, fallbackMode: MissionMode = "single"): MissionStepDraft {
  const source = asObject(raw);
  return {
    key: uid("step"),
    mode: normalizeMode(source.mode ?? fallbackMode),
    description: String(source.description ?? ""),
    objectives: Array.isArray(source.objectives)
      ? (source.objectives as unknown[]).map((entry) => normalizeImportedObjective(entry))
      : [createMissionObjectiveDraft("talk")],
  };
}

function normalizeImportedPrerequisites(raw: unknown): MissionPrerequisiteDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number") {
        return {
          key: uid("prerequisite"),
          id: String(entry).trim(),
          state: "turned_in",
        } satisfies MissionPrerequisiteDraft;
      }

      const source = asObject(entry);
      return {
        key: uid("prerequisite"),
        id: String(source.id ?? source.mission_id ?? "").trim(),
        state: String(source.state ?? "turned_in").trim() || "turned_in",
      } satisfies MissionPrerequisiteDraft;
    })
    .filter((entry) => entry.id);
}

function normalizeImportedRewardItem(raw: unknown): MissionRewardItemDraft | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const source = asObject(raw);
    const itemId = numberString(source.item_id ?? source.itemId ?? source.id);
    if (!itemId.trim()) return null;
    return {
      key: uid("reward_item"),
      itemId,
      count: numberString(source.count ?? source.qty ?? source.quantity ?? source.amount ?? 1) || "1",
    };
  }

  const itemId = String(raw ?? "").trim();
  if (!itemId) return null;
  return {
    key: uid("reward_item"),
    itemId,
    count: "1",
  };
}

function normalizeImportedRewardItems(source: JsonObject) {
  const rawItems = Array.isArray(source.items) ? source.items : Array.isArray(source.itemIds) ? source.itemIds : Array.isArray(source.itemRewards) ? source.itemRewards : [];
  return rawItems.map((entry) => normalizeImportedRewardItem(entry)).filter((entry): entry is MissionRewardItemDraft => !!entry);
}

function normalizeImportedRewards(raw: unknown): MissionRewardDraft {
  const source = asObject(raw);
  return {
    credits: numberString(source.credits ?? 0),
    xp: numberString(source.xp ?? 0),
    itemRewards: normalizeImportedRewardItems(source),
    modIds: normalizeTargetIds(source.mods),
    reputationEntries: Array.isArray(source.reputation)
      ? (source.reputation as unknown[]).map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).filter(Boolean)
      : [],
  };
}

export function normalizeImportedMission(raw: unknown, options: { sourceRelativePath?: string } = {}): MissionDraft {
  const source = asObject(raw);
  const metaSource = asObject(source.meta);
  const steps = Array.isArray(source.steps)
    ? (source.steps as unknown[]).map((entry) => normalizeImportedStep(entry))
    : [createMissionStepDraft("single")];
  const conversationsSource = asObject(source.conversations);
  const conversations = Object.entries(conversationsSource).map(([key, value]) => normalizeImportedConversation(value, key));
  const explicitParticipants = stringList(source.dialogParticipants ?? source.dialog_participants);

  return {
    sourceRelativePath: String(options.sourceRelativePath ?? source.sourceRelativePath ?? ""),
    id: String(source.id ?? ""),
    title: String(source.title ?? ""),
    level: numberString(source.level),
    image: String(source.image ?? ""),
    giver_id: String(source.giver_id ?? ""),
    turn_in_to: String(source.turn_in_to ?? source.turnin_to ?? source.recipient_id ?? ""),
    missionClass: String(source.class ?? ""),
    faction: String(source.faction ?? ""),
    description: String(source.description ?? ""),
    descriptionComplete: String(source.description_complete ?? source.complete_description ?? ""),
    progressLabel: String(source.progress_label ?? ""),
    repeatable: parseBooleanFlag(source.repeatable),
    meta: {
      notes: String(metaSource.notes ?? ""),
      author: String(metaSource.author ?? ""),
      dateCreated: String(metaSource.date_created ?? metaSource.created_at ?? metaSource.created ?? ""),
      lastEditDate: String(metaSource.last_edit_date ?? metaSource.last_edited ?? metaSource.updated_at ?? metaSource.modified_at ?? ""),
      extraJson: formatJsonBlock(stripKnownKeys(metaSource, MISSION_META_KNOWN_KEYS)),
    },
    extraJson: formatJsonBlock(stripKnownKeys(source, MISSION_KNOWN_TOP_LEVEL_KEYS)),
    arcs: stringList(source.arcs),
    tags: stringList(source.tags),
    dialogParticipants: inferDialogParticipants(conversations, steps, explicitParticipants),
    prerequisites: normalizeImportedPrerequisites(source.prerequisites),
    rewards: normalizeImportedRewards(source.rewards),
    steps: steps.length ? steps : [createMissionStepDraft("single")],
    conversations,
  };
}

export function withMissionEditTimestamp(draft: MissionDraft, date = new Date()): MissionDraft {
  const timestamp = date.toISOString();
  return {
    ...draft,
    meta: {
      ...draft.meta,
      dateCreated: String(draft.meta.dateCreated ?? "").trim() || timestamp,
      lastEditDate: timestamp,
    },
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
    .map(([key, value]) => normalizeImportedMission({ id: asObject(value).id ?? key, ...asObject(value) }));
}

function serializeConversationResponse(response: MissionConversationResponseDraft) {
  return {
    text: response.text,
  };
}

function serializeConversationBeat(beat: MissionConversationBeatDraft) {
  return {
    speaker: beat.speaker,
    text: beat.text,
    ...(beat.responses.length
      ? {
          responses: beat.responses.map((response) => serializeConversationResponse(response)),
        }
      : {}),
  };
}

function serializeObjectiveTargetFilters(draft: MissionObjectiveDraft, targetIds: string[], mode: "single" | "array" = "single") {
  const targetTags = draft.targetTags.map((entry) => entry.trim()).filter(Boolean);
  const fields: JsonObject = {};
  if (mode === "array") {
    if (targetIds.length) fields.target_id = targetIds;
  } else if (targetIds[0]) {
    fields.target_id = targetIds[0];
  }
  if (targetTags.length) fields.target_tags = targetTags;
  if (draft.targetType.trim()) fields.target_type = draft.targetType.trim();
  return fields;
}

function serializeObjectiveWithExtra(draft: MissionObjectiveDraft, known: JsonObject) {
  return mergeExtraJson(known, draft.extraJson, "Objective Extra JSON", MISSION_OBJECTIVE_KNOWN_KEYS);
}

function serializeObjective(draft: MissionObjectiveDraft) {
  const targetIds = draft.targetIds.map((entry) => entry.trim()).filter(Boolean);
  const type = normalizeObjectiveType(draft.type);

  switch (type) {
    case "talk":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        contact_id: draft.contactId,
        conversation_id: draft.conversationId,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "scan":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "collect":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds, "array"),
        item_id: parseScalar(draft.itemId) ?? draft.itemId,
        count: parseNumber(draft.count) ?? 1,
        drop_chance: parseNumber(draft.dropChance) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "acquire":
      return serializeObjectiveWithExtra(draft, {
        type,
        item_id: parseScalar(draft.itemId) ?? draft.itemId,
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "kill":
      return serializeObjectiveWithExtra(draft, {
        type,
        count: parseNumber(draft.count) ?? 1,
        ...serializeObjectiveTargetFilters(draft, targetIds, "array"),
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "mine":
      return serializeObjectiveWithExtra(draft, {
        type,
        count: parseNumber(draft.count) ?? 1,
        ...serializeObjectiveTargetFilters(draft, targetIds, "array"),
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "sell":
    case "buy":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        item_id: parseScalar(draft.itemId) ?? draft.itemId,
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "travel":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds, targetIds.length > 1 ? "array" : "single"),
        seconds: parseNumber(draft.seconds) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "explore":
      return serializeObjectiveWithExtra(draft, {
        type,
        sector_id: draft.sectorId,
        region: draft.region,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "repair":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        full: draft.fullRepair,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "hail":
    default:
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
  }
}

function serializeStep(step: MissionStepDraft) {
  return {
    mode: normalizeMode(step.mode),
    description: step.description,
    objectives: step.objectives.map((objective) => serializeObjective(objective)),
  };
}

function serializeConversation(conversation: MissionConversationDraft) {
  return {
    beats: conversation.beats.map((beat) => serializeConversationBeat(beat)),
  };
}

function serializeReputationEntries(entries: string[]) {
  return parseLooseObjectList(entries);
}

export function exportMissionDraft(draft: MissionDraft) {
  const conversations = Object.fromEntries(
    draft.conversations
      .map((conversation) => [conversation.id.trim(), serializeConversation(conversation)] as const)
      .filter(([id]) => Boolean(id)),
  );

  const meta = mergeExtraJson(
    {
      notes: draft.meta.notes,
      author: draft.meta.author,
      date_created: draft.meta.dateCreated ?? "",
      last_edit_date: draft.meta.lastEditDate ?? "",
    },
    draft.meta.extraJson,
    "Mission Meta Extra JSON",
    MISSION_META_KNOWN_KEYS,
  );

  const known = {
    id: draft.id.trim(),
    title: draft.title,
    level: draft.level.trim(),
    image: draft.image,
    giver_id: draft.giver_id,
    turn_in_to: draft.turn_in_to,
    ...(draft.missionClass.trim() ? { class: draft.missionClass.trim() } : {}),
    meta,
    description: draft.description,
    description_complete: draft.descriptionComplete,
    ...(draft.progressLabel.trim() ? { progress_label: draft.progressLabel } : {}),
    repeatable: draft.repeatable,
    faction: draft.faction,
    arcs: draft.arcs,
    tags: draft.tags,
    ...(draft.prerequisites.length
      ? {
          prerequisites: draft.prerequisites
            .map((prerequisite) => ({
              id: prerequisite.id.trim(),
              ...(prerequisite.state.trim() ? { state: prerequisite.state.trim() } : {}),
            }))
            .filter((prerequisite) => prerequisite.id),
        }
      : {}),
    rewards: {
      credits: parseNumber(draft.rewards.credits) ?? 0,
      items: draft.rewards.itemRewards
        .map((entry) => ({
          id: parseScalar(entry.itemId) ?? entry.itemId,
          count: parsePositiveInteger(entry.count),
        }))
        .filter((entry) => entry.id !== undefined && String(entry.id).trim()),
      reputation: serializeReputationEntries(draft.rewards.reputationEntries),
      mods: draft.rewards.modIds.map((entry) => parseScalar(entry) ?? entry).filter((entry) => entry !== undefined),
      xp: parseNumber(draft.rewards.xp) ?? 0,
    },
    steps: draft.steps.map((step) => serializeStep(step)),
    ...(Object.keys(conversations).length ? { conversations } : {}),
  } satisfies JsonObject;

  return mergeExtraJson(known, draft.extraJson, "Mission Extra JSON", MISSION_KNOWN_TOP_LEVEL_KEYS);
}

export function missionFilename(mission: MissionDraft, index: number) {
  const safe = mission.id.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || `mission_${index + 1}`}.json`;
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

export function buildMissionFilenames(missions: MissionDraft[]) {
  return buildUniqueFilenames(missions.map((mission, index) => missionFilename(mission, index)));
}

export function buildMissionManifest(missions: MissionDraft[]) {
  const filenames = buildMissionFilenames(missions);
  return missions.map((mission, index) => ({
    id: mission.id.trim(),
    title: mission.title.trim(),
    filename: filenames[index],
    prerequisites: mission.prerequisites.map((entry) => entry.id.trim()).filter(Boolean),
    step_count: mission.steps.length,
  }));
}

function conversationIdsFromDraft(draft: MissionDraft) {
  return new Set(draft.conversations.map((conversation) => conversation.id.trim()).filter(Boolean));
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
      if (!id.startsWith("mission.")) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id,
          message: 'Mission id must begin with the "mission." prefix.',
        });
      }
    }

    if (!mission.title.trim()) {
      messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission title is required." });
    }

    if (!mission.level.trim()) {
      messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission level is required." });
    } else if (parseNumber(mission.level) === undefined) {
      messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission level must be a valid number." });
    }

    for (const [label, value] of [
      ["Mission Extra JSON", mission.extraJson],
      ["Mission Meta Extra JSON", mission.meta.extraJson],
    ] as const) {
      if (!value.trim()) continue;
      try {
        parseExtraJson(value, label);
      } catch (error) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!mission.giver_id.trim()) {
      messages.push({ level: "warning", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission giver_id is blank." });
    }

    if (!mission.turn_in_to.trim()) {
      messages.push({ level: "warning", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission turn_in_to is blank." });
    }

    if (!mission.steps.length) {
      messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: "Mission needs at least one step." });
    }

    const conversationIds = conversationIdsFromDraft(mission);
    const conversationIdCounts = new Map<string, number>();
    for (const conversation of mission.conversations) {
      const conversationId = conversation.id.trim();
      if (!conversationId) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: "Conversation id is required.",
        });
        continue;
      }
      conversationIdCounts.set(conversationId, (conversationIdCounts.get(conversationId) ?? 0) + 1);
      if (!conversation.beats.length) {
        messages.push({
          level: "warning",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Conversation "${conversationId}" has no beats.`,
        });
      }
      for (const beat of conversation.beats) {
        if (!beat.speaker.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `A beat in conversation "${conversationId}" is missing a speaker.`,
          });
        }
        if (!beat.text.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `A beat in conversation "${conversationId}" is missing text.`,
          });
        }
        for (const response of beat.responses) {
          if (!response.text.trim()) {
            messages.push({
              level: "warning",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `A response in conversation "${conversationId}" is blank.`,
            });
          }
        }
      }
    }

    for (const [conversationId, count] of conversationIdCounts.entries()) {
      if (count > 1) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Conversation id "${conversationId}" is duplicated.`,
        });
      }
    }

    for (const [stepIndex, step] of mission.steps.entries()) {
      const mode = normalizeMode(step.mode);
      if (!MISSION_MODES.includes(mode as MissionMode)) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step ${stepIndex + 1} has an invalid mode.`,
        });
      }
      if (!step.objectives.length) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step ${stepIndex + 1} must include at least one objective.`,
        });
      }
      if (mode === "single" && step.objectives.length !== 1) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step ${stepIndex + 1} uses single mode, so it must contain exactly one objective.`,
        });
      }
      if (mode === "all" && !step.description.trim() && !mission.description.trim()) {
        messages.push({
          level: "warning",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Step ${stepIndex + 1} uses all mode, so it should have a step description or mission-level fallback description.`,
        });
      }

      for (const [objectiveIndex, objective] of step.objectives.entries()) {
        const type = normalizeObjectiveType(objective.type);
        const prefix = `Objective ${objectiveIndex + 1} in step ${stepIndex + 1}`;

        if (!objective.type.trim()) {
          messages.push({ level: "error", scope: "missions", draftIndex, itemId: id || undefined, message: `${prefix} is missing a type.` });
          continue;
        }

        const targetIds = objective.targetIds.map((entry) => entry.trim()).filter(Boolean);
        const targetTags = objective.targetTags.map((entry) => entry.trim()).filter(Boolean);
        const hasContextTarget = targetIds.length > 0 || targetTags.length > 0 || Boolean(objective.targetType.trim());
        let objectiveExtra: JsonObject = {};
        if (objective.extraJson.trim()) {
          try {
            objectiveExtra = parseExtraJson(objective.extraJson, `${prefix} Extra JSON`);
          } catch (error) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const hasFactionTarget = Boolean(objectiveExtra.target_faction || objectiveExtra.target_factions);
        const needsSingleTarget = type === "talk" || type === "hail" || type === "buy" || type === "sell" || type === "repair";
        if (needsSingleTarget && targetIds.length !== 1) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires exactly one target_id.`,
          });
        }
        if (type === "travel" && !targetIds.length) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires at least one target_id.`,
          });
        }
        if ((type === "scan" || type === "mine") && !hasContextTarget) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires a target_id, target_tags, or target_type.`,
          });
        }
        if (type === "kill" && !targetIds.length && !hasFactionTarget) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires at least one target_id or a target_faction in Extra JSON.`,
          });
        }

        if (
          (type === "scan" || type === "collect" || type === "acquire" || type === "kill" || type === "mine" || type === "buy" || type === "sell") &&
          objective.count.trim() &&
          parseNumber(objective.count) === undefined
        ) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires a numeric count.`,
          });
        }

        if ((type === "collect" || type === "acquire") && !objective.itemId.trim()) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires an item_id.`,
          });
        }
        if ((type === "buy" || type === "sell") && !objective.itemId.trim()) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires an item_id.`,
          });
        }

        if (type === "collect" && objective.dropChance.trim() && parseNumber(objective.dropChance) === undefined) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires a numeric drop_chance.`,
          });
        }

        if (type === "travel" && parseNumber(objective.seconds) === undefined) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires a numeric seconds value.`,
          });
        }

        if (type === "explore") {
          if (!objective.sectorId.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a sector_id.`,
            });
          }
          if (!objective.region.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a region.`,
            });
          }
        }

        if (type === "talk") {
          if (!objective.contactId.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a contact_id.`,
            });
          }
          if (!objective.conversationId.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a conversation_id.`,
            });
          } else if (!conversationIds.has(objective.conversationId.trim())) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} references missing conversation "${objective.conversationId.trim()}".`,
            });
          }
        }

        if (mode !== "all" && !objective.description.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} is missing a description used in the mission popup.`,
          });
        }

        if (!objective.objective.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} is missing objective text.`,
          });
        }

        if (!objective.progressLabel.trim() && !mission.progressLabel.trim()) {
          messages.push({
            level: "warning",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} is missing a progress_label and the mission has no top-level fallback progress_label.`,
          });
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

    for (const prerequisite of mission.prerequisites) {
      const prerequisiteId = prerequisite.id.trim();
      if (!prerequisiteId) continue;
      if (id && prerequisiteId === id) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id,
          message: `Mission "${id}" cannot list itself as a prerequisite.`,
        });
      } else if (!knownIds.has(prerequisiteId)) {
        messages.push({
          level: "error",
          scope: "missions",
          draftIndex,
          itemId: id || undefined,
          message: `Prerequisite "${prerequisiteId}" does not match any known mission id.`,
        });
      }
    }
  }

  const graph = new Map<string, string[]>();
  for (const mission of missions) {
    const id = mission.id.trim();
    if (!id) continue;
    graph.set(
      id,
      mission.prerequisites.map((entry) => entry.id.trim()).filter((entry) => entry && idCounts.has(entry)),
    );
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
