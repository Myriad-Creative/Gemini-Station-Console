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

export type SystemMapSceneBarrier = {
  nodeName: string;
  profileId: string;
  localPoints: SystemMapVec[];
  worldPoints: SystemMapVec[];
  bandWidth: number;
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualAlphaMultiplier: number;
  sourceScene: string;
};

export type SystemMapMobSpawn = {
  mobId: string;
  displayName: string;
  local: SystemMapVec;
  world: SystemMapVec;
  count: number;
  radius: number;
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

export type SystemMapZone = {
  id: string;
  name: string;
  draft?: boolean;
  modified?: boolean;
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
  sector: SystemMapVec;
  width: number;
  color: string;
  borderColor: string;
  opacity: number;
  endpointAName: string;
  endpointBName: string;
  points: SystemMapVec[];
};

export type SystemMapPayload = {
  ok: true;
  sourceRoot: string;
  generatedAt: string;
  config: SystemMapConfig;
  sectors: SystemMapSector[];
  regions: SystemMapRegion[];
  zones: SystemMapZone[];
  pois: SystemMapPoi[];
  routes: SystemMapRoute[];
  warnings: string[];
};
