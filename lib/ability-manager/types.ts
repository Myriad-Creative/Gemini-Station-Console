export type AbilityLinkSource = "json" | "script_constant" | "script_fallback";

export type AbilityDeliveryType = "projectile" | "beam" | "mine" | "blast" | "status" | "utility";

export type AbilityManagerStatusEffectOption = {
  numericId: number;
  effectId: string;
  name: string;
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
  name: string;
  description: string;
  icon: string;
  cooldown: string;
  energyCost: string;
  attackRange: string;
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
  flatModifiersJson: string;
  percentModifiersJson: string;
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
  diagnostics: AbilityManagerDiagnostic[];
};

export type AbilityManagerSummary = {
  totalAbilities: number;
  totalStatusEffects: number;
  projectileCount: number;
  beamCount: number;
  linkedAbilityCount: number;
  warningCount: number;
  errorCount: number;
};
