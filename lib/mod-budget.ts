export type ModStatFamily = "general" | "exotic" | "extraExotic";

export interface ModStatBudgetConfig {
  family: ModStatFamily;
  level1Max: number;
  level100Max: number;
  roundStep?: number;
}

export interface ModBudgetStatInput {
  key: string;
  value?: number;
}

export interface ModBudgetAbilityInput {
  id?: string;
  budgetCost?: number;
}

export interface ModBudgetStatResult {
  key: string;
  value: number;
  family: ModStatFamily;
  baseMaxAtLevel: number;
  slotIndex: number;
  slotMultiplier?: number;
  adjustedSlotMultiplier?: number;
  effectiveMaxValue?: number;
  currentMaxValue?: number;
  normalizedUsage: number;
  powerScore: number;
  budgetSpent: number;
}

export interface ModBudgetAbilityResult {
  id: string;
  baseSlotCost: number;
  extraSlotCost: number;
  slotCost: number;
  baseBudgetCost: number;
  extraBudgetCost: number;
  budgetCost: number;
  powerScore: number;
  budgetSpent: number;
}

export interface ModBudgetSummary {
  requiredLevel?: number;
  rarity?: number;
  baseStatMax?: number;
  supportedStatCounts: number[];
  activeStatCount: number;
  slotProfile?: number[];
  slotProfileLabel?: string;
  slotProfileTotal?: number;
  rarityCapacityMultiplier?: number;
  abilitySlotCostTotal: number;
  statCapacityRemainingMultiplier?: number;
  targetScore?: number;
  budgetCap: number;
  totalStatBudget: number;
  totalAbilityBudget: number;
  totalBudgetSpent: number;
  budgetRemaining?: number;
  itemLevel?: number;
  isOverBudget: boolean;
  stats: ModBudgetStatResult[];
  abilities: ModBudgetAbilityResult[];
}

export const MOD_REQUIRED_LEVEL_MIN = 1;
export const MOD_REQUIRED_LEVEL_MAX = 100;
export const MOD_MAX_STATS = 5;
export const MOD_MAX_ABILITIES = 2;
export const MOD_BASE_ABILITY_SLOT_COST = 0.5;
export const MOD_BASE_ABILITY_BUDGET_COST = MOD_BASE_ABILITY_SLOT_COST;
export const MOD_ABILITY_BUDGET_COST_OVERRIDES: Record<string, number> = {};
export const MOD_RARITY_ITEM_LEVEL_BASE: Record<number, number> = {
  0: 0,
  1: 100,
  2: 200,
  3: 300,
  4: 400,
};

export const MOD_RARITY_SLOT_PROFILES: Record<number, number[][]> = {
  0: [
    [1.0],
    [0.5, 0.5],
  ],
  1: [[1.0, 0.4]],
  2: [
    [1.1, 0.7],
    [1.0, 0.55, 0.25],
  ],
  3: [
    [1.2, 0.65, 0.35],
    [1.1, 0.55, 0.35, 0.2],
  ],
  4: [
    [1.25, 0.65, 0.4, 0.3],
    [1.15, 0.55, 0.35, 0.3, 0.25],
  ],
};

// Current placeholder table:
// every stat uses the required level as its full single-slot max until a real
// tuning table is supplied.
export const MOD_STAT_BUDGET_CONFIG: Record<string, ModStatBudgetConfig> = {
  armor: { family: "general", level1Max: 10, level100Max: 1000, roundStep: 1 },
  shields: { family: "general", level1Max: 10, level100Max: 1000, roundStep: 1 },
  power: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  evasion: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  targeting: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  hacking: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  sensors: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  salvage_bonus: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  speed: { family: "general", level1Max: 1, level100Max: 100, roundStep: 1 },
  energy_regen_rate: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 1 },
  shield_regen: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 1 },
  threat_generation: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 1 },
  stealth: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 1 },
  heat_resistance: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 1 },
  overclock: { family: "exotic", level1Max: 1, level100Max: 100, roundStep: 0.01 },
  damage_reflect: { family: "extraExotic", level1Max: 1, level100Max: 100, roundStep: 0.01 },
  damage_reduction: { family: "extraExotic", level1Max: 1, level100Max: 100, roundStep: 0.01 },
  armor_regen: { family: "extraExotic", level1Max: 1, level100Max: 100, roundStep: 1 },
};

export function clampModRequiredLevel(level: number) {
  return Math.min(MOD_REQUIRED_LEVEL_MAX, Math.max(MOD_REQUIRED_LEVEL_MIN, level));
}

function roundBudget(value: number) {
  return Math.round(value * 100) / 100;
}

function roundToStep(value: number, step = 0.1) {
  if (!Number.isFinite(value) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function scaleBetween(minValue: number, maxValue: number, level: number) {
  const clampedLevel = clampModRequiredLevel(level);
  const t = (clampedLevel - MOD_REQUIRED_LEVEL_MIN) / (MOD_REQUIRED_LEVEL_MAX - MOD_REQUIRED_LEVEL_MIN);
  return minValue + (maxValue - minValue) * t;
}

function formatProfile(profile: number[]) {
  return profile.map((value) => value.toFixed(2)).join(" / ");
}

function sumProfile(profile: number[]) {
  return roundBudget(profile.reduce((sum, value) => sum + value, 0));
}

export function getModBaseStatMaxAtRequiredLevel(requiredLevel?: number) {
  if (requiredLevel === undefined || !Number.isFinite(requiredLevel)) return undefined;
  return roundBudget(clampModRequiredLevel(requiredLevel));
}

export function getModSlotProfiles(rarity?: number) {
  if (rarity === undefined || !Number.isFinite(rarity)) return [];
  return MOD_RARITY_SLOT_PROFILES[rarity] ?? [];
}

export function getModSupportedStatCounts(rarity?: number) {
  return Array.from(new Set(getModSlotProfiles(rarity).map((profile) => profile.length))).sort((left, right) => left - right);
}

export function getModMaxStatsForRarity(rarity?: number) {
  const supportedCounts = getModSupportedStatCounts(rarity);
  if (!supportedCounts.length) return MOD_MAX_STATS;
  return Math.max(...supportedCounts);
}

export function getModRarityCapacityMultiplier(rarity?: number) {
  const profiles = getModSlotProfiles(rarity);
  if (!profiles.length) return undefined;
  return Math.max(...profiles.map((profile) => sumProfile(profile)));
}

export function getModSlotProfile(rarity?: number, statCount?: number) {
  if (!statCount) return undefined;
  const profiles = getModSlotProfiles(rarity);
  const exact = profiles.find((profile) => profile.length === statCount);
  if (exact) return exact;

  const partialCandidates = profiles
    .filter((profile) => profile.length >= statCount)
    .map((profile) => profile.slice(0, statCount));

  if (!partialCandidates.length) return undefined;

  return partialCandidates.sort((left, right) => sumProfile(right) - sumProfile(left))[0];
}

export function getModStatBudgetConfig(key: string) {
  return MOD_STAT_BUDGET_CONFIG[key];
}

export function getModStatMaxAtRequiredLevel(key: string, requiredLevel?: number) {
  const config = getModStatBudgetConfig(key);
  if (!config || requiredLevel === undefined || !Number.isFinite(requiredLevel)) return undefined;
  return roundBudget(scaleBetween(config.level1Max, config.level100Max, requiredLevel));
}

export function getModAbilityBaseSlotCost(id?: string) {
  const normalizedId = id?.trim();
  if (!normalizedId) return MOD_BASE_ABILITY_SLOT_COST;
  return MOD_ABILITY_BUDGET_COST_OVERRIDES[normalizedId] ?? MOD_BASE_ABILITY_SLOT_COST;
}

export function calculateModBudgetSummary(input: {
  requiredLevel?: number;
  rarity?: number;
  stats: ModBudgetStatInput[];
  abilities: ModBudgetAbilityInput[];
}): ModBudgetSummary {
  const requiredLevel =
    input.requiredLevel !== undefined && Number.isFinite(input.requiredLevel)
      ? clampModRequiredLevel(input.requiredLevel)
      : undefined;
  const baseStatMax = getModBaseStatMaxAtRequiredLevel(requiredLevel);
  const supportedStatCounts = getModSupportedStatCounts(input.rarity);
  const rarityCapacityMultiplier = getModRarityCapacityMultiplier(input.rarity);
  const statRows = input.stats.map((entry, index) => ({ key: entry.key.trim(), value: entry.value, index }));
  const keyedStats = statRows.filter((entry) => entry.key);
  const activeStatCount = statRows.length;
  const slotProfile = getModSlotProfile(input.rarity, activeStatCount);
  const slotProfileLabel = slotProfile ? formatProfile(slotProfile) : undefined;
  const slotProfileTotal = slotProfile ? sumProfile(slotProfile) : undefined;

  const abilities = input.abilities.map<ModBudgetAbilityResult>((entry) => {
    const id = entry.id?.trim() ?? "";
    const baseSlotCost = getModAbilityBaseSlotCost(id);
    const extraSlotCost =
      entry.budgetCost !== undefined && Number.isFinite(entry.budgetCost) ? entry.budgetCost : 0;
    const slotCost = roundBudget(baseSlotCost + extraSlotCost);
    const baseBudgetCost = baseStatMax !== undefined ? roundBudget(baseStatMax * baseSlotCost) : 0;
    const extraBudgetCost = baseStatMax !== undefined ? roundBudget(baseStatMax * extraSlotCost) : 0;
    const budgetCost = roundBudget(baseBudgetCost + extraBudgetCost);

    return {
      id,
      baseSlotCost,
      extraSlotCost,
      slotCost,
      baseBudgetCost,
      extraBudgetCost,
      budgetCost,
      powerScore: budgetCost,
      budgetSpent: budgetCost,
    };
  });

  const abilitySlotCostTotal = roundBudget(abilities.reduce((sum, ability) => sum + ability.slotCost, 0));
  const statCapacityRemainingMultiplier =
    rarityCapacityMultiplier !== undefined ? roundBudget(Math.max(0, rarityCapacityMultiplier - abilitySlotCostTotal)) : undefined;
  const statScale =
    slotProfileTotal !== undefined && statCapacityRemainingMultiplier !== undefined && slotProfileTotal > 0
      ? Math.min(1, statCapacityRemainingMultiplier / slotProfileTotal)
      : undefined;

  const statMeta = new Map<number, { slotIndex: number; slotMultiplier?: number; adjustedSlotMultiplier?: number }>();
  let slotIndex = 0;
  for (const stat of statRows) {
    const slotMultiplier = slotProfile?.[slotIndex];
    statMeta.set(stat.index, {
      slotIndex,
      slotMultiplier,
      adjustedSlotMultiplier: slotMultiplier !== undefined && statScale !== undefined ? roundBudget(slotMultiplier * statScale) : undefined,
    });
    slotIndex += 1;
  }

  const stats = input.stats.flatMap<ModBudgetStatResult>((entry, index) => {
    const key = entry.key.trim();
    const value = entry.value;
    const config = getModStatBudgetConfig(key);
    const baseMaxAtLevel = getModStatMaxAtRequiredLevel(key, requiredLevel);
    const meta = statMeta.get(index);
    if (!key || !config || baseMaxAtLevel === undefined || !meta) {
      return [];
    }

    const numericValue = value !== undefined && Number.isFinite(value) ? value : 0;
    const effectiveMaxValue =
      meta.adjustedSlotMultiplier !== undefined
        ? roundToStep(baseMaxAtLevel * meta.adjustedSlotMultiplier, config.roundStep ?? 0.1)
        : undefined;
    const normalizedUsage = baseMaxAtLevel > 0 ? roundBudget(numericValue / baseMaxAtLevel) : 0;
    const powerScore = baseStatMax !== undefined ? roundBudget(baseStatMax * normalizedUsage) : roundBudget(numericValue);

    return [
      {
        key,
        value: numericValue,
        family: config.family,
        baseMaxAtLevel,
        slotIndex: meta.slotIndex,
        slotMultiplier: meta.slotMultiplier,
        adjustedSlotMultiplier: meta.adjustedSlotMultiplier,
        effectiveMaxValue,
        currentMaxValue: undefined,
        normalizedUsage,
        powerScore,
        budgetSpent: powerScore,
      },
    ];
  });

  const totalStatBudget = roundBudget(stats.reduce((sum, entry) => sum + entry.powerScore, 0));
  const totalAbilityBudget = roundBudget(abilities.reduce((sum, entry) => sum + entry.powerScore, 0));
  const totalBudgetSpent = roundBudget(totalStatBudget + totalAbilityBudget);
  const targetScore =
    baseStatMax !== undefined && rarityCapacityMultiplier !== undefined
      ? roundBudget(baseStatMax * rarityCapacityMultiplier)
      : undefined;
  const budgetRemaining = targetScore !== undefined ? roundBudget(targetScore - totalBudgetSpent) : undefined;
  const itemLevel =
    requiredLevel !== undefined && input.rarity !== undefined && Number.isFinite(input.rarity)
      ? Math.round(
          requiredLevel +
            (MOD_RARITY_ITEM_LEVEL_BASE[input.rarity] ?? 0) +
            totalStatBudget +
            input.abilities.filter((ability) => ability.id?.trim()).length * 10,
        )
      : undefined;
  const statBudgetCap = targetScore !== undefined ? roundBudget(Math.max(0, targetScore - totalAbilityBudget)) : undefined;
  const statsWithCurrentMax = stats.map((stat) => {
    const config = getModStatBudgetConfig(stat.key);
    if (!config || statBudgetCap === undefined || baseStatMax === undefined || baseStatMax <= 0) {
      return stat;
    }

    const remainingBudgetForThisStat = roundBudget(Math.max(0, statBudgetCap - (totalStatBudget - stat.powerScore)));
    const currentMaxValue = roundToStep((stat.baseMaxAtLevel * remainingBudgetForThisStat) / baseStatMax, config.roundStep ?? 0.1);

    return {
      ...stat,
      currentMaxValue,
    };
  });

  return {
    requiredLevel,
    rarity: input.rarity,
    baseStatMax,
    supportedStatCounts,
    activeStatCount,
    slotProfile,
    slotProfileLabel,
    slotProfileTotal,
    rarityCapacityMultiplier,
    abilitySlotCostTotal,
    statCapacityRemainingMultiplier,
    targetScore,
    budgetCap: targetScore ?? 0,
    totalStatBudget,
    totalAbilityBudget,
    totalBudgetSpent,
    budgetRemaining,
    itemLevel,
    isOverBudget: targetScore !== undefined ? totalBudgetSpent > targetScore : false,
    stats: statsWithCurrentMax,
    abilities,
  };
}
