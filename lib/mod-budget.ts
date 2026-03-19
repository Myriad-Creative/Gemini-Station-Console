export type ModStatFamily = "general" | "exotic" | "extraExotic";

export interface ModStatBudgetConfig {
  family: ModStatFamily;
  defaultDraftValue: number;
  level100Max: number;
  statSpecificModifier?: number;
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
  familyMultiplier: number;
  statSpecificModifier: number;
  maxAtLevel: number;
  normalizedRoll: number;
  budgetSpent: number;
}

export interface ModBudgetAbilityResult {
  id: string;
  baseBudgetCost: number;
  extraBudgetCost: number;
  budgetCost: number;
  budgetSpent: number;
}

export interface ModBudgetSummary {
  requiredLevel?: number;
  rarity?: number;
  budgetCap: number;
  totalStatBudget: number;
  totalAbilityBudget: number;
  totalBudgetSpent: number;
  budgetRemaining: number;
  itemLevel?: number;
  isOverBudget: boolean;
  stats: ModBudgetStatResult[];
  abilities: ModBudgetAbilityResult[];
}

export const MOD_REQUIRED_LEVEL_MIN = 1;
export const MOD_REQUIRED_LEVEL_MAX = 100;
export const MOD_MAX_STATS = 4;
export const MOD_MAX_ABILITIES = 2;
export const MOD_BASE_ABILITY_BUDGET_COST = 10;
export const MOD_ABILITY_BUDGET_COST_OVERRIDES: Record<string, number> = {};

export const MOD_RARITY_BUDGET_CAPS: Record<number, number> = {
  0: 100,
  1: 125,
  2: 150,
  3: 175,
  4: 200,
};

export const MOD_STAT_FAMILY_MULTIPLIERS: Record<ModStatFamily, number> = {
  general: 1.0,
  exotic: 1.35,
  extraExotic: 1.75,
};

// Placeholder per-level maxima until the exact game tuning table is available.
// Centralizing these values keeps the budget system tunable without touching the UI.
export const MOD_STAT_BUDGET_CONFIG: Record<string, ModStatBudgetConfig> = {
  armor: { family: "general", defaultDraftValue: 100.0, level100Max: 100.0 },
  shields: { family: "general", defaultDraftValue: 100.0, level100Max: 100.0 },
  power: { family: "general", defaultDraftValue: 20.0, level100Max: 20.0 },
  evasion: { family: "general", defaultDraftValue: 5.0, level100Max: 5.0 },
  targeting: { family: "general", defaultDraftValue: 0.0, level100Max: 10.0 },
  hacking: { family: "general", defaultDraftValue: 0.0, level100Max: 10.0 },
  sensors: { family: "general", defaultDraftValue: 0.0, level100Max: 10.0 },
  salvage_bonus: { family: "general", defaultDraftValue: 0.0, level100Max: 10.0 },
  speed: { family: "general", defaultDraftValue: 0.0, level100Max: 10.0 },
  energy_regen_rate: { family: "exotic", defaultDraftValue: 5.0, level100Max: 5.0 },
  shield_regen: { family: "exotic", defaultDraftValue: 1.0, level100Max: 1.0 },
  threat_generation: { family: "exotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  stealth: { family: "exotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  heat_resistance: { family: "exotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  overclock: { family: "exotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  damage_reflect: { family: "extraExotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  damage_reduction: { family: "extraExotic", defaultDraftValue: 0.0, level100Max: 10.0 },
  armor_regen: { family: "extraExotic", defaultDraftValue: 0.0, level100Max: 5.0 },
};

export function clampModRequiredLevel(level: number) {
  return Math.min(MOD_REQUIRED_LEVEL_MAX, Math.max(MOD_REQUIRED_LEVEL_MIN, level));
}

function roundBudget(value: number) {
  return Math.round(value * 100) / 100;
}

export function getModRarityBudgetCap(rarity?: number) {
  if (rarity === undefined || !Number.isFinite(rarity)) return 0;
  return MOD_RARITY_BUDGET_CAPS[rarity] ?? 0;
}

export function getModStatBudgetConfig(key: string) {
  return MOD_STAT_BUDGET_CONFIG[key];
}

export function getModStatMaxAtRequiredLevel(key: string, requiredLevel?: number) {
  const config = getModStatBudgetConfig(key);
  if (!config || requiredLevel === undefined || !Number.isFinite(requiredLevel)) return undefined;

  const clampedLevel = clampModRequiredLevel(requiredLevel);
  return roundBudget((config.level100Max * clampedLevel) / MOD_REQUIRED_LEVEL_MAX);
}

export function getModAbilityBaseBudgetCost(id?: string) {
  const normalizedId = id?.trim();
  if (!normalizedId) return 0;
  return MOD_ABILITY_BUDGET_COST_OVERRIDES[normalizedId] ?? MOD_BASE_ABILITY_BUDGET_COST;
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
  const budgetCap = getModRarityBudgetCap(input.rarity);

  const stats = input.stats.flatMap<ModBudgetStatResult>((entry) => {
    const key = entry.key.trim();
    const value = entry.value;
    const config = getModStatBudgetConfig(key);
    const maxAtLevel = getModStatMaxAtRequiredLevel(key, requiredLevel);
    if (!key || value === undefined || !Number.isFinite(value) || !config || maxAtLevel === undefined || maxAtLevel <= 0) {
      return [];
    }

    const familyMultiplier = MOD_STAT_FAMILY_MULTIPLIERS[config.family];
    const statSpecificModifier = config.statSpecificModifier ?? 1.0;
    const normalizedRoll = value / maxAtLevel;
    const budgetSpent = roundBudget(normalizedRoll * 100 * familyMultiplier * statSpecificModifier);

    return [
      {
        key,
        value,
        family: config.family,
        familyMultiplier,
        statSpecificModifier,
        maxAtLevel,
        normalizedRoll: roundBudget(normalizedRoll),
        budgetSpent,
      },
    ];
  });

  const abilities = input.abilities.flatMap<ModBudgetAbilityResult>((entry) => {
    const id = entry.id?.trim() ?? "";
    if (!id) return [];

    const baseBudgetCost = getModAbilityBaseBudgetCost(id);
    const extraBudgetCost =
      entry.budgetCost !== undefined && Number.isFinite(entry.budgetCost) ? entry.budgetCost : 0;
    const budgetSpent = roundBudget(baseBudgetCost + extraBudgetCost);

    return [
      {
        id,
        baseBudgetCost,
        extraBudgetCost,
        budgetCost: budgetSpent,
        budgetSpent,
      },
    ];
  });

  const totalStatBudget = roundBudget(stats.reduce((sum, entry) => sum + entry.budgetSpent, 0));
  const totalAbilityBudget = roundBudget(abilities.reduce((sum, entry) => sum + entry.budgetSpent, 0));
  const totalBudgetSpent = roundBudget(totalStatBudget + totalAbilityBudget);
  const budgetRemaining = roundBudget(budgetCap - totalBudgetSpent);
  const itemLevel =
    requiredLevel !== undefined ? Math.round(requiredLevel * (totalBudgetSpent / 100.0)) : undefined;

  return {
    requiredLevel,
    rarity: input.rarity,
    budgetCap,
    totalStatBudget,
    totalAbilityBudget,
    totalBudgetSpent,
    budgetRemaining,
    itemLevel,
    isOverBudget: totalBudgetSpent > budgetCap,
    stats,
    abilities,
  };
}
