import type {
  MissionPlaceholderIssue,
  MissionRewardLookupResult,
  MissionRewardSummary,
  NormalizedMission,
  NormalizedMissionObjective,
  NormalizedMissionStep,
} from "@lib/mission-lab/types";
import {
  asRecord,
  dedupeStrings,
  extractTargetIds,
  humanizeToken,
  listFromUnknown,
  normalizeTaxonomyList,
  parseBooleanValue,
  parseNumberValue,
  slugify,
  stringOrNull,
  summarizeObjectiveSource,
} from "@lib/mission-lab/utils";

export interface MissionRewardResolver {
  resolve(id: string): MissionRewardLookupResult | null;
}

export interface MissionNormalizationInput {
  key: string;
  fileName: string;
  relativePath: string;
  folderPath: string;
  folderName: string;
  folderSlug: string;
  parsed: unknown;
  strictJsonValid: boolean;
  parseStrategy: "strict" | "json5" | "repaired";
  importWarnings: string[];
  rewardResolver?: MissionRewardResolver;
}

export interface MissionNormalizationResult {
  mission: NormalizedMission;
  warnings: string[];
  placeholderIssues: MissionPlaceholderIssue[];
}

function normalizePrerequisiteIds(source: Record<string, unknown>) {
  const nestedPrerequisites = asRecord(source.prerequisites);

  if (Array.isArray(nestedPrerequisites.mission_ids)) {
    return dedupeStrings((nestedPrerequisites.mission_ids as unknown[]).map((entry) => String(entry)));
  }

  if (Array.isArray(source.required_missions)) {
    return dedupeStrings((source.required_missions as unknown[]).map((entry) => String(entry)));
  }

  if (Array.isArray(source.prerequisites)) {
    return dedupeStrings(
      (source.prerequisites as unknown[])
        .map((entry) => {
          if (typeof entry === "string" || typeof entry === "number") return String(entry);
          const prerequisite = asRecord(entry);
          return String(prerequisite.mission_id ?? prerequisite.id ?? "");
        })
        .filter(Boolean),
    );
  }

  return [];
}

function normalizeObjective(raw: unknown, stepIndex: number, objectiveIndex: number): NormalizedMissionObjective {
  const source = asRecord(raw);
  const type = String(source.type ?? "custom").trim().toLowerCase() || "custom";
  const count = parseNumberValue(source.count);

  return {
    key: `step-${stepIndex}-objective-${objectiveIndex}`,
    index: objectiveIndex,
    type,
    count,
    description: summarizeObjectiveSource(source, type, count),
    targetIds: extractTargetIds(source),
    raw: source,
  };
}

function normalizeStep(raw: unknown, stepIndex: number): NormalizedMissionStep {
  const source = asRecord(raw);
  const objectives = Array.isArray(source.objectives)
    ? (source.objectives as unknown[]).map((objective, objectiveIndex) => normalizeObjective(objective, stepIndex, objectiveIndex))
    : [];

  return {
    key: `step-${stepIndex}`,
    index: stepIndex,
    title: stringOrNull(source.title),
    description: stringOrNull(source.description),
    mode: stringOrNull(source.mode)?.toLowerCase() ?? null,
    objectives,
    raw: source,
  };
}

function normalizeSteps(source: Record<string, unknown>) {
  if (Array.isArray(source.steps) && source.steps.length) {
    return (source.steps as unknown[]).map((step, stepIndex) => normalizeStep(step, stepIndex));
  }

  const objectives = Array.isArray(source.objectives) ? (source.objectives as unknown[]) : [];
  return [
    {
      key: "step-0",
      index: 0,
      title: stringOrNull(source.step_title) ?? "Step 1",
      description: stringOrNull(source.step_description ?? source.description),
      mode: stringOrNull(source.mode)?.toLowerCase() ?? null,
      objectives: objectives.map((objective, objectiveIndex) => normalizeObjective(objective, 0, objectiveIndex)),
      raw: {
        mode: source.mode,
        objectives,
      },
    },
  ] satisfies NormalizedMissionStep[];
}

function extractConversationList(source: Record<string, unknown>) {
  if (Array.isArray(source.conversations)) return source.conversations as unknown[];
  if (Array.isArray(source.dialogue)) return source.dialogue as unknown[];
  return [];
}

function resolveRewardEntries(
  ids: string[],
  kind: "mod" | "item" | "unknown",
  resolver?: MissionRewardResolver,
): MissionRewardLookupResult[] {
  return ids.map((id) => {
    const resolved = resolver?.resolve(id);
    if (resolved) return resolved;
    return { id, kind, name: null, icon: null };
  });
}

function extractRewardIds(value: unknown, preferredKeys: string[]) {
  const source = asRecord(value);
  const ids: string[] = [];

  for (const key of preferredKeys) {
    const entry = source[key];
    if (!entry) continue;

    if (Array.isArray(entry)) {
      for (const candidate of entry) {
        if (typeof candidate === "string" || typeof candidate === "number") {
          ids.push(String(candidate));
          continue;
        }

        const nested = asRecord(candidate);
        const nestedId = stringOrNull(
          nested.id ?? nested.mod_id ?? nested.item_id ?? nested.reward_id ?? nested.key ?? nested.resource_id,
        );
        if (nestedId) ids.push(nestedId);
      }
      continue;
    }

    const single = stringOrNull(entry);
    if (single) ids.push(single);
  }

  return dedupeStrings(ids);
}

function normalizeRewards(rawRewards: unknown, rewardResolver?: MissionRewardResolver): MissionRewardSummary {
  const rewards = asRecord(rawRewards);
  const credits =
    parseNumberValue(rewards.credits) ??
    parseNumberValue(rewards.credit) ??
    parseNumberValue(rewards.money) ??
    parseNumberValue(rewards.currency);
  const xp =
    parseNumberValue(rewards.xp) ??
    parseNumberValue(rewards.exp) ??
    parseNumberValue(rewards.experience);
  const modIds = extractRewardIds(rewards, ["mod_ids", "mods", "reward_mod_ids"]);
  const itemIds = extractRewardIds(rewards, ["item_ids", "items", "reward_item_ids"]);
  const resolvedRewards = [
    ...resolveRewardEntries(modIds, "mod", rewardResolver),
    ...resolveRewardEntries(itemIds, "item", rewardResolver),
  ];

  return {
    credits,
    xp,
    modIds,
    itemIds,
    rewards: resolvedRewards,
  };
}

function normalizeClass(value: unknown) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;
  return normalized.toLowerCase() === "none" ? null : normalized;
}

function normalizeLevel(source: Record<string, unknown>) {
  const availability = asRecord(source.availability);
  return (
    parseNumberValue(source.level) ??
    parseNumberValue(availability.level) ??
    parseNumberValue(availability.level_min) ??
    parseNumberValue(source.level_min) ??
    parseNumberValue(source.level_max)
  );
}

export function normalizeMissionRecord(input: MissionNormalizationInput): MissionNormalizationResult {
  const source = asRecord(input.parsed);
  const warnings = [...input.importWarnings];

  const arcs = normalizeTaxonomyList(source.arcs);
  const tags = normalizeTaxonomyList(source.tags);
  const placeholderIssues: MissionPlaceholderIssue[] = [];

  const id = stringOrNull(source.id) ?? input.fileName.replace(/\.json$/i, "");
  if (!stringOrNull(source.id)) warnings.push(`Missing mission id, using file name fallback "${id}".`);

  if (arcs.placeholders.length) {
    placeholderIssues.push({
      missionKey: input.key,
      missionId: id,
      relativePath: input.relativePath,
      field: "arcs",
      values: arcs.placeholders,
    });
  }

  if (tags.placeholders.length) {
    placeholderIssues.push({
      missionKey: input.key,
      missionId: id,
      relativePath: input.relativePath,
      field: "tags",
      values: tags.placeholders,
    });
  }

  const steps = normalizeSteps(source);
  const objectiveTypes = dedupeStrings(steps.flatMap((step) => step.objectives.map((objective) => objective.type)));
  const prerequisiteIds = normalizePrerequisiteIds(source);
  const category = stringOrNull(source.category);
  const normalizedClass = normalizeClass(source.class);
  const derivedCategory = category ?? arcs.normalized[0] ?? input.folderName ?? null;
  const conversations = extractConversationList(source);

  const mission: NormalizedMission = {
    key: input.key,
    id,
    title: stringOrNull(source.title) ?? id,
    level: normalizeLevel(source),
    image: stringOrNull(source.image),
    giverId: stringOrNull(source.giver_id),
    turnInTo: stringOrNull(source.turn_in_to),
    class: normalizedClass,
    classLabel: normalizedClass ?? "None",
    faction: stringOrNull(source.faction),
    arcsRaw: source.arcs ?? null,
    tagsRaw: source.tags ?? null,
    arcs: arcs.normalized,
    tags: tags.normalized,
    repeatable: parseBooleanValue(source.repeatable),
    prerequisites: prerequisiteIds,
    prerequisiteIds,
    hasPrerequisites: prerequisiteIds.length > 0,
    steps,
    conversations,
    rewardsRaw: source.rewards ?? null,
    rewards: normalizeRewards(source.rewards, input.rewardResolver),
    description: stringOrNull(source.description),
    descriptionComplete: stringOrNull(source.description_complete),
    folderPath: input.folderPath,
    folderName: input.folderName,
    folderSlug: input.folderSlug || slugify(input.folderName) || "root",
    relativePath: input.relativePath,
    fileName: input.fileName,
    primaryMode: steps[0]?.mode ?? null,
    objectiveCount: steps.reduce((total, step) => total + step.objectives.length, 0),
    objectiveTypes,
    prerequisiteCount: prerequisiteIds.length,
    hasConversations: conversations.length > 0,
    derivedCategory,
    importWarnings: warnings,
    strictJsonValid: input.strictJsonValid,
    parseStrategy: input.parseStrategy,
    raw: source,
  };

  if (!steps.length) warnings.push("Mission imported without steps.");
  if (!mission.primaryMode) warnings.push("Mission has no explicit step mode.");

  return {
    mission,
    warnings,
    placeholderIssues,
  };
}

export function buildMissionObjectivePreview(mission: NormalizedMission) {
  const primaryStep = mission.steps[0];
  if (!primaryStep) return [];

  const lines = primaryStep.objectives.map((objective) => objective.description || humanizeToken(objective.type));
  if (primaryStep.mode === "single") return lines.slice(0, 1);
  return lines.slice(0, 4);
}

export function createRewardResolver(
  mods: Array<{ id: string; name: string; icon?: string }>,
  items: Array<{ id: string; name: string; icon?: string }>,
): MissionRewardResolver {
  const modMap = new Map(mods.map((entry) => [entry.id, entry]));
  const itemMap = new Map(items.map((entry) => [entry.id, entry]));

  return {
    resolve(id: string) {
      const mod = modMap.get(id);
      if (mod) return { id, kind: "mod", name: mod.name ?? null, icon: mod.icon ?? null };

      const item = itemMap.get(id);
      if (item) return { id, kind: "item", name: item.name ?? null, icon: item.icon ?? null };

      return null;
    },
  };
}
