import type { ValidationMessage } from "@lib/authoring";
import { parseLooseJson } from "@lib/json";

type JsonObject = Record<string, unknown>;

export const MISSION_MODES = ["single", "sequential", "all"] as const;
export const MISSION_OBJECTIVE_TYPES = [
  "talk",
  "scan",
  "collect",
  "acquire",
  "deliver",
  "escort",
  "kill",
  "mine",
  "sell",
  "buy",
  "travel",
  "explore",
  "hail",
  "repair",
  "status_applied",
  "ability_success",
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
  hideItemRewards: boolean;
  hideItemRewardsUntilComplete: boolean;
  hideModRewards: boolean;
  hideModRewardsUntilComplete: boolean;
  itemRewards: MissionRewardItemDraft[];
  modRewards: MissionRewardModDraft[];
  reputationEntries: string[];
}

export interface MissionRewardItemDraft {
  key: string;
  itemId: string;
  count: string;
  hidden: boolean;
}

export interface MissionRewardModDraft {
  key: string;
  modId: string;
  hidden: boolean;
}

export interface MissionPrerequisiteDraft {
  key: string;
  id: string;
  state: string;
}

export interface MissionConversationResponseDraft {
  key: string;
  text: string;
  missionAction: string;
  missionActionKey: "mission_action" | "missionAction" | "mission_response_action";
  completeOnResponse: MissionResponseBooleanState;
  completeObjective: MissionResponseBooleanState;
  advanceObjective: MissionResponseBooleanState;
  deferCompletion: MissionResponseBooleanState;
  deferObjectiveCompletion: MissionResponseBooleanState;
  extraJson: string;
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

export interface MissionEscortAmbushDraft {
  key: string;
  mobId: string;
  count: string;
  progress: string;
  spawnDistance: string;
  angleDeg: string;
  level: string;
  rank: string;
  initialThreat: string;
  extraJson: string;
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
  completeOnResponse: boolean;
  requiredPlayerStatusEffectIds: string[];
  statusEffectIds: string[];
  abilityIds: string[];
  uniqueTargets: boolean;
  fullRepair: boolean;
  escortMobId: string;
  targetZoneId: string;
  destinationRadius: string;
  escortSpeed: string;
  arrivalMessage: string;
  ambushes: MissionEscortAmbushDraft[];
  description: string;
  objective: string;
  progressLabel: string;
  extraJson: string;
}

export type MissionResponseBooleanState = "unset" | "true" | "false";

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
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  return [];
}

function mergedStringList(...values: unknown[]) {
  const out: string[] = [];
  for (const value of values) {
    for (const entry of stringList(value)) {
      if (!out.includes(entry)) out.push(entry);
    }
  }
  return out;
}

function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "on"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

const ITEM_REWARD_CATEGORY_HIDDEN_KEYS = ["hide_item_rewards", "item_rewards_hidden", "items_hidden", "hide_items"] as const;
const MOD_REWARD_CATEGORY_HIDDEN_KEYS = ["hide_mod_rewards", "mod_rewards_hidden", "mods_hidden", "hide_mods"] as const;
const ITEM_REWARD_CATEGORY_HIDDEN_UNTIL_COMPLETE_KEYS = [
  "hide_item_rewards_until_complete",
  "item_rewards_hidden_until_complete",
  "items_hidden_until_complete",
  "hide_items_until_complete",
] as const;
const MOD_REWARD_CATEGORY_HIDDEN_UNTIL_COMPLETE_KEYS = [
  "hide_mod_rewards_until_complete",
  "mod_rewards_hidden_until_complete",
  "mods_hidden_until_complete",
  "hide_mods_until_complete",
] as const;
const REWARD_ENTRY_HIDDEN_KEYS = ["hidden", "hide_reward", "reward_hidden", "hide_icon"] as const;

function readAnyBooleanFlag(source: JsonObject, keys: readonly string[]) {
  return keys.some((key) => parseBooleanFlag(source[key]));
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
  "complete_on_response",
  "completeOnResponse",
  "required_scanner_status_effect_id",
  "required_scanner_status_effect_ids",
  "required_player_status_effect_id",
  "required_player_status_effect_ids",
  "status_effect_id",
  "status_effect_ids",
  "effect_id",
  "effect_ids",
  "ability_id",
  "ability_ids",
  "unique_targets",
  "uniqueTargets",
  "full",
  "escort_mob_id",
  "escortMobId",
  "mob_id",
  "target_zone_id",
  "targetZoneId",
  "destination_zone_id",
  "destinationZoneId",
  "destination_radius",
  "destinationRadius",
  "arrival_radius",
  "arrivalRadius",
  "speed",
  "escortSpeed",
  "arrival_message",
  "arrivalMessage",
  "ambushes",
  "description",
  "objective",
  "progress_label",
] as const;

const MISSION_CONVERSATION_RESPONSE_ACTION_KEYS = ["mission_action", "missionAction", "mission_response_action"] as const;

const MISSION_CONVERSATION_RESPONSE_KNOWN_KEYS = [
  "text",
  ...MISSION_CONVERSATION_RESPONSE_ACTION_KEYS,
  "complete_on_response",
  "complete_objective",
  "advance_objective",
  "defer_completion",
  "defer_objective_completion",
] as const;

const MISSION_ESCORT_AMBUSH_KNOWN_KEYS = [
  "mob_id",
  "mobId",
  "id",
  "count",
  "progress",
  "at_progress",
  "atProgress",
  "spawn_distance",
  "spawnDistance",
  "radius",
  "angle_deg",
  "angleDeg",
  "level",
  "rank",
  "initial_threat",
  "initialThreat",
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

function hasOwnKey(source: JsonObject, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeResponseBooleanState(source: JsonObject, key: string): MissionResponseBooleanState {
  if (!hasOwnKey(source, key)) return "unset";
  return parseBooleanFlag(source[key]) ? "true" : "false";
}

function responseBooleanValue(state: MissionResponseBooleanState) {
  if (state === "true") return true;
  if (state === "false") return false;
  return undefined;
}

function assignResponseBooleanState(fields: JsonObject, key: string, state: MissionResponseBooleanState) {
  const value = responseBooleanValue(state);
  if (value !== undefined) fields[key] = value;
}

function normalizeResponseMissionAction(source: JsonObject) {
  for (const key of MISSION_CONVERSATION_RESPONSE_ACTION_KEYS) {
    if (!hasOwnKey(source, key)) continue;
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") {
      return {
        key,
        value: String(value).trim(),
      };
    }
    return {
      key,
      value: "",
    };
  }
  return {
    key: "mission_action" as const,
    value: "",
  };
}

function conversationResponseExtraJson(source: JsonObject) {
  const extra = stripKnownKeys(source, MISSION_CONVERSATION_RESPONSE_KNOWN_KEYS);
  for (const key of MISSION_CONVERSATION_RESPONSE_ACTION_KEYS) {
    if (!hasOwnKey(source, key)) continue;
    const value = source[key];
    if (value !== null && value !== undefined && typeof value !== "string" && typeof value !== "number") {
      extra[key] = value;
    }
  }
  return formatJsonBlock(extra);
}

function mergeConversationResponseExtraJson(known: JsonObject, extraJson: string) {
  const extra = parseExtraJson(extraJson, "Conversation Response Extra JSON");
  return { ...extra, ...known };
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
    missionAction: "",
    missionActionKey: "mission_action",
    completeOnResponse: "unset",
    completeObjective: "unset",
    advanceObjective: "unset",
    deferCompletion: "unset",
    deferObjectiveCompletion: "unset",
    extraJson: "",
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

export function createMissionEscortAmbushDraft(): MissionEscortAmbushDraft {
  return {
    key: uid("ambush"),
    mobId: "",
    count: "1",
    progress: "0.5",
    spawnDistance: "2500",
    angleDeg: "-35",
    level: "",
    rank: "normal",
    initialThreat: "50",
    extraJson: "",
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
    count:
      type === "collect" ||
      type === "acquire" ||
      type === "deliver" ||
      type === "kill" ||
      type === "mine" ||
      type === "scan" ||
      type === "buy" ||
      type === "sell" ||
      type === "status_applied" ||
      type === "ability_success"
        ? "1"
        : "",
    dropChance: type === "collect" ? "1.0" : "",
    seconds: type === "travel" ? "1" : "",
    sectorId: "",
    region: "",
    contactId: "",
    conversationId: "",
    completeOnResponse: false,
    requiredPlayerStatusEffectIds: [],
    statusEffectIds: [],
    abilityIds: [],
    uniqueTargets: false,
    fullRepair: true,
    escortMobId: "",
    targetZoneId: "",
    destinationRadius: type === "escort" ? "900" : "",
    escortSpeed: type === "escort" ? "240" : "",
    arrivalMessage: "",
    ambushes: [],
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
      hideItemRewards: false,
      hideItemRewardsUntilComplete: false,
      hideModRewards: false,
      hideModRewardsUntilComplete: false,
      itemRewards: [],
      modRewards: [],
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
        missionAction: response.missionAction,
        missionActionKey: response.missionActionKey,
        completeOnResponse: response.completeOnResponse,
        completeObjective: response.completeObjective,
        advanceObjective: response.advanceObjective,
        deferCompletion: response.deferCompletion,
        deferObjectiveCompletion: response.deferObjectiveCompletion,
        extraJson: response.extraJson,
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
    requiredPlayerStatusEffectIds: [...objective.requiredPlayerStatusEffectIds],
    statusEffectIds: [...objective.statusEffectIds],
    abilityIds: [...objective.abilityIds],
    ambushes: objective.ambushes.map((ambush) => ({
      ...ambush,
      key: uid("ambush"),
    })),
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
      hideItemRewards: draft.rewards.hideItemRewards,
      hideItemRewardsUntilComplete: draft.rewards.hideItemRewardsUntilComplete,
      hideModRewards: draft.rewards.hideModRewards,
      hideModRewardsUntilComplete: draft.rewards.hideModRewardsUntilComplete,
      itemRewards: draft.rewards.itemRewards.map((reward) => ({
        key: uid("reward_item"),
        itemId: reward.itemId,
        count: reward.count,
        hidden: reward.hidden,
      })),
      modRewards: draft.rewards.modRewards.map((reward) => ({
        key: uid("reward_mod"),
        modId: reward.modId,
        hidden: reward.hidden,
      })),
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
  if (typeof raw === "string" || typeof raw === "number") {
    return createMissionConversationResponseDraft(String(raw));
  }
  const source = asObject(raw);
  const action = normalizeResponseMissionAction(source);
  return {
    key: uid("response"),
    text: String(source.text ?? ""),
    missionAction: action.value,
    missionActionKey: action.key,
    completeOnResponse: normalizeResponseBooleanState(source, "complete_on_response"),
    completeObjective: normalizeResponseBooleanState(source, "complete_objective"),
    advanceObjective: normalizeResponseBooleanState(source, "advance_objective"),
    deferCompletion: normalizeResponseBooleanState(source, "defer_completion"),
    deferObjectiveCompletion: normalizeResponseBooleanState(source, "defer_objective_completion"),
    extraJson: conversationResponseExtraJson(source),
  };
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

function normalizeImportedEscortAmbush(raw: unknown): MissionEscortAmbushDraft {
  const source = asObject(raw);
  return {
    key: uid("ambush"),
    mobId: String(source.mob_id ?? source.mobId ?? source.id ?? ""),
    count: numberString(source.count ?? 1) || "1",
    progress: numberString(source.progress ?? source.at_progress ?? source.atProgress ?? 0.5),
    spawnDistance: numberString(source.spawn_distance ?? source.spawnDistance ?? source.radius ?? 2500),
    angleDeg: numberString(source.angle_deg ?? source.angleDeg ?? -35),
    level: numberString(source.level),
    rank: String(source.rank ?? "normal"),
    initialThreat: numberString(source.initial_threat ?? source.initialThreat ?? 50),
    extraJson: formatJsonBlock(stripKnownKeys(source, MISSION_ESCORT_AMBUSH_KNOWN_KEYS)),
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
    completeOnResponse: parseBooleanFlag(source.complete_on_response ?? source.completeOnResponse),
    requiredPlayerStatusEffectIds: mergedStringList(
      source.required_player_status_effect_id,
      source.required_player_status_effect_ids,
      source.required_scanner_status_effect_id,
      source.required_scanner_status_effect_ids,
    ),
    statusEffectIds: mergedStringList(source.status_effect_id, source.status_effect_ids, source.effect_id, source.effect_ids),
    abilityIds: mergedStringList(source.ability_id, source.ability_ids),
    uniqueTargets: parseBooleanFlag(source.unique_targets ?? source.uniqueTargets),
    fullRepair: parseBooleanFlag(source.full ?? true),
    escortMobId: String(source.escort_mob_id ?? source.escortMobId ?? source.mob_id ?? ""),
    targetZoneId: String(source.target_zone_id ?? source.targetZoneId ?? source.destination_zone_id ?? source.destinationZoneId ?? ""),
    destinationRadius: numberString(source.destination_radius ?? source.destinationRadius ?? source.arrival_radius ?? source.arrivalRadius),
    escortSpeed: numberString(source.speed ?? source.escortSpeed),
    arrivalMessage: String(source.arrival_message ?? source.arrivalMessage ?? ""),
    ambushes: Array.isArray(source.ambushes) ? (source.ambushes as unknown[]).map((entry) => normalizeImportedEscortAmbush(entry)) : [],
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
      hidden: readAnyBooleanFlag(source, REWARD_ENTRY_HIDDEN_KEYS),
    };
  }

  const itemId = String(raw ?? "").trim();
  if (!itemId) return null;
  return {
    key: uid("reward_item"),
    itemId,
    count: "1",
    hidden: false,
  };
}

function normalizeImportedRewardItems(source: JsonObject) {
  const rawItems = Array.isArray(source.items) ? source.items : Array.isArray(source.itemIds) ? source.itemIds : Array.isArray(source.itemRewards) ? source.itemRewards : [];
  return rawItems.map((entry) => normalizeImportedRewardItem(entry)).filter((entry): entry is MissionRewardItemDraft => !!entry);
}

function normalizeImportedRewardMod(raw: unknown): MissionRewardModDraft | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const source = asObject(raw);
    const modId = numberString(source.mod_id ?? source.modId ?? source.id);
    if (!modId.trim()) return null;
    return {
      key: uid("reward_mod"),
      modId,
      hidden: readAnyBooleanFlag(source, REWARD_ENTRY_HIDDEN_KEYS),
    };
  }

  const modId = String(raw ?? "").trim();
  if (!modId) return null;
  return {
    key: uid("reward_mod"),
    modId,
    hidden: false,
  };
}

function normalizeImportedRewardMods(source: JsonObject) {
  const rawMods = Array.isArray(source.mods)
    ? source.mods
    : Array.isArray(source.modIds)
      ? source.modIds
      : Array.isArray(source.modRewards)
        ? source.modRewards
        : Array.isArray(source.mod_ids)
          ? source.mod_ids
          : Array.isArray(source.reward_mod_ids)
            ? source.reward_mod_ids
            : [];
  return rawMods.map((entry) => normalizeImportedRewardMod(entry)).filter((entry): entry is MissionRewardModDraft => !!entry);
}

function normalizeImportedRewards(raw: unknown): MissionRewardDraft {
  const source = asObject(raw);
  return {
    credits: numberString(source.credits ?? 0),
    xp: numberString(source.xp ?? 0),
    hideItemRewards: readAnyBooleanFlag(source, ITEM_REWARD_CATEGORY_HIDDEN_KEYS),
    hideItemRewardsUntilComplete: readAnyBooleanFlag(source, ITEM_REWARD_CATEGORY_HIDDEN_UNTIL_COMPLETE_KEYS),
    hideModRewards: readAnyBooleanFlag(source, MOD_REWARD_CATEGORY_HIDDEN_KEYS),
    hideModRewardsUntilComplete: readAnyBooleanFlag(source, MOD_REWARD_CATEGORY_HIDDEN_UNTIL_COMPLETE_KEYS),
    itemRewards: normalizeImportedRewardItems(source),
    modRewards: normalizeImportedRewardMods(source),
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
  const fields: JsonObject = {
    text: response.text,
  };
  if (response.missionAction.trim()) {
    fields[response.missionActionKey || "mission_action"] = response.missionAction.trim();
  }
  assignResponseBooleanState(fields, "complete_on_response", response.completeOnResponse);
  assignResponseBooleanState(fields, "complete_objective", response.completeObjective);
  assignResponseBooleanState(fields, "advance_objective", response.advanceObjective);
  assignResponseBooleanState(fields, "defer_completion", response.deferCompletion);
  assignResponseBooleanState(fields, "defer_objective_completion", response.deferObjectiveCompletion);
  return mergeConversationResponseExtraJson(fields, response.extraJson);
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

function serializeIdFilterFields(values: string[], singularKey: string, pluralKey: string) {
  const cleaned = values.map((entry) => entry.trim()).filter(Boolean);
  if (!cleaned.length) return {};
  const parsed = cleaned.map((entry) => parseScalar(entry) ?? entry);
  return cleaned.length === 1 ? { [singularKey]: parsed[0] } : { [pluralKey]: parsed };
}

function serializeObjectiveWithExtra(draft: MissionObjectiveDraft, known: JsonObject) {
  return mergeExtraJson(known, draft.extraJson, "Objective Extra JSON", MISSION_OBJECTIVE_KNOWN_KEYS);
}

function serializeEscortAmbushWithExtra(draft: MissionEscortAmbushDraft, known: JsonObject) {
  return mergeExtraJson(known, draft.extraJson, "Escort Ambush Extra JSON", MISSION_ESCORT_AMBUSH_KNOWN_KEYS);
}

function serializeEscortAmbush(draft: MissionEscortAmbushDraft) {
  return serializeEscortAmbushWithExtra(draft, {
    mob_id: draft.mobId.trim(),
    count: parsePositiveInteger(draft.count),
    progress: parseNumber(draft.progress) ?? 0,
    spawn_distance: parseNumber(draft.spawnDistance) ?? 2500,
    angle_deg: parseNumber(draft.angleDeg) ?? -35,
    ...(draft.level.trim() ? { level: parseNumber(draft.level) ?? parseScalar(draft.level) } : {}),
    ...(draft.rank.trim() ? { rank: draft.rank.trim() } : {}),
    ...(draft.initialThreat.trim() ? { initial_threat: parseNumber(draft.initialThreat) ?? 50 } : {}),
  });
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
        ...(draft.completeOnResponse ? { complete_on_response: true } : {}),
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "scan":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        ...serializeIdFilterFields(draft.requiredPlayerStatusEffectIds, "required_player_status_effect_id", "required_player_status_effect_ids"),
        ...serializeIdFilterFields(draft.statusEffectIds, "status_effect_id", "status_effect_ids"),
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "status_applied":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        ...serializeIdFilterFields(draft.statusEffectIds, "status_effect_id", "status_effect_ids"),
        ...serializeIdFilterFields(draft.abilityIds, "ability_id", "ability_ids"),
        ...(draft.uniqueTargets ? { unique_targets: true } : {}),
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "ability_success":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        ...serializeIdFilterFields(draft.abilityIds, "ability_id", "ability_ids"),
        ...(draft.uniqueTargets ? { unique_targets: true } : {}),
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
    case "deliver":
      return serializeObjectiveWithExtra(draft, {
        type,
        ...serializeObjectiveTargetFilters(draft, targetIds),
        item_id: parseScalar(draft.itemId) ?? draft.itemId,
        count: parseNumber(draft.count) ?? 1,
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
      });
    case "escort":
      return serializeObjectiveWithExtra(draft, {
        type,
        escort_mob_id: draft.escortMobId.trim(),
        ...(draft.targetZoneId.trim() ? { target_zone_id: draft.targetZoneId.trim() } : {}),
        ...(draft.destinationRadius.trim() ? { destination_radius: parseNumber(draft.destinationRadius) ?? 900 } : {}),
        ...(draft.escortSpeed.trim() ? { speed: parseNumber(draft.escortSpeed) ?? 240 } : {}),
        description: draft.description,
        objective: draft.objective,
        progress_label: draft.progressLabel,
        ...(draft.arrivalMessage.trim() ? { arrival_message: draft.arrivalMessage.trim() } : {}),
        ...(draft.ambushes.length ? { ambushes: draft.ambushes.map((ambush) => serializeEscortAmbush(ambush)) } : {}),
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

function serializeRewardItem(entry: MissionRewardItemDraft): JsonObject | null {
  const id = parseScalar(entry.itemId) ?? entry.itemId;
  if (id === undefined || !String(id).trim()) return null;

  return {
    id,
    count: parsePositiveInteger(entry.count),
    ...(entry.hidden ? { hidden: true } : {}),
  };
}

function serializeRewardMod(entry: MissionRewardModDraft): unknown | null {
  const id = parseScalar(entry.modId) ?? entry.modId;
  if (id === undefined || !String(id).trim()) return null;
  return entry.hidden ? { id, hidden: true } : id;
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
      ...(draft.rewards.hideItemRewards ? { hide_item_rewards: true } : {}),
      ...(draft.rewards.hideItemRewardsUntilComplete ? { hide_item_rewards_until_complete: true } : {}),
      items: draft.rewards.itemRewards.map((entry) => serializeRewardItem(entry)).filter((entry): entry is JsonObject => !!entry),
      reputation: serializeReputationEntries(draft.rewards.reputationEntries),
      ...(draft.rewards.hideModRewards ? { hide_mod_rewards: true } : {}),
      ...(draft.rewards.hideModRewardsUntilComplete ? { hide_mod_rewards_until_complete: true } : {}),
      mods: draft.rewards.modRewards.map((entry) => serializeRewardMod(entry)).filter((entry): entry is Exclude<typeof entry, null> => entry !== null),
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

const TALK_COMPLETION_RESPONSE_ACTIONS = new Set(["complete", "complete_talk", "talk_complete", "advance_objective", "start_escort"]);

function normalizeMissionActionValue(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as JsonObject;
    return String(source.type ?? source.action ?? "").trim().toLowerCase();
  }
  return String(value ?? "").trim().toLowerCase();
}

function extraResponseField(response: MissionConversationResponseDraft, keys: readonly string[]) {
  if (!response.extraJson.trim()) return undefined;
  try {
    const extra = parseExtraJson(response.extraJson, "Conversation Response Extra JSON");
    for (const key of keys) {
      if (hasOwnKey(extra, key)) return extra[key];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function conversationResponseMissionAction(response: MissionConversationResponseDraft) {
  const structured = normalizeMissionActionValue(response.missionAction);
  if (structured) return structured;
  return normalizeMissionActionValue(extraResponseField(response, MISSION_CONVERSATION_RESPONSE_ACTION_KEYS));
}

function responseStateRequestsCompletion(state: MissionResponseBooleanState, response: MissionConversationResponseDraft, key: string) {
  if (state === "true") return true;
  if (state === "false") return false;
  return parseBooleanFlag(extraResponseField(response, [key]));
}

function conversationResponseCompletesTalk(response: MissionConversationResponseDraft) {
  return (
    responseStateRequestsCompletion(response.completeOnResponse, response, "complete_on_response") ||
    responseStateRequestsCompletion(response.completeObjective, response, "complete_objective") ||
    responseStateRequestsCompletion(response.advanceObjective, response, "advance_objective") ||
    TALK_COMPLETION_RESPONSE_ACTIONS.has(conversationResponseMissionAction(response))
  );
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
    const conversationsById = new Map(mission.conversations.map((conversation) => [conversation.id.trim(), conversation]));
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
          if (response.extraJson.trim()) {
            try {
              parseExtraJson(response.extraJson, "Conversation Response Extra JSON");
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
        const needsSingleTarget = type === "talk" || type === "hail" || type === "deliver" || type === "buy" || type === "sell" || type === "repair";
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
          (type === "scan" ||
            type === "collect" ||
            type === "acquire" ||
            type === "deliver" ||
            type === "kill" ||
            type === "mine" ||
            type === "buy" ||
            type === "sell" ||
            type === "status_applied" ||
            type === "ability_success") &&
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

        for (const [fieldLabel, values] of [
          ["required player status effect", objective.requiredPlayerStatusEffectIds],
          ["status effect", objective.statusEffectIds],
          ["ability", objective.abilityIds],
        ] as const) {
          for (const value of values) {
            if (parseNumber(value) === undefined) {
              messages.push({
                level: "error",
                scope: "missions",
                draftIndex,
                itemId: id || undefined,
                message: `${prefix} has a non-numeric ${fieldLabel} id "${value}".`,
              });
            }
          }
        }

        if (type === "status_applied" && objective.statusEffectIds.length === 0) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires a status_effect_id.`,
          });
        }

        if (type === "ability_success" && objective.abilityIds.length === 0) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires an ability_id.`,
          });
        }

        if ((type === "collect" || type === "acquire" || type === "deliver" || type === "buy" || type === "sell") && !objective.itemId.trim()) {
          messages.push({
            level: "error",
            scope: "missions",
            draftIndex,
            itemId: id || undefined,
            message: `${prefix} requires an item_id.`,
          });
        }

        if (type === "escort") {
          if (!objective.escortMobId.trim()) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires an escort_mob_id.`,
            });
          }
          if (!objective.targetZoneId.trim()) {
            messages.push({
              level: "warning",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} should include a target_zone_id so the escort has a destination.`,
            });
          }
          if (objective.destinationRadius.trim() && parseNumber(objective.destinationRadius) === undefined) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a numeric destination_radius.`,
            });
          }
          if (objective.escortSpeed.trim() && parseNumber(objective.escortSpeed) === undefined) {
            messages.push({
              level: "error",
              scope: "missions",
              draftIndex,
              itemId: id || undefined,
              message: `${prefix} requires a numeric speed.`,
            });
          }

          for (const [ambushIndex, ambush] of objective.ambushes.entries()) {
            const ambushPrefix = `${prefix} ambush ${ambushIndex + 1}`;
            if (!ambush.mobId.trim()) {
              messages.push({
                level: "error",
                scope: "missions",
                draftIndex,
                itemId: id || undefined,
                message: `${ambushPrefix} requires a mob_id.`,
              });
            }
            for (const [field, value] of [
              ["count", ambush.count],
              ["progress", ambush.progress],
              ["spawn_distance", ambush.spawnDistance],
              ["angle_deg", ambush.angleDeg],
              ["level", ambush.level],
              ["initial_threat", ambush.initialThreat],
            ] as const) {
              if (value.trim() && parseNumber(value) === undefined) {
                messages.push({
                  level: "error",
                  scope: "missions",
                  draftIndex,
                  itemId: id || undefined,
                  message: `${ambushPrefix} requires a numeric ${field}.`,
                });
              }
            }
            if (ambush.extraJson.trim()) {
              try {
                parseExtraJson(ambush.extraJson, `${ambushPrefix} Extra JSON`);
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
          }
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
          } else if (objective.completeOnResponse) {
            const conversation = conversationsById.get(objective.conversationId.trim());
            const hasCompletingResponse = Boolean(
              conversation?.beats.some((beat) => beat.responses.some((response) => conversationResponseCompletesTalk(response))),
            );
            if (!hasCompletingResponse) {
              messages.push({
                level: "warning",
                scope: "missions",
                draftIndex,
                itemId: id || undefined,
                message: `${prefix} waits for response completion, but conversation "${objective.conversationId.trim()}" has no response with a completion flag or completing mission_action.`,
              });
            }
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
