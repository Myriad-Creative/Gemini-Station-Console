export type ModStatFamily = "general" | "exotic" | "extraExotic";

export interface ModBenchmarkCurveConfig {
  minValue: number;
  maxValue: number;
  exponent: number;
}

export interface ModRollQualityRange {
  min: number;
  max: number;
}

export interface ModStatBudgetConfig {
  family: ModStatFamily;
  defaultDraftValue: number;
  level1Max: number;
  level100Max: number;
  weight: number;
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
  weight: number;
  familyTaxMultiplier: number;
  effectiveWeight: number;
  maxAtLevel: number;
  slotIndex: number;
  slotMultiplier?: number;
  suggestedValue?: number;
  powerScore: number;
  budgetSpent: number;
}

export interface ModBudgetAbilityResult {
  id: string;
  baseBudgetCost: number;
  extraBudgetCost: number;
  budgetCost: number;
  powerScore: number;
  budgetSpent: number;
}

export interface ModBudgetSummary {
  requiredLevel?: number;
  rarity?: number;
  baseValue?: number;
  rollQuality?: number;
  rollQualityRange?: ModRollQualityRange;
  supportedStatCounts: number[];
  activeStatCount: number;
  slotProfile?: number[];
  slotProfileLabel?: string;
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
export const MOD_BASE_ABILITY_BUDGET_COST = 10;
export const MOD_ABILITY_BUDGET_COST_OVERRIDES: Record<string, number> = {};

export const MOD_BENCHMARK_CURVE: ModBenchmarkCurveConfig = {
  minValue: 1,
  maxValue: 100,
  exponent: 1.1,
};

export const MOD_RARITY_SLOT_PROFILES: Record<number, number[][]> = {
  0: [[1.0]],
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

export const MOD_RARITY_ROLL_QUALITY_RANGES: Record<number, ModRollQualityRange> = {
  0: { min: 0.9, max: 1.0 },
  1: { min: 0.95, max: 1.03 },
  2: { min: 0.98, max: 1.06 },
  3: { min: 1.0, max: 1.1 },
  4: { min: 1.03, max: 1.15 },
};

export const MOD_FAMILY_TAX_MULTIPLIERS = [1.0, 1.15, 1.3, 1.45, 1.6] as const;

// Placeholder balance table until the exact live tuning table is available.
// Assumption for this first pass:
// - most stats scale from 1 at level 1 to 100 at level 100
// - armor and shields scale from 10 at level 1 to 1000 at level 100
export const MOD_STAT_BUDGET_CONFIG: Record<string, ModStatBudgetConfig> = {
  armor: { family: "general", defaultDraftValue: 100.0, level1Max: 10, level100Max: 1000, weight: 0.1, roundStep: 1 },
  shields: { family: "general", defaultDraftValue: 100.0, level1Max: 10, level100Max: 1000, weight: 0.1, roundStep: 1 },
  power: { family: "general", defaultDraftValue: 20.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  evasion: { family: "general", defaultDraftValue: 5.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  targeting: { family: "general", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  hacking: { family: "general", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  sensors: { family: "general", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  salvage_bonus: { family: "general", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  speed: { family: "general", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.0, roundStep: 0.1 },
  energy_regen_rate: { family: "exotic", defaultDraftValue: 5.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  shield_regen: { family: "exotic", defaultDraftValue: 1.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  threat_generation: { family: "exotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  stealth: { family: "exotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  heat_resistance: { family: "exotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  overclock: { family: "exotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.35, roundStep: 0.1 },
  damage_reflect: { family: "extraExotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.75, roundStep: 0.1 },
  damage_reduction: { family: "extraExotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.75, roundStep: 0.1 },
  armor_regen: { family: "extraExotic", defaultDraftValue: 0.0, level1Max: 1, level100Max: 100, weight: 1.75, roundStep: 0.1 },
};

export function clampModRequiredLevel(level: number) {
  return Math.min(MOD_REQUIRED_LEVEL_MAX, Math.max(MOD_REQUIRED_LEVEL_MIN, level));
}

function roundBudget(value: number) {
  return Math.round(value * 100) / 100;
}

function scaleBetween(minValue: number, maxValue: number, level: number, exponent = MOD_BENCHMARK_CURVE.exponent) {
  const clampedLevel = clampModRequiredLevel(level);
  const t = (clampedLevel - MOD_REQUIRED_LEVEL_MIN) / (MOD_REQUIRED_LEVEL_MAX - MOD_REQUIRED_LEVEL_MIN);
  return minValue + (maxValue - minValue) * t ** exponent;
}

function roundToStep(value: number, step = 0.1) {
  if (!Number.isFinite(value) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function formatProfile(profile: number[]) {
  return profile.map((value) => value.toFixed(2)).join(" / ");
}

export function getModBenchmarkValueAtRequiredLevel(requiredLevel?: number) {
  if (requiredLevel === undefined || !Number.isFinite(requiredLevel)) return undefined;
  return roundBudget(scaleBetween(MOD_BENCHMARK_CURVE.minValue, MOD_BENCHMARK_CURVE.maxValue, requiredLevel));
}

export function getModRarityRollQualityRange(rarity?: number) {
  if (rarity === undefined || !Number.isFinite(rarity)) return undefined;
  return MOD_RARITY_ROLL_QUALITY_RANGES[rarity];
}

export function getModRarityRollQuality(rarity?: number) {
  const range = getModRarityRollQualityRange(rarity);
  if (!range) return undefined;
  return roundBudget((range.min + range.max) / 2);
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

export function getModSlotProfile(rarity?: number, statCount?: number) {
  if (!statCount) return undefined;
  return getModSlotProfiles(rarity).find((profile) => profile.length === statCount);
}

export function getModStatBudgetConfig(key: string) {
  return MOD_STAT_BUDGET_CONFIG[key];
}

export function getModStatMaxAtRequiredLevel(key: string, requiredLevel?: number) {
  const config = getModStatBudgetConfig(key);
  if (!config || requiredLevel === undefined || !Number.isFinite(requiredLevel)) return undefined;
  return roundBudget(scaleBetween(config.level1Max, config.level100Max, requiredLevel));
}

export function getModAbilityBaseBudgetCost(id?: string) {
  const normalizedId = id?.trim();
  if (!normalizedId) return 0;
  return MOD_ABILITY_BUDGET_COST_OVERRIDES[normalizedId] ?? MOD_BASE_ABILITY_BUDGET_COST;
}

export function getModFamilyTaxMultiplier(familyIndex: number) {
  if (familyIndex < MOD_FAMILY_TAX_MULTIPLIERS.length) return MOD_FAMILY_TAX_MULTIPLIERS[familyIndex];
  const lastValue = MOD_FAMILY_TAX_MULTIPLIERS[MOD_FAMILY_TAX_MULTIPLIERS.length - 1];
  return roundBudget(lastValue + 0.15 * (familyIndex - (MOD_FAMILY_TAX_MULTIPLIERS.length - 1)));
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
  const baseValue = getModBenchmarkValueAtRequiredLevel(requiredLevel);
  const rollQuality = getModRarityRollQuality(input.rarity);
  const rollQualityRange = getModRarityRollQualityRange(input.rarity);
  const supportedStatCounts = getModSupportedStatCounts(input.rarity);
  const keyedStats = input.stats
    .map((entry, index) => ({ key: entry.key.trim(), value: entry.value, index }))
    .filter((entry) => entry.key);
  const activeStatCount = keyedStats.length;
  const slotProfile = getModSlotProfile(input.rarity, activeStatCount);
  const slotProfileLabel = slotProfile ? formatProfile(slotProfile) : undefined;
  const targetScore =
    baseValue !== undefined && rollQuality !== undefined && slotProfile
      ? roundBudget(baseValue * rollQuality * slotProfile.reduce((sum, value) => sum + value, 0))
      : undefined;

  const familyCounts = new Map<ModStatFamily, number>();
  const statMeta = new Map<number, { slotIndex: number; slotMultiplier?: number; familyTaxMultiplier: number }>();
  let slotIndex = 0;
  for (const stat of keyedStats) {
    const config = getModStatBudgetConfig(stat.key);
    const familyIndex = config ? (familyCounts.get(config.family) ?? 0) : 0;
    if (config) {
      familyCounts.set(config.family, familyIndex + 1);
    }
    statMeta.set(stat.index, {
      slotIndex,
      slotMultiplier: slotProfile?.[slotIndex],
      familyTaxMultiplier: getModFamilyTaxMultiplier(familyIndex),
    });
    slotIndex += 1;
  }

  const stats = input.stats.flatMap<ModBudgetStatResult>((entry, index) => {
    const key = entry.key.trim();
    const value = entry.value;
    const config = getModStatBudgetConfig(key);
    const maxAtLevel = getModStatMaxAtRequiredLevel(key, requiredLevel);
    const meta = statMeta.get(index);
    if (!key || value === undefined || !Number.isFinite(value) || !config || maxAtLevel === undefined || !meta) {
      return [];
    }

    const effectiveWeight = roundBudget(config.weight * meta.familyTaxMultiplier);
    const suggestedValue =
      baseValue !== undefined && rollQuality !== undefined && meta.slotMultiplier !== undefined
        ? Math.min(
            maxAtLevel,
            roundToStep((baseValue * meta.slotMultiplier * rollQuality) / effectiveWeight, config.roundStep ?? 0.1),
          )
        : undefined;
    const powerScore = roundBudget(value * effectiveWeight);

    return [
      {
        key,
        value,
        family: config.family,
        weight: config.weight,
        familyTaxMultiplier: meta.familyTaxMultiplier,
        effectiveWeight,
        maxAtLevel,
        slotIndex: meta.slotIndex,
        slotMultiplier: meta.slotMultiplier,
        suggestedValue,
        powerScore,
        budgetSpent: powerScore,
      },
    ];
  });

  const abilities = input.abilities.flatMap<ModBudgetAbilityResult>((entry) => {
    const id = entry.id?.trim() ?? "";
    if (!id) return [];

    const baseBudgetCost = getModAbilityBaseBudgetCost(id);
    const extraBudgetCost =
      entry.budgetCost !== undefined && Number.isFinite(entry.budgetCost) ? entry.budgetCost : 0;
    const powerScore = roundBudget(baseBudgetCost + extraBudgetCost);

    return [
      {
        id,
        baseBudgetCost,
        extraBudgetCost,
        budgetCost: powerScore,
        powerScore,
        budgetSpent: powerScore,
      },
    ];
  });

  const totalStatBudget = roundBudget(stats.reduce((sum, entry) => sum + entry.powerScore, 0));
  const totalAbilityBudget = roundBudget(abilities.reduce((sum, entry) => sum + entry.powerScore, 0));
  const totalBudgetSpent = roundBudget(totalStatBudget + totalAbilityBudget);
  const budgetRemaining = targetScore !== undefined ? roundBudget(targetScore - totalBudgetSpent) : undefined;
  const itemLevel = requiredLevel !== undefined ? Math.round(totalBudgetSpent) : undefined;

  return {
    requiredLevel,
    rarity: input.rarity,
    baseValue,
    rollQuality,
    rollQualityRange,
    supportedStatCounts,
    activeStatCount,
    slotProfile,
    slotProfileLabel,
    targetScore,
    budgetCap: targetScore ?? 0,
    totalStatBudget,
    totalAbilityBudget,
    totalBudgetSpent,
    budgetRemaining,
    itemLevel,
    isOverBudget: targetScore !== undefined ? totalBudgetSpent > targetScore : false,
    stats,
    abilities,
  };
}
