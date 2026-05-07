export type JsonObject = Record<string, unknown>;

export type GeneratedAreaStageCatalogEntry = {
  id: string;
  name: string;
  shape: string;
  width: number | null;
  height: number | null;
};

export type GeneratedAreaMobCatalogEntry = {
  id: string;
  name: string;
  faction: string;
  level: number | null;
};

export type GeneratedAreaMissionArtifact = {
  id: string;
  title: string;
  fileName: string;
  data: JsonObject;
};

export type GeneratedAreaArtifacts = {
  zone: JsonObject | null;
  contacts: Record<string, JsonObject>;
  mobs: JsonObject[];
  missions: GeneratedAreaMissionArtifact[];
};

export type GeneratedAreaEntry = {
  id: string;
  name: string;
  archetype: string;
  status: string;
  request: JsonObject;
  staged: GeneratedAreaArtifacts;
  core: GeneratedAreaArtifacts;
  hasStagedContent: boolean;
  hasCoreContent: boolean;
};

export type GeneratedAreasSummary = {
  requestCount: number;
  draftCount: number;
  approvedCount: number;
  promotedCount: number;
  stagedAreaCount: number;
  coreAreaCount: number;
};

export type GeneratedAreasWorkspace = {
  ok: true;
  sourceRoot: string;
  generatedAt: string;
  paths: Record<string, string>;
  entries: GeneratedAreaEntry[];
  stageCatalog: GeneratedAreaStageCatalogEntry[];
  mobCatalog: GeneratedAreaMobCatalogEntry[];
  summary: GeneratedAreasSummary;
  warnings: string[];
};
