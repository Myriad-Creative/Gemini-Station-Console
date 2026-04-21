export type MobLabSourceShape = "array" | "record";
export type MobLabSourceType = "uploaded" | "pasted" | "blank";
export type MobLabParseStrategy = "strict" | "json5";
export type MobSortKey = "display_name" | "id" | "level" | "faction" | "ai_type";
export type ValidationLevel = "error" | "warning";

export interface ScanTierDraft {
  key: string;
  threshold: string;
  text: string;
}

export interface MobDraft {
  key: string;
  sourceIndex: number;
  id: string;
  display_name: string;
  meta_description: string;
  scene: string;
  sprite: string;
  faction: string;
  level: string;
  stat_rank: string;
  ai_type: string;
  abilities: string[];
  stats: Record<string, string>;
  can_attack: boolean;
  comms_directory: string[];
  hail_can_hail_target: boolean;
  hail_greeting: string;
  hail_image: string;
  hail_name: string;
  hail_portrait: string;
  is_vendor: boolean;
  item_drop_chance: string;
  item_loot_table: string;
  item_no_duplicates: boolean;
  max_mod_rarity: string;
  merchant_profile: string;
  min_mod_rarity: string;
  mob_end: string;
  mob_tag: string;
  mod_drop_chance: string;
  mod_loot_table: string;
  mod_no_duplicates: boolean;
  poi_require_discovery: boolean;
  poi_show: boolean;
  repair_cost: string;
  scan_faction: string;
  scan_class: string;
  scan_notes: string;
  scan_tiers: ScanTierDraft[];
  scan_extra_json: string;
  services: string[];
  extra_json: string;
}

export interface MobLabWorkspace {
  sourceType: MobLabSourceType;
  sourceLabel: string | null;
  sourceShape: MobLabSourceShape;
  parseStrategy: MobLabParseStrategy;
  strictJsonValid: boolean;
  importedAt: string;
  mobs: MobDraft[];
}

export interface MobLabImportResult {
  workspace: MobLabWorkspace;
  warnings: string[];
}

export interface MobValidationIssue {
  level: ValidationLevel;
  mobKey: string;
  field: string;
  message: string;
}

export interface MobLabSummary {
  totalMobs: number;
  factionCount: number;
  aiTypeCount: number;
  duplicateIdCount: number;
  errorCount: number;
}
