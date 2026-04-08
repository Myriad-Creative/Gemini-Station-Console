import configData from "@lib/mod-auto-generator-config.json";
import {
  ModDraft,
  ModGeneratorMetadata,
  autoBalanceModDraft,
  buildModBudgetSummary,
  createModAbilityDraft,
  createModDraft,
  parseNumber,
  syncDerivedModFields,
} from "@lib/authoring";
import { getModSupportedStatCounts } from "@lib/mod-budget";
import { generateModDisplayName } from "@lib/mod-naming";

type ModAutoGeneratorConfig = typeof configData;

type ConfigStatId = keyof ModAutoGeneratorConfig["stats"] & string;
type GeneratorStatId = ((typeof configData.stat_order)[number] & string);
export type GeneratorSlotId = keyof ModAutoGeneratorConfig["slots"] & string;
export type GeneratorRoleId = keyof ModAutoGeneratorConfig["roles"] & string;
type ThreatSign = "positive" | "negative";

export interface AutoGenerateModsRequest {
  count: number;
  allowedSlots: string[];
  levelMin: number;
  levelMax: number;
  rarity: number;
  allowedRoles: string[];
  allowedStats?: string[];
  abilityPool: Array<number | string>;
  seed?: number;
}

export interface AutoGenerateModsResult {
  mods: ModDraft[];
  warnings: string[];
  request: {
    count: number;
    allowedSlots: GeneratorSlotId[];
    levelMin: number;
    levelMax: number;
    rarity: number;
    allowedRoles: GeneratorRoleId[];
    allowedStats: GeneratorStatId[];
    abilityPool: Array<number | string>;
  };
}

const GENERATOR_CONFIG = validateAndFreezeConfig(configData);

const SLOT_EXPORT_LABELS: Record<GeneratorSlotId, string> = {
  armor: "Armor",
  utility: "Utility",
  shields: "Shield",
  weapons: "Weapon",
  sensors: "Sensor",
  engines: "Engine",
};

const ABILITY_ROLL_CHANCE_BY_RARITY: Record<number, number> = {
  0: 0.08,
  1: 0.12,
  2: 0.16,
  3: 0.2,
  4: 0.24,
};
const DEFAULT_GENERATED_MOD_ICON = "res://assets/mods/DEFAULT.png";

const DEDICATED_PRIMARY_DEFAULT_MULTIPLIER = 3;

interface RandomSource {
  next(): number;
}

interface WeightedOption<T> {
  value: T;
  weight: number;
}

interface GeneratedStatSelection {
  key: GeneratorStatId;
  sign?: ThreatSign;
}

function validateAndFreezeConfig(config: ModAutoGeneratorConfig) {
  const errors = validateConfig(config);
  if (errors.length) {
    throw new Error(`Invalid mod auto-generator config:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

function validateConfig(config: ModAutoGeneratorConfig) {
  const errors: string[] = [];
  const statIds = new Set(Object.keys(config.stats));
  const slotIds = new Set(Object.keys(config.slots));
  const roleIds = new Set(Object.keys(config.roles));
  const rarityClassIds = new Set(Object.keys(config.rarity_classes.multipliers));

  if (!config.schema_version.trim()) errors.push("schema_version is required.");
  if (!config.config_name.trim()) errors.push("config_name is required.");

  for (const statId of config.stat_order) {
    if (!statIds.has(statId)) errors.push(`stat_order references missing stat "${statId}".`);
  }

  for (const statId of config.manual_only_stats) {
    const stat = config.stats[statId as ConfigStatId];
    if (!stat) {
      errors.push(`manual_only_stats references missing stat "${statId}".`);
      continue;
    }
    if (stat.rollable) errors.push(`manual-only stat "${statId}" cannot be rollable.`);
  }

  for (const [statId, stat] of Object.entries(config.stats)) {
    if (!rarityClassIds.has(stat.rarity_class)) {
      errors.push(`stat "${statId}" references unknown rarity class "${stat.rarity_class}".`);
    }
    if (!config.rarity_classes.by_stat[statId as ConfigStatId]) {
      errors.push(`rarity_classes.by_stat is missing "${statId}".`);
    } else if (config.rarity_classes.by_stat[statId as ConfigStatId] !== stat.rarity_class) {
      errors.push(`rarity_classes.by_stat["${statId}"] does not match stats["${statId}"].rarity_class.`);
    }
  }

  for (const slotId of config.slot_order) {
    if (!slotIds.has(slotId)) errors.push(`slot_order references missing slot "${slotId}".`);
    if (!config.matrices.slot_stat_affinity[slotId as GeneratorSlotId]) {
      errors.push(`slot_stat_affinity is missing slot "${slotId}".`);
    }
  }

  for (const roleId of config.role_order) {
    if (!roleIds.has(roleId)) errors.push(`role_order references missing role "${roleId}".`);
    if (!config.matrices.role_slot_affinity[roleId as GeneratorRoleId]) {
      errors.push(`role_slot_affinity is missing role "${roleId}".`);
    }
    if (!config.matrices.role_stat_weight[roleId as GeneratorRoleId]) {
      errors.push(`role_stat_weight is missing role "${roleId}".`);
    }
    if (!config.special_stat_rules.threat_generation.role_sign_bias[roleId as GeneratorRoleId]) {
      errors.push(`threat_generation.role_sign_bias is missing role "${roleId}".`);
    }
  }

  for (const [slotId, weights] of Object.entries(config.matrices.slot_stat_affinity)) {
    if (!slotIds.has(slotId)) {
      errors.push(`slot_stat_affinity references unknown slot "${slotId}".`);
      continue;
    }
    for (const statId of config.stat_order) {
      if (!(statId in weights)) {
        errors.push(`slot_stat_affinity["${slotId}"] is missing stat "${statId}".`);
      }
    }
    for (const statId of Object.keys(weights)) {
      if (!statIds.has(statId)) errors.push(`slot_stat_affinity["${slotId}"] references unknown stat "${statId}".`);
    }
  }

  for (const [roleId, weights] of Object.entries(config.matrices.role_slot_affinity)) {
    if (!roleIds.has(roleId)) {
      errors.push(`role_slot_affinity references unknown role "${roleId}".`);
      continue;
    }
    for (const slotId of config.slot_order) {
      if (!(slotId in weights)) errors.push(`role_slot_affinity["${roleId}"] is missing slot "${slotId}".`);
    }
  }

  for (const [roleId, weights] of Object.entries(config.matrices.role_stat_weight)) {
    if (!roleIds.has(roleId)) {
      errors.push(`role_stat_weight references unknown role "${roleId}".`);
      continue;
    }
    for (const statId of config.stat_order) {
      if (!(statId in weights)) errors.push(`role_stat_weight["${roleId}"] is missing stat "${statId}".`);
    }
    for (const statId of Object.keys(weights)) {
      if (!statIds.has(statId)) errors.push(`role_stat_weight["${roleId}"] references unknown stat "${statId}".`);
    }
  }

  for (const [primaryStatId, weights] of Object.entries(config.matrices.pair_affinity)) {
    if (!statIds.has(primaryStatId)) {
      errors.push(`pair_affinity references unknown primary stat "${primaryStatId}".`);
      continue;
    }
    for (const statId of config.stat_order) {
      if (!(statId in weights)) errors.push(`pair_affinity["${primaryStatId}"] is missing stat "${statId}".`);
    }
  }

  for (const [profileId, weights] of Object.entries(config.matrices.pair_affinity_profiles.threat_generation)) {
    if (profileId !== "positive" && profileId !== "negative") {
      errors.push(`threat_generation pair affinity profile "${profileId}" is not supported.`);
      continue;
    }
    for (const statId of config.stat_order) {
      if (!(statId in weights)) errors.push(`threat_generation profile "${profileId}" is missing stat "${statId}".`);
    }
  }

  for (const [slotId, slot] of Object.entries(config.slots)) {
    const statIdsForSlot =
      slotId === "utility"
        ? Object.values(config.slots.utility.recommended_primary_candidates_by_role).flat()
        : config.slots[slotId as Exclude<GeneratorSlotId, "utility">].recommended_primary_candidates;
    const defaultPrimary = slot.default_primary_stat;
    if (defaultPrimary && !statIds.has(defaultPrimary)) {
      errors.push(`slot "${slotId}" has unknown default_primary_stat "${defaultPrimary}".`);
    }
    for (const statId of statIdsForSlot) {
      if (!statIds.has(statId)) errors.push(`slot "${slotId}" references unknown recommended primary stat "${statId}".`);
    }
  }

  return errors;
}

function createRandom(seed?: number): RandomSource {
  if (!Number.isFinite(seed)) {
    return { next: () => Math.random() };
  }

  let current = (seed as number) >>> 0;
  return {
    next: () => {
      current += 0x6d2b79f5;
      let t = current;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function pickWeighted<T>(options: Array<WeightedOption<T>>, random: RandomSource): T {
  const filtered = options.filter((option) => option.weight > 0);
  if (!filtered.length) {
    throw new Error("No weighted options were available.");
  }

  const total = filtered.reduce((sum, option) => sum + option.weight, 0);
  const roll = random.next() * total;
  let cursor = 0;
  for (const option of filtered) {
    cursor += option.weight;
    if (roll <= cursor) return option.value;
  }
  return filtered[filtered.length - 1].value;
}

function getProceduralStatIds() {
  return GENERATOR_CONFIG.stat_order
    .filter((statId): statId is GeneratorStatId => statId in GENERATOR_CONFIG.stats)
    .filter((statId) => {
      const stat = getStatConfig(statId);
      return !!stat?.rollable && !GENERATOR_CONFIG.manual_only_stats.includes(statId) && statRarityMultiplier(statId) > 0;
    });
}

function normalizeRequest(request: AutoGenerateModsRequest) {
  const count = Math.floor(Number(request.count));
  const levelMin = Math.floor(Number(request.levelMin));
  const levelMax = Math.floor(Number(request.levelMax));
  const rarity = Math.floor(Number(request.rarity));
  const seed = Number.isFinite(request.seed) ? Number(request.seed) : undefined;
  const allowedSlots = [...new Set(request.allowedSlots.map((entry) => entry.trim()).filter(Boolean))] as GeneratorSlotId[];
  const allowedRoles = [...new Set(request.allowedRoles.map((entry) => entry.trim()).filter(Boolean))] as GeneratorRoleId[];
  const defaultAllowedStats = getProceduralStatIds();
  const requestedAllowedStats = request.allowedStats?.length ? request.allowedStats : defaultAllowedStats;
  const allowedStats = [...new Set(requestedAllowedStats.map((entry) => entry.trim()).filter(Boolean))] as GeneratorStatId[];
  const abilityPool = [...new Set(request.abilityPool.map((entry) => (typeof entry === "number" ? entry : String(entry).trim())).filter(Boolean))];

  if (!Number.isFinite(count) || count <= 0) throw new Error("Auto-generation count must be a positive integer.");
  if (count > 250) throw new Error("Auto-generation count must stay at 250 or below.");
  if (!allowedSlots.length) throw new Error("Select at least one allowed slot.");
  if (!allowedRoles.length) throw new Error("Select at least one allowed class.");
  if (!allowedStats.length) throw new Error("Select at least one allowed stat.");
  if (!Number.isFinite(levelMin) || !Number.isFinite(levelMax)) throw new Error("Level range must be numeric.");
  if (levelMin < 1 || levelMax > 100 || levelMin > levelMax) throw new Error("Level range must stay between 1 and 100, with min <= max.");
  if (!(rarity in ABILITY_ROLL_CHANCE_BY_RARITY)) throw new Error("Rarity must be between 0 and 4.");

  const invalidSlots = allowedSlots.filter((slot) => !(slot in GENERATOR_CONFIG.slots));
  if (invalidSlots.length) throw new Error(`Invalid slot name(s): ${invalidSlots.join(", ")}.`);

  const invalidRoles = allowedRoles.filter((role) => !(role in GENERATOR_CONFIG.roles));
  if (invalidRoles.length) throw new Error(`Invalid class name(s): ${invalidRoles.join(", ")}.`);

  const proceduralStatSet = new Set(defaultAllowedStats);
  const invalidStats = allowedStats.filter((stat) => !proceduralStatSet.has(stat));
  if (invalidStats.length) throw new Error(`Invalid or non-procedural stat name(s): ${invalidStats.join(", ")}.`);

  return {
    count,
    allowedSlots,
    levelMin,
    levelMax,
    rarity,
    allowedRoles,
    allowedStats,
    abilityPool,
    seed,
  };
}

function statRarityMultiplier(statId: GeneratorStatId) {
  const rarityClass =
    GENERATOR_CONFIG.rarity_classes.by_stat[
      statId as keyof typeof GENERATOR_CONFIG.rarity_classes.by_stat
    ] as keyof typeof GENERATOR_CONFIG.rarity_classes.multipliers;
  return GENERATOR_CONFIG.rarity_classes.multipliers[rarityClass];
}

function getStatConfig(statId: ConfigStatId | GeneratorStatId) {
  return GENERATOR_CONFIG.stats[statId as keyof typeof GENERATOR_CONFIG.stats];
}

function getSlotStatAffinity(slotId: GeneratorSlotId, statId: GeneratorStatId) {
  const matrix = GENERATOR_CONFIG.matrices.slot_stat_affinity as Record<string, Record<string, number>>;
  return matrix[slotId]?.[statId] ?? 0;
}

function getRoleStatWeight(roleId: GeneratorRoleId, statId: GeneratorStatId) {
  const matrix = GENERATOR_CONFIG.matrices.role_stat_weight as Record<string, Record<string, number>>;
  return matrix[roleId]?.[statId] ?? 0;
}

function getPairAffinity(primaryStatId: GeneratorStatId, secondaryStatId: GeneratorStatId) {
  const matrix = GENERATOR_CONFIG.matrices.pair_affinity as Record<string, Record<string, number>>;
  return matrix[primaryStatId]?.[secondaryStatId] ?? 0;
}

function isRollableStatForContext(statId: GeneratorStatId, slotId: GeneratorSlotId, roleId: GeneratorRoleId, allowedStats: Set<GeneratorStatId>) {
  if (!allowedStats.has(statId)) return false;
  const stat = getStatConfig(statId);
  if (!stat?.rollable) return false;
  if (GENERATOR_CONFIG.manual_only_stats.includes(statId)) return false;
  if (statRarityMultiplier(statId) <= 0) return false;
  const slotWeight = getSlotStatAffinity(slotId, statId);
  const roleWeight = getRoleStatWeight(roleId, statId);
  if (GENERATOR_CONFIG.generation_rules.zero_weight_blocks_roll && (slotWeight <= 0 || roleWeight <= 0)) return false;
  return true;
}

function getCandidatePrimaryStats(slotId: GeneratorSlotId, roleId: GeneratorRoleId) {
  if (slotId === "utility") {
    return GENERATOR_CONFIG.generation_rules.primary_stat_selection.recommended_primary_candidates_by_role_for_utility[roleId];
  }

  return GENERATOR_CONFIG.generation_rules.primary_stat_selection.recommended_primary_candidates_by_slot[slotId];
}

function getThreatSignBias(roleId: GeneratorRoleId): ThreatSign {
  const bias = GENERATOR_CONFIG.special_stat_rules.threat_generation.role_sign_bias[roleId];
  return bias === "negative" ? "negative" : "positive";
}

function getPrimaryThreatProfile(roleId: GeneratorRoleId) {
  return (getThreatSignBias(roleId) === "positive"
    ? GENERATOR_CONFIG.matrices.pair_affinity_profiles.threat_generation.positive
    : GENERATOR_CONFIG.matrices.pair_affinity_profiles.threat_generation.negative) as Record<string, number>;
}

function getValidPrimaryOptions(slotId: GeneratorSlotId, roleId: GeneratorRoleId, allowedStats: Set<GeneratorStatId>) {
  const defaultPrimary =
    slotId === "utility" ? null : GENERATOR_CONFIG.generation_rules.primary_stat_selection.dedicated_slot_default_primary[slotId];

  return getCandidatePrimaryStats(slotId, roleId)
    .filter((statId): statId is GeneratorStatId => statId in GENERATOR_CONFIG.stats)
    .filter((statId) => isRollableStatForContext(statId, slotId, roleId, allowedStats))
    .map<WeightedOption<GeneratorStatId>>((statId, index, all) => {
      const slotWeight = getSlotStatAffinity(slotId, statId);
      const roleWeight = getRoleStatWeight(roleId, statId);
      const rarityMultiplier = statRarityMultiplier(statId);
      const orderWeight = Math.max(1, all.length - index);
      const defaultWeight = defaultPrimary && statId === defaultPrimary ? DEDICATED_PRIMARY_DEFAULT_MULTIPLIER : 1;
      return {
        value: statId,
        weight: slotWeight * roleWeight * rarityMultiplier * orderWeight * defaultWeight,
      };
    })
    .filter((option) => option.weight > 0);
}

function getSecondaryPairWeight(primaryStatId: GeneratorStatId, secondaryStatId: GeneratorStatId, roleId: GeneratorRoleId) {
  if (primaryStatId === "threat_generation") {
    return getPrimaryThreatProfile(roleId)[secondaryStatId];
  }
  return getPairAffinity(primaryStatId, secondaryStatId);
}

function getSecondaryThreatSign(primaryStatId: GeneratorStatId, roleId: GeneratorRoleId): ThreatSign {
  const hints = GENERATOR_CONFIG.special_stat_rules.threat_generation.secondary_sign_hint_by_primary_stat as Record<string, string>;
  const hint = hints[primaryStatId];
  if (hint === "negative") return "negative";
  if (hint === "positive") return "positive";
  return getThreatSignBias(roleId);
}

function getSecondaryOptions(
  primaryStatId: GeneratorStatId,
  slotId: GeneratorSlotId,
  roleId: GeneratorRoleId,
  excludedStatIds: Set<GeneratorStatId>,
  allowedStats: Set<GeneratorStatId>,
) {
  return GENERATOR_CONFIG.stat_order
    .filter((statId): statId is GeneratorStatId => statId in GENERATOR_CONFIG.stats)
    .filter((statId) => !excludedStatIds.has(statId))
    .filter((statId) => isRollableStatForContext(statId, slotId, roleId, allowedStats))
    .map<WeightedOption<GeneratedStatSelection>>((statId) => {
      const slotWeight = getSlotStatAffinity(slotId, statId);
      const roleWeight = getRoleStatWeight(roleId, statId);
      const pairWeight = getSecondaryPairWeight(primaryStatId, statId, roleId);
      const rarityMultiplier = statRarityMultiplier(statId);
      return {
        value: {
          key: statId,
          sign: statId === "threat_generation" ? getSecondaryThreatSign(primaryStatId, roleId) : undefined,
        },
        weight:
          slotWeight *
          roleWeight *
          pairWeight *
          rarityMultiplier *
          GENERATOR_CONFIG.generation_rules.default_external_multipliers.situational_multiplier,
      };
    })
    .filter((option) => option.weight > 0);
}

function roleHasValidSlot(roleId: GeneratorRoleId, slotId: GeneratorSlotId, allowedStats: Set<GeneratorStatId>) {
  return getValidPrimaryOptions(slotId, roleId, allowedStats).length > 0;
}

function rollLevel(min: number, max: number, random: RandomSource) {
  if (min === max) return min;
  return min + Math.floor(random.next() * (max - min + 1));
}

function maybePickAbility(abilityPool: Array<number | string>, rarity: number, random: RandomSource) {
  if (!abilityPool.length) return [];
  const chance = ABILITY_ROLL_CHANCE_BY_RARITY[rarity] ?? 0;
  if (random.next() > chance) return [];
  return [pickWeighted(abilityPool.map((ability) => ({ value: ability, weight: 1 })), random)];
}

function chooseRole(allowedRoles: GeneratorRoleId[], allowedSlots: GeneratorSlotId[], allowedStats: Set<GeneratorStatId>, random: RandomSource) {
  const validRoles = allowedRoles.filter((roleId) => allowedSlots.some((slotId) => roleHasValidSlot(roleId, slotId, allowedStats)));
  if (!validRoles.length) throw new Error("No valid class and slot combinations were available for auto-generation.");
  return pickWeighted(validRoles.map((roleId) => ({ value: roleId, weight: 1 })), random);
}

function chooseSlot(roleId: GeneratorRoleId, allowedSlots: GeneratorSlotId[], allowedStats: Set<GeneratorStatId>, random: RandomSource) {
  const validSlots = allowedSlots.filter((slotId) => roleHasValidSlot(roleId, slotId, allowedStats));
  if (!validSlots.length) {
    throw new Error(`No valid slots remain for class "${roleId}" within the selected slot pool.`);
  }

  const positiveAffinity = validSlots.filter((slotId) => (GENERATOR_CONFIG.matrices.role_slot_affinity[roleId][slotId] ?? 0) > 0);
  const pool = positiveAffinity.length ? positiveAffinity : validSlots;
  return pickWeighted(
    pool.map((slotId) => ({
      value: slotId,
      weight: positiveAffinity.length ? GENERATOR_CONFIG.matrices.role_slot_affinity[roleId][slotId] : 1,
    })),
    random,
  );
}

function choosePrimaryStat(slotId: GeneratorSlotId, roleId: GeneratorRoleId, allowedStats: Set<GeneratorStatId>, random: RandomSource) {
  const candidates = getValidPrimaryOptions(slotId, roleId, allowedStats);
  if (!candidates.length) {
    throw new Error(`No legal primary stats were available for ${roleId} on ${slotId}.`);
  }
  return pickWeighted(candidates, random);
}

function chooseStatCount(maxAvailableStats: number, rarity: number, random: RandomSource) {
  const supportedCounts = getModSupportedStatCounts(rarity).filter((count) => count > 0 && count <= maxAvailableStats);
  if (!supportedCounts.length) {
    throw new Error(`Rarity ${rarity} has no supported stat counts for the chosen combination.`);
  }
  return pickWeighted(supportedCounts.map((count) => ({ value: count, weight: count })), random);
}

function applyThreatSigns(mod: ModDraft, selectedStats: GeneratedStatSelection[]) {
  const signedByKey = new Map(selectedStats.map((entry) => [entry.key, entry.sign]));
  return syncDerivedModFields({
    ...mod,
    stats: mod.stats.map((entry) => {
      const sign = signedByKey.get(entry.key as GeneratorStatId);
      if (!sign || entry.key !== "threat_generation") return entry;
      const numericValue = parseNumber(entry.value);
      if (numericValue === undefined) return entry;
      const signedValue = sign === "negative" ? -Math.abs(numericValue) : Math.abs(numericValue);
      return {
        ...entry,
        value: String(Number(signedValue.toFixed(2))),
      };
    }),
  });
}

function floorGeneratedStatValues(mod: ModDraft) {
  return syncDerivedModFields({
    ...mod,
    stats: mod.stats.map((entry) => {
      const numericValue = parseNumber(entry.value);
      if (numericValue === undefined) return entry;
      const flooredMagnitude = Math.floor(Math.abs(numericValue));
      const nextValue = numericValue < 0 ? -flooredMagnitude : flooredMagnitude;
      return {
        ...entry,
        value: String(nextValue),
      };
    }),
  });
}

function enforceWholeNumberBudgetCap(mod: ModDraft) {
  let nextMod = floorGeneratedStatValues(syncDerivedModFields(mod));
  let safety = 0;

  while (safety < 1000) {
    safety += 1;
    const budget = buildModBudgetSummary(nextMod);
    if (!budget.isOverBudget || budget.targetScore === undefined) {
      return floorGeneratedStatValues(syncDerivedModFields(nextMod));
    }

    const candidate = nextMod.stats
      .map((entry, index) => {
        const numericValue = parseNumber(entry.value);
        const budgetStat = budget.stats[index];
        return {
          index,
          numericValue,
          powerScore: budgetStat?.powerScore ?? 0,
        };
      })
      .filter(
        (entry): entry is { index: number; numericValue: number; powerScore: number } =>
          entry.numericValue !== undefined && Math.abs(entry.numericValue) > 0,
      )
      .sort((left, right) => right.powerScore - left.powerScore || Math.abs(right.numericValue) - Math.abs(left.numericValue))[0];

    if (!candidate) {
      return floorGeneratedStatValues(syncDerivedModFields(nextMod));
    }

    nextMod = syncDerivedModFields({
      ...nextMod,
      stats: nextMod.stats.map((entry, index) => {
        if (index !== candidate.index) return entry;
        const magnitude = Math.max(0, Math.floor(Math.abs(candidate.numericValue)) - 1);
        const signedValue = candidate.numericValue < 0 ? -magnitude : magnitude;
        return {
          ...entry,
          value: String(signedValue),
        };
      }),
    });
  }

  return floorGeneratedStatValues(syncDerivedModFields(nextMod));
}

function collectFinalRolledStats(mod: ModDraft) {
  return Object.fromEntries(
    mod.stats
      .map((entry) => [entry.key.trim(), parseNumber(entry.value)] as const)
      .filter((entry): entry is [string, number] => !!entry[0] && entry[1] !== undefined),
  );
}

function buildGeneratorMeta(
  request: ReturnType<typeof normalizeRequest>,
  roleId: GeneratorRoleId,
  slotId: GeneratorSlotId,
  level: number,
  primaryStat: GeneratorStatId,
  selectedStats: GeneratedStatSelection[],
  selectedAbilities: Array<number | string>,
  mod: ModDraft,
  generatedName: ReturnType<typeof generateModDisplayName>,
): ModGeneratorMetadata {
  const finalRolledStats = collectFinalRolledStats(mod);
  const threatSignEntry = selectedStats.find((entry) => entry.key === "threat_generation" && entry.sign);
  return {
    generatedBy: "auto",
    requestedRoles: [...request.allowedRoles],
    requestedSlots: [...request.allowedSlots],
    requestedStats: [...request.allowedStats],
    roleId,
    slotId,
    level,
    rarity: request.rarity,
    primaryStat,
    secondaryStats: selectedStats.slice(1).map((entry) => entry.key),
    abilityPool: [...request.abilityPool],
    selectedAbilities: [...selectedAbilities],
    finalRolledStats,
    threatSign: threatSignEntry?.sign,
    naming: {
      displayName: generatedName.displayName,
      source: generatedName.source,
      threatSign: generatedName.threatSign,
      phrase: generatedName.phrase,
      descriptor: generatedName.descriptor,
      baseTerm: generatedName.baseTerm,
      component: generatedName.component,
      modifier: generatedName.modifier,
    },
  };
}

function generateOneMod(
  request: ReturnType<typeof normalizeRequest>,
  existingIds: string[],
  previousId: string | undefined,
  usedNames: Set<string>,
  generationIndex: number,
  random: RandomSource,
) {
  const allowedStatSet = new Set(request.allowedStats);
  const roleId = chooseRole(request.allowedRoles, request.allowedSlots, allowedStatSet, random);
  const slotId = chooseSlot(roleId, request.allowedSlots, allowedStatSet, random);
  const primaryStatId = choosePrimaryStat(slotId, roleId, allowedStatSet, random);
  const primarySelection: GeneratedStatSelection = {
    key: primaryStatId,
    sign: primaryStatId === "threat_generation" ? getThreatSignBias(roleId) : undefined,
  };

  const secondaryOptions = getSecondaryOptions(primaryStatId, slotId, roleId, new Set([primaryStatId]), allowedStatSet);
  const statCount = chooseStatCount(1 + secondaryOptions.length, request.rarity, random);
  const selectedStats: GeneratedStatSelection[] = [primarySelection];

  while (selectedStats.length < statCount) {
    const excluded = new Set(selectedStats.map((entry) => entry.key));
    const nextOptions = getSecondaryOptions(primaryStatId, slotId, roleId, excluded, allowedStatSet);
    if (!nextOptions.length) break;
    selectedStats.push(pickWeighted(nextOptions, random));
  }

  const level = rollLevel(request.levelMin, request.levelMax, random);
  const selectedAbilities = maybePickAbility(request.abilityPool, request.rarity, random);
  const threatSign = selectedStats.find((entry) => entry.key === "threat_generation")?.sign;
  const generatedName = generateModDisplayName(
    {
      slotId,
      primaryStatId,
      rarity: request.rarity,
      secondaryStatIds: selectedStats.slice(1).map((entry) => entry.key),
      threatSign,
      seed: request.seed,
      batchIndex: generationIndex,
    },
    { existingNames: usedNames },
  );

  let draft = createModDraft(existingIds, previousId);
  draft = {
    ...draft,
    name: generatedName.displayName,
    slot: SLOT_EXPORT_LABELS[slotId],
    classRestriction: ["None"],
    levelRequirement: String(level),
    rarity: String(request.rarity),
    durability: "100",
    icon: DEFAULT_GENERATED_MOD_ICON,
    abilities: selectedAbilities.map((abilityId) => createModAbilityDraft(String(abilityId), "")),
    stats: selectedStats.map((entry) => ({
      key: entry.key,
      value: "",
    })),
    description: `Auto-generated ${GENERATOR_CONFIG.slots[slotId].label.toLowerCase()} mod for ${GENERATOR_CONFIG.roles[roleId].label}.`,
    generatorMeta: undefined,
  };

  draft = autoBalanceModDraft(draft, {
    fillBlankStatValues: true,
    syncAllStatValuesToMax: true,
  });
  draft = applyThreatSigns(draft, selectedStats);
  draft = floorGeneratedStatValues(draft);
  draft = enforceWholeNumberBudgetCap(draft);
  draft = syncDerivedModFields({
    ...draft,
    generatorMeta: buildGeneratorMeta(request, roleId, slotId, level, primaryStatId, selectedStats, selectedAbilities, draft, generatedName),
  });

  return draft;
}

export function generateAutoMods(request: AutoGenerateModsRequest, existingIds: string[] = [], previousId?: string): AutoGenerateModsResult {
  const normalized = normalizeRequest(request);
  const random = createRandom(request.seed);
  const warnings: string[] = [];
  const knownIds = [...existingIds];
  const usedNames = new Set<string>();
  const mods: ModDraft[] = [];
  let currentPreviousId = previousId;

  const allowedStatSet = new Set(normalized.allowedStats);
  const skippedRoles = normalized.allowedRoles.filter((roleId) => !normalized.allowedSlots.some((slotId) => roleHasValidSlot(roleId, slotId, allowedStatSet)));
  if (skippedRoles.length) {
    warnings.push(`Skipped class options with no valid slot/stat combinations: ${skippedRoles.join(", ")}.`);
  }

  for (let index = 0; index < normalized.count; index += 1) {
    const nextDraft = generateOneMod(normalized, knownIds, currentPreviousId, usedNames, index, random);
    mods.push(nextDraft);
    knownIds.push(nextDraft.id.trim());
    usedNames.add(nextDraft.name.trim().toLowerCase());
    currentPreviousId = nextDraft.id.trim() || currentPreviousId;
  }

  return {
    mods,
    warnings,
    request: normalized,
  };
}

export function getAutoModGeneratorConfig() {
  return GENERATOR_CONFIG;
}
