export type MissionParseStrategy = "strict" | "json5" | "repaired" | "failed";

export interface ImportedMissionFile {
  relativePath: string;
  folderPath: string;
  folderName: string;
  folderSlug: string;
  fileName: string;
  strictJsonValid: boolean;
  parseStrategy: MissionParseStrategy;
  warnings: string[];
  errors: string[];
  missionId: string | null;
}

export interface NormalizedMissionObjective {
  key: string;
  index: number;
  type: string;
  count: number | null;
  objective: string | null;
  description: string | null;
  targetIds: string[];
  raw: Record<string, unknown>;
}

export interface NormalizedMissionStep {
  key: string;
  index: number;
  title: string | null;
  description: string | null;
  mode: string | null;
  objectives: NormalizedMissionObjective[];
  raw: Record<string, unknown>;
}

export interface MissionRewardEntrySummary {
  id: string;
  kind: "mod" | "item" | "unknown";
  name: string | null;
  icon: string | null;
}

export interface MissionRewardSummary {
  credits: number | null;
  xp: number | null;
  modIds: string[];
  itemIds: string[];
  rewards: MissionRewardEntrySummary[];
}

export interface NormalizedMission {
  key: string;
  id: string;
  title: string;
  level: number | null;
  image: string | null;
  giverId: string | null;
  turnInTo: string | null;
  class: string | null;
  classLabel: string;
  faction: string | null;
  arcsRaw: unknown;
  tagsRaw: unknown;
  arcs: string[];
  tags: string[];
  repeatable: boolean;
  prerequisites: string[];
  prerequisiteIds: string[];
  hasPrerequisites: boolean;
  steps: NormalizedMissionStep[];
  conversations: unknown[];
  rewardsRaw: unknown;
  rewards: MissionRewardSummary;
  description: string | null;
  descriptionComplete: string | null;
  folderPath: string;
  folderName: string;
  folderSlug: string;
  relativePath: string;
  fileName: string;
  primaryMode: string | null;
  objectiveCount: number;
  objectiveTypes: string[];
  prerequisiteCount: number;
  hasConversations: boolean;
  derivedCategory: string | null;
  importWarnings: string[];
  strictJsonValid: boolean;
  parseStrategy: Exclude<MissionParseStrategy, "failed">;
  raw: Record<string, unknown>;
}

export interface MissionGraphNode {
  id: string;
  missionKey: string;
  missionId: string;
  title: string;
  level: number | null;
  primaryMode: string | null;
  classLabel: string;
  faction: string | null;
  folderName: string;
  derivedCategory: string | null;
  objectiveCount: number;
  prerequisiteCount: number;
  objectiveTypes: string[];
  objectivePreview: string[];
  rewardSummary: MissionRewardSummary;
  additionalSteps: number;
  hasConversations: boolean;
  repeatable: boolean;
  hasPrerequisites: boolean;
}

export interface MissionGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceMissionKey: string;
  targetMissionKey: string;
  sourceMissionId: string;
  targetMissionId: string;
  kind: "prerequisite";
}

export interface MissionDuplicateIdIssue {
  missionId: string;
  missionKeys: string[];
  relativePaths: string[];
}

export interface MissionMissingPrerequisiteIssue {
  missionKey: string;
  missionId: string;
  missingId: string;
  relativePath: string;
}

export interface MissionPlaceholderIssue {
  missionKey: string;
  missionId: string;
  relativePath: string;
  field: "arcs" | "tags";
  values: string[];
}

export interface MissionGraphCycle {
  missionKeys: string[];
  missionIds: string[];
}

export interface MissionImportDiagnostics {
  files: ImportedMissionFile[];
  successfulFiles: ImportedMissionFile[];
  warningFiles: ImportedMissionFile[];
  failedFiles: ImportedMissionFile[];
  strictJsonInvalidFiles: ImportedMissionFile[];
  duplicateMissionIds: MissionDuplicateIdIssue[];
  missingPrerequisiteTargets: MissionMissingPrerequisiteIssue[];
  placeholderValues: MissionPlaceholderIssue[];
  cycles: MissionGraphCycle[];
  warningsCount: number;
  errorsCount: number;
  ignoredEntries: string[];
}

export type MissionSortKey =
  | "title"
  | "id"
  | "level"
  | "folder"
  | "faction"
  | "mode"
  | "objectiveCount"
  | "prerequisiteCount";

export type MissionBooleanFilter = "all" | "yes" | "no";

export interface MissionFilterState {
  search: string;
  folders: string[];
  categories: string[];
  arcs: string[];
  tags: string[];
  factions: string[];
  classes: string[];
  modes: string[];
  objectiveTypes: string[];
  levelMin: string;
  levelMax: string;
  hasPrerequisites: MissionBooleanFilter;
  repeatable: MissionBooleanFilter;
  sortBy: MissionSortKey;
  sortDirection: "asc" | "desc";
  selectedMissionKey: string | null;
  focusedMissionKey: string | null;
}

export interface MissionFilterOptions {
  folders: string[];
  categories: string[];
  arcs: string[];
  tags: string[];
  factions: string[];
  classes: string[];
  modes: string[];
  objectiveTypes: string[];
  minLevel: number | null;
  maxLevel: number | null;
}

export interface MissionImportSummary {
  totalMissions: number;
  totalFolders: number;
  totalPrerequisiteEdges: number;
  parseWarnings: number;
  parseErrors: number;
  importedAt: string;
  sourceType: "zip" | "folder";
  sourceLabel: string | null;
}

export interface MissionLabWorkspace {
  sessionId: string;
  summary: MissionImportSummary | null;
  missions: NormalizedMission[];
  graphNodes: MissionGraphNode[];
  graphEdges: MissionGraphEdge[];
  diagnostics: MissionImportDiagnostics;
  filters: MissionFilterState;
}

export interface MissionRewardLookupResult {
  id: string;
  kind: "mod" | "item" | "unknown";
  name: string | null;
  icon: string | null;
}

export interface MissionUploadFile {
  relativePath: string;
  fileName: string;
  text: string;
}

export interface MissionUploadSource {
  kind: "zip" | "folder";
  label: string | null;
  files: MissionUploadFile[];
}
