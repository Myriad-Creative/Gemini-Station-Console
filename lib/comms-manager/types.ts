export type CommsLabSourceType = "uploaded" | "pasted" | "blank";
export type CommsLabParseStrategy = "strict" | "loose";
export type ValidationLevel = "error" | "warning";

export interface CommsContactDraft {
  key: string;
  sourceIndex: number;
  id: string;
  name: string;
  portrait: string;
  greeting: string;
  dialog: string[];
  notes: string;
}

export interface CommsLabWorkspace {
  sourceType: CommsLabSourceType;
  sourceLabel: string | null;
  parseStrategy: CommsLabParseStrategy;
  strictJsonValid: boolean;
  importedAt: string;
  contacts: CommsContactDraft[];
}

export interface CommsLabImportResult {
  workspace: CommsLabWorkspace;
  warnings: string[];
}

export interface CommsContactValidationIssue {
  level: ValidationLevel;
  contactKey: string;
  field: string;
  message: string;
}

export interface CommsLabSummary {
  totalContacts: number;
  dialogLineCount: number;
  notedContacts: number;
  duplicateIdCount: number;
  errorCount: number;
  warningCount: number;
}
