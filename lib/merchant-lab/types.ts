export type MerchantLabSourceType = "uploaded" | "pasted" | "blank";
export type MerchantLabSourceShape = "array" | "record";
export type MerchantLabParseStrategy = "strict" | "loose";
export type MerchantCatalogMode = "items" | "mods";
export type ValidationLevel = "error" | "warning";

export interface MerchantProfileDraft {
  key: string;
  sourceIndex: number;
  id: string;
  name: string;
  description: string;
  items: string[];
  mods: string[];
  extra_json: string;
}

export interface MerchantLabWorkspace {
  sourceType: MerchantLabSourceType;
  sourceLabel: string | null;
  sourceShape: MerchantLabSourceShape;
  parseStrategy: MerchantLabParseStrategy;
  strictJsonValid: boolean;
  importedAt: string;
  profiles: MerchantProfileDraft[];
}

export interface MerchantLabImportResult {
  workspace: MerchantLabWorkspace;
  warnings: string[];
}

export interface MerchantProfileValidationIssue {
  level: ValidationLevel;
  profileKey: string;
  field: string;
  message: string;
}

export interface MerchantLabSummary {
  totalProfiles: number;
  totalItemRefs: number;
  totalModRefs: number;
  duplicateIdCount: number;
  errorCount: number;
  warningCount: number;
}
