export type ZoneManagerSourceType = "shared" | "blank";
export type ZoneValidationLevel = "error" | "warning";

export type ZoneStagePlacementDraft = {
  key: string;
  stageId: string;
  posX: string;
  posY: string;
  extraJson: string;
};

export type ZoneMobSpawnDraft = {
  key: string;
  mobId: string;
  count: string;
  radius: string;
  spawnAreaShape: string;
  spawnAreaPointsJson: string;
  respawnDelay: string;
  posX: string;
  posY: string;
  angleDeg: string;
  levelMin: string;
  levelMax: string;
  rank: string;
  extraJson: string;
};

export type ZoneDraft = {
  key: string;
  id: string;
  name: string;
  active: boolean;
  showHudOnEnter: boolean;
  poiMap: boolean;
  poiHidden: boolean;
  poiLabel: string;
  sectorX: string;
  sectorY: string;
  posX: string;
  posY: string;
  activationRadius: string;
  activationRadiusBorder: boolean;
  boundsShape: string;
  boundsWidth: string;
  boundsHeight: string;
  boundsPointsJson: string;
  boundsExtraJson: string;
  stages: ZoneStagePlacementDraft[];
  mobs: ZoneMobSpawnDraft[];
  extraJson: string;
};

export type ZonesManagerWorkspace = {
  sourceType: ZoneManagerSourceType;
  sourceLabel: string | null;
  parseWarnings: string[];
  zones: ZoneDraft[];
};

export type ZoneValidationIssue = {
  level: ZoneValidationLevel;
  zoneKey: string;
  field: string;
  message: string;
};

export type ZonesManagerSummary = {
  totalZones: number;
  activeZones: number;
  poiZones: number;
  totalStagePlacements: number;
  totalMobPlacements: number;
  errorCount: number;
  warningCount: number;
};
