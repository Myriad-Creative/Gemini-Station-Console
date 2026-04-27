export type SystemMapVec = {
  x: number;
  y: number;
};

export type SystemMapRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SystemMapConfig = {
  sectorSize: number;
  sectorHalfExtent: number;
  regionSize: number;
  sectorMin: number;
  sectorMax: number;
  sunRadius: number;
  sunDangerRadius: number;
  asteroidBeltInnerRadius: number;
  asteroidBeltOuterRadius: number;
  asteroidBeltMidRadius: number;
};

export type SystemMapSector = {
  x: number;
  y: number;
  name: string;
  rect: SystemMapRect;
};

export type SystemMapRegion = {
  id: string;
  name: string;
  rect: SystemMapRect;
  discovered: boolean;
};

export type SystemMapStagePlacement = {
  key: string;
  originalIndex: number | null;
  draft?: boolean;
  modified?: boolean;
  stageId: string;
  name: string;
  local: SystemMapVec;
  world: SystemMapVec;
  shape: string;
  width: number;
  height: number;
  materialCount: number;
  missing: boolean;
};

export type SystemMapStageCatalogEntry = {
  id: string;
  name: string;
  shape: string;
  width: number;
  height: number;
  materialCount: number;
};

export type SystemMapSceneMobSpawn = {
  nodeName: string;
  mobId: string;
  displayName: string;
  local: SystemMapVec;
  world: SystemMapVec;
  angleDeg: number | null;
  respawnDelay: number | null;
  routeId: string;
  faction: string;
  sprite: string;
  missing: boolean;
  sourceScene: string;
};

export type SystemMapSceneBarrierVisualKind = "asteroid" | "debris" | "gas" | "unknown";

export type SystemMapSceneBarrier = {
  nodeName: string;
  profileId: string;
  baseStageProfile: string;
  visualKind: SystemMapSceneBarrierVisualKind;
  materialPaths: string[];
  localPoints: SystemMapVec[];
  worldPoints: SystemMapVec[];
  bandWidth: number;
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualScaleMultiplier: number;
  visualAlphaMultiplier: number;
  sourceScene: string;
};

export type SystemMapEnvironmentProfile = {
  id: string;
  label: string;
  source: "barrier" | "stage";
  baseStageProfile: string;
  visualKind: SystemMapSceneBarrierVisualKind;
  materialPaths: string[];
};

export type SystemMapEnvironmentalElementCommon = {
  id: string;
  originalId?: string;
  draft?: boolean;
  modified?: boolean;
  zoneId?: string | null;
  type: "hazard_barrier" | "environment_region" | "mineable_asteroid";
  name: string;
  active: boolean;
  sector: SystemMapVec;
  tags: string[];
  notes: string;
};

export type SystemMapEnvironmentalElementBase = SystemMapEnvironmentalElementCommon & {
  type: "hazard_barrier" | "environment_region";
  profileId: string;
  baseStageProfile: string;
  visualKind: SystemMapSceneBarrierVisualKind;
  materialPaths: string[];
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualScaleMultiplier: number;
  visualAlphaMultiplier: number;
  statusEffectId: number;
  removeEffectOnExit: boolean;
  affectPlayers: boolean;
  affectNpcs: boolean;
};

export type SystemMapEnvironmentalHazardBarrier = SystemMapEnvironmentalElementBase & {
  type: "hazard_barrier";
  bandWidth: number;
  closedLoop: boolean;
  useProfileBlockerWidthRatio: boolean;
  blockerWidthRatio: number;
  points: SystemMapVec[];
  worldPoints: SystemMapVec[];
};

export type SystemMapEnvironmentalRegion = SystemMapEnvironmentalElementBase & {
  type: "environment_region";
  shape: "polygon" | "ellipse";
  points: SystemMapVec[];
  worldPoints: SystemMapVec[];
  center: SystemMapVec | null;
  worldCenter: SystemMapVec | null;
  width: number;
  height: number;
  rotationDeg: number;
};

export type SystemMapMineableAsteroid = SystemMapEnvironmentalElementCommon & {
  type: "mineable_asteroid";
  local: SystemMapVec;
  world: SystemMapVec;
  oreItemId?: string | null;
  oreItemName?: string | null;
  oreItemIcon?: string | null;
  count: number;
  spawnRadius: number;
  texture: string;
  textures: string[];
  radius: number;
  visualScale: number;
  durability: number;
  respawnSeconds: number;
  lootboxCount: number;
  itemLootTable: string;
  itemDropChance: number;
  itemRolls: number;
  itemNoDuplicates: boolean;
  modLootTable: string;
  modDropChance: number;
  modRolls: number;
  miningLootIcon: string;
  miningLootIconScale: SystemMapVec;
  randomizeRotation: boolean;
};

export type SystemMapEnvironmentalElement = SystemMapEnvironmentalHazardBarrier | SystemMapEnvironmentalRegion | SystemMapMineableAsteroid;

export type SystemMapMobSpawn = {
  key: string;
  originalIndex: number | null;
  draft?: boolean;
  modified?: boolean;
  mobId: string;
  displayName: string;
  local: SystemMapVec;
  world: SystemMapVec;
  count: number;
  radius: number;
  spawnArea: {
    shape: string;
    points: SystemMapVec[];
    worldPoints: SystemMapVec[];
  };
  respawnDelay: number;
  angleDeg: number;
  levelMin: number | null;
  levelMax: number | null;
  rank: string;
  faction: string;
  sprite: string;
  scene: string;
  missing: boolean;
  sceneSpawns: SystemMapSceneMobSpawn[];
  sceneBarriers: SystemMapSceneBarrier[];
};

export type SystemMapMobCatalogEntry = {
  id: string;
  displayName: string;
  faction: string;
  sprite: string;
  scene: string;
};

export type SystemMapZone = {
  id: string;
  name: string;
  draft?: boolean;
  modified?: boolean;
  originalId?: string;
  active: boolean;
  showHudOnEnter: boolean;
  poiMap: boolean;
  poiHidden: boolean;
  poiLabel: string;
  sector: SystemMapVec;
  local: SystemMapVec;
  world: SystemMapVec;
  activationRadius: number;
  activationRadiusBorder: boolean;
  bounds: {
    shape: string;
    width: number;
    height: number;
    points: SystemMapVec[];
    worldPoints: SystemMapVec[];
  };
  stages: SystemMapStagePlacement[];
  mobs: SystemMapMobSpawn[];
};

export type SystemMapPoi = {
  id: string;
  name: string;
  type: string;
  source: "legacy" | "zone";
  zoneId: string | null;
  sector: SystemMapVec;
  local: SystemMapVec;
  world: SystemMapVec;
  map: boolean;
  hidden: boolean;
};

export type SystemMapRoute = {
  id: string;
  name: string;
  draft?: boolean;
  modified?: boolean;
  originalId?: string;
  sector: SystemMapVec;
  width: number;
  speedMultiplier: number;
  color: string;
  borderColor: string;
  opacity: number;
  borderPx: number;
  smoothingTension: number;
  endpointAName: string;
  endpointBName: string;
  endpointA: SystemMapVec;
  endpointB: SystemMapVec;
  controlPoints: SystemMapVec[];
  usesControlPoints: boolean;
  viaPoints: SystemMapVec[];
  points: SystemMapVec[];
};

export type SystemMapAsteroidBeltGate = {
  id: string;
  name: string;
  originalId?: string;
  enabled: boolean;
  angleDegrees: number;
  widthPx: number;
  world: SystemMapVec;
  originalIndex: number;
  modified?: boolean;
};

export type SystemMapMineableOreItem = {
  id: string;
  name: string;
  icon: string;
};

export type SystemMapPayload = {
  ok: true;
  sourceRoot: string;
  generatedAt: string;
  config: SystemMapConfig;
  sectors: SystemMapSector[];
  regions: SystemMapRegion[];
  zones: SystemMapZone[];
  stageCatalog: SystemMapStageCatalogEntry[];
  mobCatalog: SystemMapMobCatalogEntry[];
  pois: SystemMapPoi[];
  routes: SystemMapRoute[];
  asteroidBeltGates: SystemMapAsteroidBeltGate[];
  environmentProfiles: SystemMapEnvironmentProfile[];
  environmentalElements: SystemMapEnvironmentalElement[];
  mineableOreItems: SystemMapMineableOreItem[];
  warnings: string[];
};
