import { MOD_STAT_BUDGET_CONFIG } from "@lib/mod-budget";

export const RARITY_COLOR: Record<number, string> = {
  0: "#FFFFFF",
  1: "#3CB371",
  2: "#6495ED",
  3: "#663399",
  4: "#FFD700"
};

export const RARITY_LABEL: Record<number, string> = {
  0: "Common",
  1: "Uncommon",
  2: "Rare",
  3: "Epic",
  4: "Legendary"
};

export const MOD_SLOT_OPTIONS = [
  "Armor",
  "Engine",
  "Sensor",
  "Shield",
  "Utility",
  "Weapon"
] as const;

export const CLASS_RESTRICTION_OPTIONS = [
  "None",
  "Soldier",
  "Entrepreneur",
  "Scout",
  "Engineer",
  "Miner"
] as const;

export const ALL_STATS: string[] = Object.keys(MOD_STAT_BUDGET_CONFIG);
