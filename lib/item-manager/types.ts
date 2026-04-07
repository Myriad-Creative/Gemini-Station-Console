export type ItemManagerSourceType = "local" | "blank";
export type ItemManagerParseStrategy = "strict" | "loose";
export type ValidationLevel = "error" | "warning";

export interface ItemDraft {
  key: string;
  sourceIndex: number;
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  type: string;
  extraJson: string;
}

export interface ItemManagerWorkspace {
  sourceType: ItemManagerSourceType;
  sourceLabel: string | null;
  parseStrategy: ItemManagerParseStrategy;
  strictJsonValid: boolean;
  importedAt: string;
  items: ItemDraft[];
}

export interface ItemManagerImportResult {
  workspace: ItemManagerWorkspace;
  warnings: string[];
}

export interface ItemValidationIssue {
  level: ValidationLevel;
  itemKey: string;
  field: string;
  message: string;
}

export interface ItemManagerSummary {
  totalItems: number;
  typedItems: number;
  duplicateIdCount: number;
  errorCount: number;
  warningCount: number;
}
