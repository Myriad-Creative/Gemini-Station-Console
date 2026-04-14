export type AbilityLinkSource = "json" | "script_constant" | "script_fallback";

export type AbilityDeliveryType = "energy" | "beam" | "projectile" | "other";

export const STATUS_EFFECT_MODIFIER_KEYS = [
  "armor",
  "armor_regen",
  "cargo_shielding",
  "cooldown_modifier",
  "crit_chance",
  "energy_regen_rate",
  "evasion",
  "hacking",
  "heat_resistance",
  "overclock",
  "power",
  "salvage_bonus",
  "scan_bonus",
  "sensors",
  "shield_regen",
  "shields",
  "speed",
  "stealth",
  "targeting",
  "threat_generation",
] as const;

export type StatusEffectModifierMap = Record<string, string>;

export type AbilityManagerStatusEffectOption = {
  numericId: number;
  effectId: string;
  name: string;
  description: string;
  linkedAbilityCount: number;
};

export type AbilityManagerModOption = {
  id: string;
  name: string;
  slot: string;
  rarity: number;
  levelRequirement: number;
  description: string;
  abilityIds: string[];
};

export type AbilityEffectLink = {
  numericId: number;
  sources: AbilityLinkSource[];
  effectId: string | null;
  effectName: string | null;
  missing: boolean;
};

export type AbilityDraft = {
  key: string;
  sourceIndex: number;
  id: string;
  fileName: string;
  script: string;
  deliveryType: "energy" | "beam" | "projectile" | "other";
  name: string;
  description: string;
  icon: string;
  threatType: string;
  threatMultiplier: string;
  validTargets: string;
  requiresTarget: boolean;
  facingRequirement: string;
  minRangeType: string;
  maxRangeType: string;
  isGcdLocked: boolean;
  cooldown: string;
  chargeTime: string;
  energyCost: string;
  applyEffectsToCaster: boolean;
  effectVfxScene: string;
  attackRange: string;
  powerPercent: string;
  baseDamage: string;
  projectileScene: string;
  appliesEffectIds: string[];
  extraPropertiesJson: string;
  extraRootJson: string;
  linkedEffects: AbilityEffectLink[];
  scriptPathResolved: string | null;
  sourcePath: string | null;
};

export type StatusEffectDraft = {
  key: string;
  sourceIndex: number;
  numericId: string;
  fileName: string;
  script: string;
  effectId: string;
  name: string;
  description: string;
  icon: string;
  effectType: string;
  duration: string;
  tickInterval: string;
  threatMultiplier: string;
  isBuff: boolean;
  isDispellable: boolean;
  canStack: boolean;
  maxStacks: string;
  showDuration: boolean;
  flatModifiers: StatusEffectModifierMap;
  percentModifiers: StatusEffectModifierMap;
  extraPropertiesJson: string;
  extraRootJson: string;
  linkedAbilityIds: string[];
  linkedAbilityNames: string[];
  sourcePath: string | null;
};

export type AbilityManagerDiagnostic = {
  level: "warning" | "error";
  message: string;
};

export type AbilityManagerValidationIssue = {
  level: "warning" | "error";
  draftKey: string;
  field: string;
  message: string;
};

export type AbilityManagerDatabase = {
  sourceLabel: string;
  loadedAt: string;
  abilities: AbilityDraft[];
  statusEffects: StatusEffectDraft[];
  mods: AbilityManagerModOption[];
  modCatalogAvailable: boolean;
  diagnostics: AbilityManagerDiagnostic[];
};

export type AbilityManagerSummary = {
  totalAbilities: number;
  totalStatusEffects: number;
  projectileCount: number;
  beamCount: number;
  linkedAbilityCount: number;
  orphanAbilityCount: number;
  orphanStatusEffectCount: number;
  warningCount: number;
  errorCount: number;
};
