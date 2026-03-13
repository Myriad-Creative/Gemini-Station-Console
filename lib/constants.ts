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

export const MOD_STAT_DEFAULTS = [
  { key: "armor", defaultValue: "100.0" },
  { key: "shields", defaultValue: "100.0" },
  { key: "power", defaultValue: "20.0" },
  { key: "evasion", defaultValue: "5.0" },
  { key: "energy_regen_rate", defaultValue: "5.0" },
  { key: "shield_regen", defaultValue: "1.0" },
  { key: "armor_regen", defaultValue: "0.0" },
  { key: "targeting", defaultValue: "0.0" },
  { key: "threat_generation", defaultValue: "0.0" },
  { key: "hacking", defaultValue: "0.0" },
  { key: "damage_reflect", defaultValue: "0.0" },
  { key: "damage_reduction", defaultValue: "0.0" },
  { key: "stealth", defaultValue: "0.0" },
  { key: "sensors", defaultValue: "0.0" },
  { key: "salvage_bonus", defaultValue: "0.0" },
  { key: "heat_resistance", defaultValue: "0.0" },
  { key: "speed", defaultValue: "0.0" },
  { key: "overclock", defaultValue: "0.0" }
] as const;

export const ALL_STATS: string[] = MOD_STAT_DEFAULTS.map((entry) => entry.key);
