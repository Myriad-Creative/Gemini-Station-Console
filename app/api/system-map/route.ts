import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { DATA_FILE_PATHS, type UploadedDataFileKind } from "@lib/uploaded-data";
import type {
  SystemMapMobSpawn,
  SystemMapPayload,
  SystemMapPoi,
  SystemMapRect,
  SystemMapRegion,
  SystemMapRoute,
  SystemMapSceneBarrier,
  SystemMapSceneMobSpawn,
  SystemMapSector,
  SystemMapStagePlacement,
  SystemMapVec,
  SystemMapZone,
} from "@lib/system-map/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTOR_SIZE = 250000;
const SECTOR_HALF_EXTENT = 125000;
const REGION_SIZE = 50000;
const SECTOR_MIN = -3;
const SECTOR_MAX = 3;
const SUN_RADIUS = 10000;
const SUN_DANGER_RADIUS = 22000;
const ASTEROID_BELT_INNER_RADIUS = 370000;
const ASTEROID_BELT_OUTER_RADIUS = 380000;
const ASTEROID_BELT_MID_RADIUS = 375000;

const SECTOR_NAMES = new Map<string, string>([
  ["-3,3", "-33"],
  ["-2,3", "-23"],
  ["-1,3", "-13"],
  ["0,3", "03"],
  ["1,3", "13"],
  ["2,3", "23"],
  ["3,3", "33"],
  ["-3,2", "-32"],
  ["-2,2", "-22"],
  ["-1,2", "-12"],
  ["0,2", "02"],
  ["1,2", "12"],
  ["2,2", "22"],
  ["3,2", "32"],
  ["-3,1", "-31"],
  ["-2,1", "-21"],
  ["-1,1", "-11"],
  ["0,1", "Terran"],
  ["1,1", "11"],
  ["2,1", "21"],
  ["3,1", "31"],
  ["-3,0", "-30"],
  ["-2,0", "-20"],
  ["-1,0", "Sector Gemini"],
  ["0,0", "Sol"],
  ["1,0", "Venus"],
  ["2,0", "JayCo"],
  ["3,0", "30"],
  ["-3,-1", "-3-1"],
  ["-2,-1", "-2-1"],
  ["-1,-1", "-1-1"],
  ["0,-1", "Martian"],
  ["1,-1", "1-1"],
  ["2,-1", "2-1"],
  ["3,-1", "3-1"],
  ["-3,-2", "-3-2"],
  ["-2,-2", "-2-2"],
  ["-1,-2", "-1-2"],
  ["0,-2", "0-2"],
  ["1,-2", "1-2"],
  ["2,-2", "2-2"],
  ["3,-2", "3-2"],
  ["-3,-3", "-3-3"],
  ["-2,-3", "-2-3"],
  ["-1,-3", "-1-3"],
  ["0,-3", "0-3"],
  ["1,-3", "1-3"],
  ["2,-3", "2-3"],
  ["3,-3", "3-3"],
]);

type JsonRecord = Record<string, unknown>;
type LoadedJson = {
  value: unknown | null;
  warnings: string[];
};
type PendingSceneBarrier = {
  nodeName: string;
  position: SystemMapVec;
  profileId: string;
  bandWidth: number;
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualAlphaMultiplier: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function vecValue(value: unknown, fallback: SystemMapVec = { x: 0, y: 0 }): SystemMapVec {
  if (Array.isArray(value) && value.length >= 2) {
    return {
      x: numberValue(value[0], fallback.x),
      y: numberValue(value[1], fallback.y),
    };
  }
  if (isRecord(value)) {
    return {
      x: numberValue(value.x, fallback.x),
      y: numberValue(value.y, fallback.y),
    };
  }
  return fallback;
}

function rectValue(value: unknown): SystemMapRect {
  const record = asRecord(value);
  return {
    x: numberValue(record.x),
    y: numberValue(record.y),
    w: numberValue(record.w ?? record.width),
    h: numberValue(record.h ?? record.height),
  };
}

function worldFromSectorLocal(sector: SystemMapVec, local: SystemMapVec): SystemMapVec {
  return {
    x: sector.x * SECTOR_SIZE + local.x,
    y: sector.y * SECTOR_SIZE + local.y,
  };
}

function addVec(a: SystemMapVec, b: SystemMapVec): SystemMapVec {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function sectorName(x: number, y: number) {
  return SECTOR_NAMES.get(`${x},${y}`) ?? "Unknown Sector";
}

async function loadDataFile(gameRootPath: string, kind: UploadedDataFileKind, label: string): Promise<LoadedJson> {
  const absolute = path.join(gameRootPath, DATA_FILE_PATHS[kind]);
  if (!fs.existsSync(absolute)) {
    return {
      value: null,
      warnings: [`${label} was not found at ${DATA_FILE_PATHS[kind]}.`],
    };
  }

  const text = await fs.promises.readFile(absolute, "utf-8");
  const parsed = parseTolerantJsonText(text);
  return {
    value: parsed.value,
    warnings: parsed.errors.map((error) => `${label}: ${error}`),
  };
}

function buildSectors(): SystemMapSector[] {
  const sectors: SystemMapSector[] = [];
  for (let y = SECTOR_MAX; y >= SECTOR_MIN; y -= 1) {
    for (let x = SECTOR_MIN; x <= SECTOR_MAX; x += 1) {
      sectors.push({
        x,
        y,
        name: sectorName(x, y),
        rect: {
          x: x * SECTOR_SIZE - SECTOR_HALF_EXTENT,
          y: y * SECTOR_SIZE - SECTOR_HALF_EXTENT,
          w: SECTOR_SIZE,
          h: SECTOR_SIZE,
        },
      });
    }
  }
  return sectors;
}

function buildRegions(regionsJson: unknown): SystemMapRegion[] {
  return asArray(asRecord(regionsJson).regions).map((entry, index) => {
    const region = asRecord(entry);
    const id = stringValue(region.id, `region_${index + 1}`);
    return {
      id,
      name: stringValue(region.loc_name ?? region.name, id),
      rect: rectValue(region.rect),
      discovered: boolValue(region.discovered, false),
    };
  });
}

function buildMobCatalog(mobsJson: unknown) {
  const catalog = new Map<string, JsonRecord>();
  for (const entry of asArray(mobsJson)) {
    const mob = asRecord(entry);
    const id = stringValue(mob.id).trim();
    if (id) catalog.set(id, mob);
  }
  return catalog;
}

function resolveResPath(gameRootPath: string, resPath: string) {
  const cleaned = resPath.trim().replace(/^res:\/\//, "").replace(/^\/+/, "");
  if (!cleaned) return null;
  return path.join(gameRootPath, cleaned);
}

function parseVector2Text(value: string): SystemMapVec | null {
  const match = value.match(/Vector2\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)/);
  if (!match) return null;
  return {
    x: numberValue(match[1]),
    y: numberValue(match[2]),
  };
}

function parsePackedVector2Array(value: string): SystemMapVec[] {
  const match = value.match(/PackedVector2Array\(([^)]*)\)/s);
  if (!match) return [];
  const numbers = match[1]
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  const points: SystemMapVec[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return points;
}

function extractCurvePointsById(text: string) {
  const curves = new Map<string, SystemMapVec[]>();
  const pattern = /\[sub_resource type="Curve2D" id="([^"]+)"\][\s\S]*?"points":\s*PackedVector2Array\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const rawPoints = parsePackedVector2Array(`PackedVector2Array(${match[2]})`);
    const anchorPoints: SystemMapVec[] = [];
    for (let index = 2; index < rawPoints.length; index += 3) {
      anchorPoints.push(rawPoints[index]);
    }
    curves.set(match[1], anchorPoints);
  }
  return curves;
}

function parseSceneContents(
  gameRootPath: string,
  scenePath: string,
  parentWorld: SystemMapVec,
  mobCatalog: Map<string, JsonRecord>,
): { mobSpawns: SystemMapSceneMobSpawn[]; barriers: SystemMapSceneBarrier[] } {
  const absolute = resolveResPath(gameRootPath, scenePath);
  if (!absolute || !fs.existsSync(absolute)) {
    return {
      mobSpawns: [],
      barriers: [],
    };
  }

  const text = fs.readFileSync(absolute, "utf-8");
  const curves = extractCurvePointsById(text);
  const lines = text.split(/\r?\n/);
  const mobSpawns: SystemMapSceneMobSpawn[] = [];
  const barriers: SystemMapSceneBarrier[] = [];
  let nodeName = "";
  let nodeType = "";
  let parentName = "";
  let position: SystemMapVec = { x: 0, y: 0 };
  let mobId = "";
  let angleDeg: number | null = null;
  let respawnDelay: number | null = null;
  let routeId = "";
  let barrierProfileId = "";
  let bandWidth = 0;
  let visualWidthMultiplier = 1;
  let visualDensityMultiplier = 1;
  let visualAlphaMultiplier = 1;
  const pendingBarrierRef: { current: PendingSceneBarrier | null } = { current: null };

  function flush() {
    if (!mobId) return;
    const mob = mobCatalog.get(mobId) ?? {};
    mobSpawns.push({
      nodeName,
      mobId,
      displayName: stringValue(mob.display_name ?? mob.name, mobId),
      local: position,
      world: addVec(parentWorld, position),
      angleDeg,
      respawnDelay,
      routeId,
      faction: stringValue(mob.faction ?? asRecord(mob.meta).Faction, ""),
      sprite: stringValue(mob.sprite, ""),
      missing: !mobCatalog.has(mobId),
      sourceScene: scenePath,
    });
  }

  function capturePendingBarrier() {
    if (barrierProfileId || nodeName.toLowerCase().includes("hazardbarrier")) {
      pendingBarrierRef.current = {
        nodeName,
        position,
        profileId: barrierProfileId,
        bandWidth,
        visualWidthMultiplier,
        visualDensityMultiplier,
        visualAlphaMultiplier,
      };
    }
  }

  for (const line of lines) {
    if (line.startsWith("[node ")) {
      flush();
      capturePendingBarrier();
      nodeName = line.match(/name="([^"]+)"/)?.[1] ?? "";
      nodeType = line.match(/type="([^"]+)"/)?.[1] ?? "";
      parentName = line.match(/parent="([^"]+)"/)?.[1] ?? "";
      position = { x: 0, y: 0 };
      mobId = "";
      angleDeg = null;
      respawnDelay = null;
      routeId = "";
      barrierProfileId = "";
      bandWidth = 0;
      visualWidthMultiplier = 1;
      visualDensityMultiplier = 1;
      visualAlphaMultiplier = 1;
      continue;
    }

    if (line.startsWith("position = Vector2(")) {
      position = parseVector2Text(line) ?? position;
      continue;
    }

    if (line.startsWith("metadata/mob_id")) {
      mobId = line.match(/=\s*"([^"]+)"/)?.[1] ?? "";
      continue;
    }

    if (line.startsWith("metadata/angle_deg")) {
      angleDeg = nullableNumberValue(line.split("=").slice(1).join("=").trim());
      continue;
    }

    if (line.startsWith("metadata/respawn_delay")) {
      respawnDelay = nullableNumberValue(line.split("=").slice(1).join("=").trim());
      continue;
    }

    if (line.startsWith("metadata/route_id")) {
      routeId = line.match(/=\s*"([^"]+)"/)?.[1] ?? "";
      continue;
    }

    if (line.startsWith("barrier_profile_id")) {
      barrierProfileId = line.match(/=\s*"([^"]+)"/)?.[1] ?? "";
      continue;
    }

    if (line.startsWith("band_width")) {
      bandWidth = numberValue(line.split("=").slice(1).join("=").trim());
      continue;
    }

    if (line.startsWith("visual_width_multiplier")) {
      visualWidthMultiplier = numberValue(line.split("=").slice(1).join("=").trim(), 1);
      continue;
    }

    if (line.startsWith("visual_density_multiplier")) {
      visualDensityMultiplier = numberValue(line.split("=").slice(1).join("=").trim(), 1);
      continue;
    }

    if (line.startsWith("visual_alpha_multiplier")) {
      visualAlphaMultiplier = numberValue(line.split("=").slice(1).join("=").trim(), 1);
      continue;
    }

    const pendingBarrier = pendingBarrierRef.current;
    if ((nodeType === "Path2D" || nodeName === "Path2D") && parentName && pendingBarrier && parentName === pendingBarrier.nodeName && line.startsWith("curve = SubResource(")) {
      const curveId = line.match(/SubResource\("([^"]+)"\)/)?.[1] ?? "";
      const localCurvePoints = curves.get(curveId) ?? [];
      const localPoints = localCurvePoints.map((point) => addVec(pendingBarrier.position, point));
      barriers.push({
        nodeName: pendingBarrier.nodeName,
        profileId: pendingBarrier.profileId,
        localPoints,
        worldPoints: localPoints.map((point) => addVec(parentWorld, point)),
        bandWidth: pendingBarrier.bandWidth,
        visualWidthMultiplier: pendingBarrier.visualWidthMultiplier,
        visualDensityMultiplier: pendingBarrier.visualDensityMultiplier,
        visualAlphaMultiplier: pendingBarrier.visualAlphaMultiplier,
        sourceScene: scenePath,
      });
      pendingBarrierRef.current = null;
    }
  }

  flush();
  capturePendingBarrier();
  return {
    mobSpawns,
    barriers,
  };
}

function buildStagePlacement(stageEntry: unknown, zoneWorld: SystemMapVec, stagesJson: JsonRecord): SystemMapStagePlacement {
  const placement = asRecord(stageEntry);
  const stageId = stringValue(placement.stage_id ?? placement.id).trim();
  const local = vecValue(placement.pos);
  const stage = asRecord(stagesJson[stageId]);
  const width = numberValue(stage.width);
  const height = numberValue(stage.height);

  return {
    stageId,
    name: stringValue(stage.name, stageId),
    local,
    world: addVec(zoneWorld, local),
    shape: stringValue(stage.shape, "ellipse"),
    width,
    height,
    materialCount: asArray(stage.materials).length,
    missing: !stagesJson[stageId],
  };
}

function buildMobSpawn(
  gameRootPath: string,
  spawnEntry: unknown,
  zoneWorld: SystemMapVec,
  mobCatalog: Map<string, JsonRecord>,
): SystemMapMobSpawn {
  const spawn = asRecord(spawnEntry);
  const mobId = stringValue(spawn.mob_id ?? spawn.id).trim();
  const mob = mobCatalog.get(mobId) ?? {};
  const local = vecValue(spawn.pos);
  const world = addVec(zoneWorld, local);
  const scene = stringValue(mob.scene, "");
  const sceneContents = scene ? parseSceneContents(gameRootPath, scene, world, mobCatalog) : { mobSpawns: [], barriers: [] };

  return {
    mobId,
    displayName: stringValue(mob.display_name ?? mob.name, mobId),
    local,
    world,
    count: numberValue(spawn.count, 1),
    radius: numberValue(spawn.radius),
    respawnDelay: numberValue(spawn.respawn_delay),
    angleDeg: numberValue(spawn.angle_deg),
    levelMin: nullableNumberValue(spawn.level_min),
    levelMax: nullableNumberValue(spawn.level_max),
    rank: stringValue(spawn.rank, "normal"),
    faction: stringValue(mob.faction ?? asRecord(mob.meta).Faction, ""),
    sprite: stringValue(mob.sprite, ""),
    scene,
    missing: !mobCatalog.has(mobId),
    sceneSpawns: sceneContents.mobSpawns,
    sceneBarriers: sceneContents.barriers,
  };
}

function buildZones(gameRootPath: string, zonesJson: unknown, stagesJson: unknown, mobCatalog: Map<string, JsonRecord>): SystemMapZone[] {
  const stages = asRecord(stagesJson);
  return Object.entries(asRecord(zonesJson)).map(([id, rawZone]) => {
    const zone = asRecord(rawZone);
    const sector = vecValue(zone.sector_id);
    const local = vecValue(zone.pos);
    const world = worldFromSectorLocal(sector, local);
    const bounds = asRecord(zone.bounds);
    const name = stringValue(zone.name, id);
    const poiLabel = stringValue(zone.poi_label, name);

    return {
      id,
      name,
      active: boolValue(zone.active),
      showHudOnEnter: boolValue(zone.show_hud_on_enter),
      poiMap: boolValue(zone.poi_map),
      poiHidden: boolValue(zone.poi_hidden),
      poiLabel,
      sector,
      local,
      world,
      activationRadius: numberValue(zone.activation_radius),
      activationRadiusBorder: boolValue(zone.activation_radius_border),
      bounds: {
        shape: stringValue(bounds.shape, "ellipse"),
        width: numberValue(bounds.width),
        height: numberValue(bounds.height),
      },
      stages: asArray(zone.stages).map((entry) => buildStagePlacement(entry, world, stages)),
      mobs: asArray(zone.mobs).map((entry) => buildMobSpawn(gameRootPath, entry, world, mobCatalog)),
    };
  });
}

function buildPois(poiJson: unknown, zones: SystemMapZone[]): SystemMapPoi[] {
  const legacyPois = asArray(asRecord(poiJson).pois).map((entry, index) => {
    const poi = asRecord(entry);
    const id = stringValue(poi.id, `poi_${index + 1}`);
    const sector = vecValue(poi.sector);
    const local = vecValue(poi.pos);
    return {
      id,
      name: stringValue(poi.name, id),
      type: stringValue(poi.type, "poi"),
      source: "legacy" as const,
      zoneId: null,
      sector,
      local,
      world: worldFromSectorLocal(sector, local),
      map: boolValue(poi.map, true),
      hidden: boolValue(poi.hidden),
    };
  });

  const zonePois = zones
    .filter((zone) => zone.poiMap)
    .map((zone) => ({
      id: zone.id,
      name: zone.poiLabel || zone.name,
      type: "zone",
      source: "zone" as const,
      zoneId: zone.id,
      sector: zone.sector,
      local: zone.local,
      world: zone.world,
      map: true,
      hidden: zone.poiHidden,
    }));

  return [...legacyPois, ...zonePois];
}

function routePointToWorld(routeSector: SystemMapVec, value: unknown): SystemMapVec {
  return worldFromSectorLocal(routeSector, vecValue(value));
}

function buildRoutes(routesJson: unknown): SystemMapRoute[] {
  return asArray(asRecord(routesJson).routes).map((entry, index) => {
    const route = asRecord(entry);
    const id = stringValue(route.id, `route_${index + 1}`);
    const sector = vecValue(route.sector);
    const endpoints = asRecord(route.endpoints);
    const endpointA = asRecord(endpoints.a);
    const endpointB = asRecord(endpoints.b);
    const points = [routePointToWorld(sector, endpointA), ...asArray(route.points).map((point) => routePointToWorld(sector, point)), routePointToWorld(sector, endpointB)];

    return {
      id,
      name: stringValue(route.name, id),
      sector,
      width: numberValue(route.width, 750),
      color: stringValue(route.color, "#2F4558"),
      borderColor: stringValue(route.border_color, "#B0ECFE"),
      opacity: numberValue(route.opacity, 0.2),
      endpointAName: stringValue(endpointA.name, "Endpoint A"),
      endpointBName: stringValue(endpointB.name, "Endpoint B"),
      points,
    };
  });
}

export async function GET() {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data) {
    return NextResponse.json(
      {
        ok: false,
        error: local.gameRootPath ? local.errors.join(" ") || "Local game source is not available." : "No local game source is configured.",
      },
      { status: 404 },
    );
  }

  const [zonesResult, stagesResult, mobsResult, poiResult, regionsResult, routesResult] = await Promise.all([
    loadDataFile(local.gameRootPath, "zones", "Zones.json"),
    loadDataFile(local.gameRootPath, "stages", "Stages.json"),
    loadDataFile(local.gameRootPath, "mobs", "mobs.json"),
    loadDataFile(local.gameRootPath, "poi", "poi.json"),
    loadDataFile(local.gameRootPath, "regions", "regions.json"),
    loadDataFile(local.gameRootPath, "tradeRoutes", "trade_routes.json"),
  ]);

  const warnings = [
    ...zonesResult.warnings,
    ...stagesResult.warnings,
    ...mobsResult.warnings,
    ...poiResult.warnings,
    ...regionsResult.warnings,
    ...routesResult.warnings,
  ];

  const mobCatalog = buildMobCatalog(mobsResult.value);
  const zones = buildZones(local.gameRootPath, zonesResult.value, stagesResult.value, mobCatalog);
  const payload: SystemMapPayload = {
    ok: true,
    sourceRoot: local.gameRootPath,
    generatedAt: new Date().toISOString(),
    config: {
      sectorSize: SECTOR_SIZE,
      sectorHalfExtent: SECTOR_HALF_EXTENT,
      regionSize: REGION_SIZE,
      sectorMin: SECTOR_MIN,
      sectorMax: SECTOR_MAX,
      sunRadius: SUN_RADIUS,
      sunDangerRadius: SUN_DANGER_RADIUS,
      asteroidBeltInnerRadius: ASTEROID_BELT_INNER_RADIUS,
      asteroidBeltOuterRadius: ASTEROID_BELT_OUTER_RADIUS,
      asteroidBeltMidRadius: ASTEROID_BELT_MID_RADIUS,
    },
    sectors: buildSectors(),
    regions: buildRegions(regionsResult.value),
    zones,
    pois: buildPois(poiResult.value, zones),
    routes: buildRoutes(routesResult.value),
    warnings,
  };

  return NextResponse.json(payload);
}
