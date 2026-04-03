export type DataToolSourceType = "shared" | "blank";

export type DataWorkspaceMeta = {
  sourceType: DataToolSourceType;
  sourceLabel: string | null;
  parseWarnings: string[];
};

export type MapPoiDraft = {
  key: string;
  id: string;
  name: string;
  type: string;
  map: boolean;
  sectorX: string;
  sectorY: string;
  posX: string;
  posY: string;
  extraJson: string;
};

export type MapRegionDraft = {
  key: string;
  id: string;
  name: string;
  rectX: string;
  rectY: string;
  rectW: string;
  rectH: string;
  discovered: boolean;
  extraJson: string;
};

export type TradeRouteDraft = {
  key: string;
  id: string;
  name: string;
  sectorX: string;
  sectorY: string;
  width: string;
  speedMultiplier: string;
  color: string;
  borderColor: string;
  opacity: string;
  borderPx: string;
  endpointAX: string;
  endpointAY: string;
  endpointAName: string;
  endpointBX: string;
  endpointBY: string;
  endpointBName: string;
  pointsJson: string;
  smoothingJson: string;
  sCurveJson: string;
  extraJson: string;
};

export type TutorialEntryDraft = {
  key: string;
  id: string;
  title: string;
  image: string;
  body: string;
  category: string;
  tags: string[];
  order: string;
  showOnce: boolean;
  pauseGame: boolean;
  extraJson: string;
};

export type TutorialTriggerGroupDraft = {
  key: string;
  id: string;
  infoIds: string[];
};

export type TutorialAreaTriggerDraft = {
  key: string;
  id: string;
  positionX: string;
  positionY: string;
  radius: string;
  infoIds: string[];
  once: boolean;
  extraJson: string;
};

export type ShipStatDescriptionDraft = {
  key: string;
  id: string;
  label: string;
  title: string;
  decimals: string;
  description: string;
  extraJson: string;
};

export type ZoneDraft = {
  key: string;
  id: string;
  name: string;
  active: boolean;
  showHudOnEnter: boolean;
  sectorX: string;
  sectorY: string;
  activationRadius: string;
  activationRadiusBorder: boolean;
  posX: string;
  posY: string;
  boundsJson: string;
  stagesJson: string;
  mobsJson: string;
  extraJson: string;
};

export type StageDraft = {
  key: string;
  id: string;
  shape: string;
  width: string;
  height: string;
  edgeFalloff: string;
  collision: boolean;
  zindex: string;
  scaleMin: string;
  scaleMax: string;
  gridStep: string;
  jitter: string;
  materialsJson: string;
  extraJson: string;
};

export type HazardBarrierProfileDraft = {
  key: string;
  id: string;
  baseStageProfile: string;
  statusEffectId: string;
  blockerWidthRatio: string;
  visualWidthMultiplier: string;
  visualDensityMultiplier: string;
  visualScaleMultiplier: string;
  visualAlphaMultiplier: string;
  zindex: string;
  extraJson: string;
};

export type NpcTrafficWorkspace = {
  sourceType: DataToolSourceType;
  sourceLabel: string | null;
  parseWarnings: string[];
  enabled: boolean;
  maxActive: string;
  spawnIntervalSec: string;
  minSpawnDistance: string;
  maxSpawnDistance: string;
  despawnDistance: string;
  defaultLevelMin: string;
  defaultLevelMax: string;
  defaultRouteMaxShips: string;
  defaultTemplateWeightsJson: string;
  templatesJson: string;
  routeLevelRangesJson: string;
  routeMaxShipsJson: string;
  routeTemplateWeightsJson: string;
  sectorLevelRangesJson: string;
  patrolsJson: string;
  extraJson: string;
};

export type MapWorkspace = DataWorkspaceMeta & {
  pois: MapPoiDraft[];
  regions: MapRegionDraft[];
};

export type TradeRoutesWorkspace = DataWorkspaceMeta & {
  version: string;
  routes: TradeRouteDraft[];
};

export type TutorialEntriesWorkspace = DataWorkspaceMeta & {
  version: string;
  entries: TutorialEntryDraft[];
};

export type TutorialTriggersWorkspace = DataWorkspaceMeta & {
  version: string;
  groups: TutorialTriggerGroupDraft[];
  eventGroups: TutorialTriggerGroupDraft[];
  areas: TutorialAreaTriggerDraft[];
  extraJson: string;
};

export type ShipStatDescriptionsWorkspace = DataWorkspaceMeta & {
  stats: ShipStatDescriptionDraft[];
};

export type ZonesWorkspace = DataWorkspaceMeta & {
  zones: ZoneDraft[];
};

export type StagesWorkspace = DataWorkspaceMeta & {
  stages: StageDraft[];
};

export type HazardBarrierProfilesWorkspace = DataWorkspaceMeta & {
  profiles: HazardBarrierProfileDraft[];
};
