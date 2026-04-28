import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { DATA_FILE_PATHS, type UploadedDataFileKind } from "@lib/uploaded-data";
import type {
  SystemMapAsteroidBeltGate,
  SystemMapEnvironmentalElement,
  SystemMapEnvironmentProfile,
  SystemMapMineableOreItem,
  SystemMapMobCatalogEntry,
  SystemMapMobSpawn,
  SystemMapPayload,
  SystemMapPoi,
  SystemMapRect,
  SystemMapRegion,
  SystemMapRoute,
  SystemMapSceneBarrier,
  SystemMapSceneMobSpawn,
  SystemMapSector,
  SystemMapStageCatalogEntry,
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
const DEFAULT_ASTEROID_BELT_GATE_WIDTH = 2000;
const DEFAULT_HAZARD_BARRIER_PROFILE_ID = "wreck_plasma_orange";
const DEFAULT_HAZARD_BARRIER_BAND_WIDTH = 480;
const DEFAULT_MINEABLE_ASTEROID_TEXTURE = "res://assets/environment/asteroids/ast_1.png";
const DEFAULT_MINING_LOOT_ICON = "res://assets/items/item_crate_iron_ore.png";
const DEFAULT_MINING_LOOT_TABLE = "mining_asteroid_fragments";

const MINEABLE_ORE_NAMES = [
  "Compacted Gold Ore",
  "Compacted Iron Ore",
  "Copper Ore",
  "Iron Ore",
  "Nickel Ore",
  "Platinum Ore",
  "Rhodium Ore",
  "Tin Ore",
];

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
  visualScaleMultiplier: number;
  visualAlphaMultiplier: number;
};
type BarrierVisualProfile = {
  baseStageProfile: string;
  visualKind: SystemMapSceneBarrier["visualKind"];
  materialPaths: string[];
  visualWidthMultiplier: number;
  visualDensityMultiplier: number;
  visualScaleMultiplier: number;
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

function stringArrayValue(value: unknown) {
  return asArray(value)
    .map((entry) => stringValue(entry).trim())
    .filter(Boolean);
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

function itemIdValue(value: unknown) {
  const raw = stringValue(value).trim();
  if (!raw) return "";
  if (/^-?\d+(?:\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

function normalizedSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemIconResPath(value: unknown) {
  const icon = stringValue(value).trim();
  if (!icon) return "";
  if (icon.startsWith("res://")) return icon;
  if (icon.startsWith("assets/")) return `res://${icon}`;
  if (icon.startsWith("/")) return icon;
  return `res://assets/items/${icon}`;
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

function vecArrayValue(value: unknown): SystemMapVec[] {
  return asArray(value)
    .map((entry) => vecValue(entry, { x: Number.NaN, y: Number.NaN }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
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

function pointsFromAnchor(anchor: SystemMapVec, points: SystemMapVec[]) {
  return points.map((point) => addVec(anchor, point));
}

function pointBounds(points: SystemMapVec[]) {
  if (!points.length) return { width: 0, height: 0 };
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function localPointsToWorld(sector: SystemMapVec, points: SystemMapVec[]) {
  return points.map((point) => worldFromSectorLocal(sector, point));
}

function ellipsePoints(center: SystemMapVec, width: number, height: number, rotationDeg: number, samples = 48) {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rx = Math.max(1, width / 2);
  const ry = Math.max(1, height / 2);
  const points: SystemMapVec[] = [];
  for (let index = 0; index < samples; index += 1) {
    const theta = (index / samples) * Math.PI * 2;
    const x = Math.cos(theta) * rx;
    const y = Math.sin(theta) * ry;
    points.push({
      x: center.x + x * cos - y * sin,
      y: center.y + x * sin + y * cos,
    });
  }
  return points;
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

function buildMobCatalogEntries(mobsJson: unknown): SystemMapMobCatalogEntry[] {
  return asArray(mobsJson)
    .map((entry) => {
      const mob = asRecord(entry);
      const id = stringValue(mob.id).trim();
      return {
        id,
        displayName: stringValue(mob.display_name ?? mob.name, id),
        level: nullableNumberValue(mob.level),
        faction: stringValue(mob.faction ?? asRecord(mob.meta).Faction, ""),
        sprite: stringValue(mob.sprite, ""),
        scene: stringValue(mob.scene, ""),
      };
    })
    .filter((entry) => entry.id)
    .sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
}

function buildStageCatalogEntries(stagesJson: unknown): SystemMapStageCatalogEntry[] {
  return Object.entries(asRecord(stagesJson))
    .map(([id, rawStage]) => {
      const stage = asRecord(rawStage);
      return {
        id,
        name: stringValue(stage.name, id),
        shape: stringValue(stage.shape, "ellipse"),
        width: numberValue(stage.width),
        height: numberValue(stage.height),
        materialCount: asArray(stage.materials).length,
      };
    })
    .filter((entry) => entry.id)
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
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

function materialPathsFromProfile(profile: JsonRecord): string[] {
  return asArray(profile.materials)
    .map((entry) => stringValue(entry).trim())
    .filter(Boolean);
}

function inferBarrierVisualKind(profileId: string, baseStageProfile: string, materialPaths: string[]): SystemMapSceneBarrier["visualKind"] {
  const haystack = [profileId, baseStageProfile, ...materialPaths].join(" ").toLowerCase();
  if (haystack.includes("/asteroids/") || haystack.includes("asteroid")) return "asteroid";
  if (haystack.includes("/debris/") || haystack.includes("/tut_debris/") || haystack.includes("debris")) return "debris";
  if (haystack.includes("/cloud/") || haystack.includes("/nebula/") || haystack.includes("gas") || haystack.includes("neb") || haystack.includes("smoke") || haystack.includes("plasma")) return "gas";
  return "unknown";
}

function resolveBarrierVisualProfile(profileId: string, hazardBarrierProfilesJson: unknown, stagesJson: unknown): BarrierVisualProfile {
  const stageProfiles = asRecord(stagesJson);
  const barrierProfiles = asRecord(hazardBarrierProfilesJson);
  const barrierProfile = asRecord(barrierProfiles[profileId]);
  const baseStageProfile = stringValue(barrierProfile.base_stage_profile).trim();
  const hasDirectStageProfile = !!stageProfiles[profileId];
  const directStageProfile = asRecord(stageProfiles[profileId]);
  const baseStage = asRecord(stageProfiles[baseStageProfile]);
  const mergedProfile = {
    ...(baseStageProfile ? baseStage : directStageProfile),
    ...barrierProfile,
  };
  const materialPaths = materialPathsFromProfile(mergedProfile);
  return {
    baseStageProfile: baseStageProfile || (hasDirectStageProfile ? profileId : ""),
    visualKind: inferBarrierVisualKind(profileId, baseStageProfile || profileId, materialPaths),
    materialPaths,
    visualWidthMultiplier: numberValue(mergedProfile.visual_width_multiplier, 1),
    visualDensityMultiplier: numberValue(mergedProfile.visual_density_multiplier, 1),
    visualScaleMultiplier: numberValue(mergedProfile.visual_scale_multiplier, 1),
    visualAlphaMultiplier: numberValue(mergedProfile.visual_alpha_multiplier, 1),
  };
}

function buildEnvironmentProfiles(hazardBarrierProfilesJson: unknown, stagesJson: unknown): SystemMapEnvironmentProfile[] {
  const profiles = new Map<string, SystemMapEnvironmentProfile>();
  const stageProfiles = asRecord(stagesJson);

  for (const profileId of Object.keys(asRecord(hazardBarrierProfilesJson))) {
    const resolved = resolveBarrierVisualProfile(profileId, hazardBarrierProfilesJson, stagesJson);
    profiles.set(profileId, {
      id: profileId,
      label: stringValue(asRecord(asRecord(hazardBarrierProfilesJson)[profileId]).name, profileId),
      source: "barrier",
      baseStageProfile: resolved.baseStageProfile,
      visualKind: resolved.visualKind,
      materialPaths: resolved.materialPaths,
    });
  }

  for (const [profileId, rawStage] of Object.entries(stageProfiles)) {
    const stage = asRecord(rawStage);
    const materialPaths = materialPathsFromProfile(stage);
    if (!materialPaths.length || profiles.has(profileId)) continue;
    profiles.set(profileId, {
      id: profileId,
      label: stringValue(stage.name, profileId),
      source: "stage",
      baseStageProfile: profileId,
      visualKind: inferBarrierVisualKind(profileId, profileId, materialPaths),
      materialPaths,
    });
  }

  return Array.from(profiles.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildMineableOreItems(itemsJson: unknown): SystemMapMineableOreItem[] {
  const itemValues = Array.isArray(itemsJson) ? itemsJson : Object.values(asRecord(itemsJson));
  const catalog = itemValues
    .map((value) => {
      const item = asRecord(value);
      const id = itemIdValue(item.id);
      const name = stringValue(item.name ?? item.display_name, id).trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        icon: itemIconResPath(item.icon ?? item.icon_path ?? item.sprite ?? item.texture),
        normalizedName: normalizedSearchText(name),
      };
    })
    .filter((item): item is SystemMapMineableOreItem & { normalizedName: string } => !!item);

  const oreItems: SystemMapMineableOreItem[] = [];
  for (const oreName of MINEABLE_ORE_NAMES) {
    const normalizedOreName = normalizedSearchText(oreName);
    const item = catalog.find((candidate) => candidate.normalizedName === normalizedOreName);
    if (!item || oreItems.some((entry) => entry.id === item.id)) continue;
    oreItems.push({
      id: item.id,
      name: item.name,
      icon: item.icon,
    });
  }
  return oreItems;
}

function buildEnvironmentalElements(elementsJson: unknown, hazardBarrierProfilesJson: unknown, stagesJson: unknown): SystemMapEnvironmentalElement[] {
  const root = asRecord(elementsJson);
  return asArray(root.elements)
    .map((entry, index) => {
      const element = asRecord(entry);
      const data = asRecord(element.data);
      const id = stringValue(element.id, `environmental_element_${index + 1}`);
      const type = stringValue(element.type, "hazard_barrier");
      const sector = vecValue(element.sector_id);
      const zoneId = stringValue(element.zone_id ?? data.zone_id, "").trim();
      const common = {
        id,
        name: stringValue(element.name, id),
        active: boolValue(element.active, true),
        sector,
        zoneId: zoneId || null,
        tags: asArray(element.tags)
          .map((tag) => stringValue(tag).trim())
          .filter(Boolean),
        notes: stringValue(element.notes, ""),
      };

      if (type === "mineable_asteroid") {
        const local = vecValue(data.position);
        return {
          ...common,
          type: "mineable_asteroid" as const,
          local,
          world: worldFromSectorLocal(sector, local),
          oreItemId: itemIdValue(data.ore_item_id ?? data.ore_id) || null,
          oreItemName: stringValue(data.ore_item_name ?? data.ore_name, "").trim() || null,
          oreItemIcon: itemIconResPath(data.ore_item_icon ?? data.ore_icon) || null,
          count: Math.max(1, Math.round(numberValue(data.count ?? data.spawn_count, 1))),
          spawnRadius: Math.max(0, numberValue(data.spawn_radius ?? data.field_radius, 0)),
          texture: stringValue(data.texture, DEFAULT_MINEABLE_ASTEROID_TEXTURE),
          textures: stringArrayValue(data.textures),
          radius: Math.max(1, numberValue(data.radius, 160)),
          visualScale: Math.max(0.01, numberValue(data.visual_scale, 1)),
          durability: Math.max(1, numberValue(data.durability, 500)),
          respawnSeconds: Math.max(0, numberValue(data.respawn_seconds, 300)),
          lootboxCount: Math.max(0, numberValue(data.lootbox_count, 1)),
          itemLootTable: stringValue(data.item_loot_table, DEFAULT_MINING_LOOT_TABLE),
          itemDropChance: numberValue(data.item_drop_chance, 1),
          itemRolls: Math.max(0, numberValue(data.item_rolls, 1)),
          itemNoDuplicates: boolValue(data.item_no_duplicates, false),
          modLootTable: stringValue(data.mod_loot_table, ""),
          modDropChance: numberValue(data.mod_drop_chance, 0),
          modRolls: Math.max(0, numberValue(data.mod_rolls, 0)),
          miningLootIcon: stringValue(data.mining_loot_icon, DEFAULT_MINING_LOOT_ICON),
          miningLootIconScale: vecValue(data.mining_loot_icon_scale, { x: 0.1, y: 0.1 }),
          randomizeRotation: boolValue(data.randomize_rotation, true),
        };
      }

      const profileId = stringValue(data.profile_id, DEFAULT_HAZARD_BARRIER_PROFILE_ID);
      const visualProfile = resolveBarrierVisualProfile(profileId, hazardBarrierProfilesJson, stagesJson);
      const visualCommon = {
        ...common,
        profileId,
        baseStageProfile: visualProfile.baseStageProfile,
        visualKind: visualProfile.visualKind,
        materialPaths: visualProfile.materialPaths,
        visualWidthMultiplier: numberValue(data.visual_width_multiplier, 1),
        visualDensityMultiplier: numberValue(data.visual_density_multiplier, 1),
        visualScaleMultiplier: numberValue(data.visual_scale_multiplier, 1),
        visualAlphaMultiplier: numberValue(data.visual_alpha_multiplier, 1),
        statusEffectId: numberValue(data.status_effect_id, -1),
        removeEffectOnExit: boolValue(data.remove_effect_on_exit, true),
        affectPlayers: boolValue(data.affect_players, true),
        affectNpcs: boolValue(data.affect_npcs, true),
      };

      if (type === "environment_region") {
        const shape: "ellipse" | "polygon" = stringValue(data.shape, "polygon").trim().toLowerCase() === "ellipse" ? "ellipse" : "polygon";
        const points = shape === "polygon" ? asArray(data.points).map((point) => vecValue(point)) : [];
        const center = shape === "ellipse" ? vecValue(data.center) : null;
        const width = Math.max(1, numberValue(data.width, 1));
        const height = Math.max(1, numberValue(data.height, 1));
        const rotationDeg = numberValue(data.rotation_deg);
        const outlinePoints = shape === "polygon" ? points : center ? ellipsePoints(center, width, height, rotationDeg) : [];
        return {
          ...visualCommon,
          type: "environment_region" as const,
          shape,
          points,
          worldPoints: localPointsToWorld(sector, outlinePoints),
          center,
          worldCenter: center ? worldFromSectorLocal(sector, center) : null,
          width,
          height,
          rotationDeg,
        };
      }

      const points = asArray(data.points).map((point) => vecValue(point));
      return {
        ...visualCommon,
        type: "hazard_barrier" as const,
        bandWidth: Math.max(1, numberValue(data.band_width, DEFAULT_HAZARD_BARRIER_BAND_WIDTH)),
        closedLoop: boolValue(data.closed_loop, false),
        useProfileBlockerWidthRatio: boolValue(data.use_profile_blocker_width_ratio, true),
        blockerWidthRatio: numberValue(data.blocker_width_ratio, 1),
        points,
        worldPoints: localPointsToWorld(sector, points),
      };
    })
    .filter((element) => element.id);
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
  stagesJson: unknown,
  hazardBarrierProfilesJson: unknown,
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
  let bandWidth = DEFAULT_HAZARD_BARRIER_BAND_WIDTH;
  let visualWidthMultiplier = 1;
  let visualDensityMultiplier = 1;
  let visualScaleMultiplier = 1;
  let visualAlphaMultiplier = 1;
  const pendingBarrierRef: { current: PendingSceneBarrier | null } = { current: null };

  function flush() {
    if (!mobId) return;
    const mob = mobCatalog.get(mobId) ?? {};
    mobSpawns.push({
      nodeName,
      mobId,
      displayName: stringValue(mob.display_name ?? mob.name, mobId),
      level: nullableNumberValue(mob.level),
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
        profileId: barrierProfileId || DEFAULT_HAZARD_BARRIER_PROFILE_ID,
        bandWidth,
        visualWidthMultiplier,
        visualDensityMultiplier,
        visualScaleMultiplier,
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
      bandWidth = DEFAULT_HAZARD_BARRIER_BAND_WIDTH;
      visualWidthMultiplier = 1;
      visualDensityMultiplier = 1;
      visualScaleMultiplier = 1;
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

    if (line.startsWith("visual_scale_multiplier")) {
      visualScaleMultiplier = numberValue(line.split("=").slice(1).join("=").trim(), 1);
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
      const visualProfile = resolveBarrierVisualProfile(pendingBarrier.profileId, hazardBarrierProfilesJson, stagesJson);
      barriers.push({
        nodeName: pendingBarrier.nodeName,
        profileId: pendingBarrier.profileId,
        baseStageProfile: visualProfile.baseStageProfile,
        visualKind: visualProfile.visualKind,
        materialPaths: visualProfile.materialPaths,
        localPoints,
        worldPoints: localPoints.map((point) => addVec(parentWorld, point)),
        bandWidth: pendingBarrier.bandWidth,
        visualWidthMultiplier: visualProfile.visualWidthMultiplier * pendingBarrier.visualWidthMultiplier,
        visualDensityMultiplier: visualProfile.visualDensityMultiplier * pendingBarrier.visualDensityMultiplier,
        visualScaleMultiplier: visualProfile.visualScaleMultiplier * pendingBarrier.visualScaleMultiplier,
        visualAlphaMultiplier: visualProfile.visualAlphaMultiplier * pendingBarrier.visualAlphaMultiplier,
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

function buildStagePlacement(stageEntry: unknown, zoneWorld: SystemMapVec, stagesJson: JsonRecord, index: number): SystemMapStagePlacement {
  const placement = asRecord(stageEntry);
  const stageId = stringValue(placement.stage_id ?? placement.id).trim();
  const local = vecValue(placement.pos);
  const stage = asRecord(stagesJson[stageId]);
  const width = numberValue(stage.width);
  const height = numberValue(stage.height);

  return {
    key: `zone-stage-${index}`,
    originalIndex: index,
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
  stagesJson: unknown,
  hazardBarrierProfilesJson: unknown,
  index: number,
): SystemMapMobSpawn {
  const spawn = asRecord(spawnEntry);
  const mobId = stringValue(spawn.mob_id ?? spawn.id).trim();
  const mob = mobCatalog.get(mobId) ?? {};
  const local = vecValue(spawn.pos);
  const world = addVec(zoneWorld, local);
  const spawnArea = asRecord(spawn.spawn_area);
  const spawnAreaPoints = vecArrayValue(spawnArea.points);
  const scene = stringValue(mob.scene, "");
  const sceneContents = scene ? parseSceneContents(gameRootPath, scene, world, mobCatalog, stagesJson, hazardBarrierProfilesJson) : { mobSpawns: [], barriers: [] };

  return {
    key: `zone-mob-${index}`,
    originalIndex: index,
    mobId,
    displayName: stringValue(mob.display_name ?? mob.name, mobId),
    local,
    world,
    count: numberValue(spawn.count, 1),
    radius: numberValue(spawn.radius),
    spawnArea: {
      shape: stringValue(spawnArea.shape, spawnAreaPoints.length ? "polygon" : "circle"),
      points: spawnAreaPoints,
      worldPoints: pointsFromAnchor(world, spawnAreaPoints),
    },
    respawnDelay: numberValue(spawn.respawn_delay),
    angleDeg: numberValue(spawn.angle_deg),
    levelMin: nullableNumberValue(spawn.level_min),
    levelMax: nullableNumberValue(spawn.level_max),
    level: nullableNumberValue(mob.level),
    rank: stringValue(spawn.rank, "normal"),
    faction: stringValue(mob.faction ?? asRecord(mob.meta).Faction, ""),
    sprite: stringValue(mob.sprite, ""),
    scene,
    missing: !mobCatalog.has(mobId),
    sceneSpawns: sceneContents.mobSpawns,
    sceneBarriers: sceneContents.barriers,
  };
}

function buildZones(gameRootPath: string, zonesJson: unknown, stagesJson: unknown, mobCatalog: Map<string, JsonRecord>, hazardBarrierProfilesJson: unknown): SystemMapZone[] {
  const stages = asRecord(stagesJson);
  return Object.entries(asRecord(zonesJson)).map(([id, rawZone]) => {
    const zone = asRecord(rawZone);
    const sector = vecValue(zone.sector_id);
    const local = vecValue(zone.pos);
    const world = worldFromSectorLocal(sector, local);
    const bounds = asRecord(zone.bounds);
    const boundsPoints = vecArrayValue(bounds.points);
    const boundsBox = pointBounds(boundsPoints);
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
        width: numberValue(bounds.width, boundsBox.width),
        height: numberValue(bounds.height, boundsBox.height),
        points: boundsPoints,
        worldPoints: pointsFromAnchor(world, boundsPoints),
      },
      stages: asArray(zone.stages).map((entry, index) => buildStagePlacement(entry, world, stages, index)),
      mobs: asArray(zone.mobs).map((entry, index) => buildMobSpawn(gameRootPath, entry, world, mobCatalog, stagesJson, hazardBarrierProfilesJson, index)),
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

function defaultRouteControlPoints(endpointA: SystemMapVec, endpointB: SystemMapVec, amplitudeFactor: number): SystemMapVec[] {
  const dx = endpointB.x - endpointA.x;
  const dy = endpointB.y - endpointA.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return [endpointA, endpointB];
  }
  const normal = {
    x: -dy / length,
    y: dx / length,
  };
  const amplitude = amplitudeFactor * length;
  return [
    {
      x: endpointA.x + dx * 0.33 + normal.x * amplitude,
      y: endpointA.y + dy * 0.33 + normal.y * amplitude,
    },
    {
      x: endpointA.x + dx * 0.66 - normal.x * amplitude,
      y: endpointA.y + dy * 0.66 - normal.y * amplitude,
    },
  ];
}

function buildRoutes(routesJson: unknown): SystemMapRoute[] {
  return asArray(asRecord(routesJson).routes).map((entry, index) => {
    const route = asRecord(entry);
    const id = stringValue(route.id, `route_${index + 1}`);
    const sector = vecValue(route.sector);
    const endpoints = asRecord(route.endpoints);
    const endpointA = asRecord(endpoints.a);
    const endpointB = asRecord(endpoints.b);
    const endpointAWorld = routePointToWorld(sector, endpointA);
    const endpointBWorld = routePointToWorld(sector, endpointB);
    const viaPoints = asArray(route.points).map((point) => routePointToWorld(sector, point));
    const explicitControlPoints = asArray(route.control_points).map((point) => routePointToWorld(sector, point));
    const smoothing = asRecord(route.smoothing);
    const sCurve = asRecord(route.s_curve);
    const controlPoints = explicitControlPoints.length >= 2 ? explicitControlPoints.slice(0, 2) : defaultRouteControlPoints(endpointAWorld, endpointBWorld, numberValue(sCurve.amplitude_factor, 0.3));
    const points = [endpointAWorld, ...viaPoints, endpointBWorld];

    return {
      id,
      name: stringValue(route.name, id),
      sector,
      width: numberValue(route.width, 750),
      speedMultiplier: numberValue(route.speed_multiplier, 2),
      color: stringValue(route.color, "#2F4558"),
      borderColor: stringValue(route.border_color, "#B0ECFE"),
      opacity: numberValue(route.opacity, 0.2),
      borderPx: numberValue(route.border_px, 0),
      smoothingTension: numberValue(smoothing.tension, 0.5),
      endpointAName: stringValue(endpointA.name, "Endpoint A"),
      endpointBName: stringValue(endpointB.name, "Endpoint B"),
      endpointA: endpointAWorld,
      endpointB: endpointBWorld,
      controlPoints,
      usesControlPoints: viaPoints.length === 0,
      viaPoints,
      points,
    };
  });
}

function normalizeAngleDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angleFromGate(gate: JsonRecord) {
  if (gate.angle_degrees !== undefined) return numberValue(gate.angle_degrees);
  if (gate.angle_radians !== undefined) return (numberValue(gate.angle_radians) * 180) / Math.PI;
  const worldPosition = vecValue(gate.world_position, { x: 0, y: 0 });
  if (Math.abs(worldPosition.x) > 0.001 || Math.abs(worldPosition.y) > 0.001) {
    return (Math.atan2(worldPosition.y, worldPosition.x) * 180) / Math.PI;
  }
  if (gate.x !== undefined || gate.y !== undefined) {
    const pos = {
      x: numberValue(gate.x),
      y: numberValue(gate.y),
    };
    if (Math.abs(pos.x) > 0.001 || Math.abs(pos.y) > 0.001) {
      return (Math.atan2(pos.y, pos.x) * 180) / Math.PI;
    }
  }
  return 0;
}

function gateWorldPosition(angleDegrees: number): SystemMapVec {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * ASTEROID_BELT_MID_RADIUS,
    y: Math.sin(radians) * ASTEROID_BELT_MID_RADIUS,
  };
}

function buildAsteroidBeltGates(gatesJson: unknown): SystemMapAsteroidBeltGate[] {
  const root = asRecord(gatesJson);
  const defaults = asRecord(root.defaults);
  const defaultWidth = numberValue(root.default_width_px ?? defaults.width_px, DEFAULT_ASTEROID_BELT_GATE_WIDTH);
  return asArray(root.gates).map((entry, index) => {
    const gate = asRecord(entry);
    const angleDegrees = normalizeAngleDegrees(angleFromGate(gate));
    const widthPx = Math.max(0, numberValue(gate.width_px, defaultWidth));
    const id = stringValue(gate.id, `gate_${index + 1}`);
    return {
      id,
      name: stringValue(gate.name, id),
      enabled: boolValue(gate.enabled, true),
      angleDegrees,
      widthPx,
      world: gateWorldPosition(angleDegrees),
      originalIndex: index,
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

  const [zonesResult, stagesResult, hazardBarrierProfilesResult, environmentalElementsResult, mobsResult, poiResult, regionsResult, routesResult, asteroidBeltGatesResult, itemsResult] = await Promise.all([
    loadDataFile(local.gameRootPath, "zones", "Zones.json"),
    loadDataFile(local.gameRootPath, "stages", "Stages.json"),
    loadDataFile(local.gameRootPath, "hazardBarrierProfiles", "HazardBarrierProfiles.json"),
    loadDataFile(local.gameRootPath, "environmentalElements", "EnvironmentalElements.json"),
    loadDataFile(local.gameRootPath, "mobs", "mobs.json"),
    loadDataFile(local.gameRootPath, "poi", "poi.json"),
    loadDataFile(local.gameRootPath, "regions", "regions.json"),
    loadDataFile(local.gameRootPath, "tradeRoutes", "trade_routes.json"),
    loadDataFile(local.gameRootPath, "asteroidBeltGates", "AsteroidBeltGates.json"),
    loadDataFile(local.gameRootPath, "items", "items.json"),
  ]);

  const warnings = [
    ...zonesResult.warnings,
    ...stagesResult.warnings,
    ...hazardBarrierProfilesResult.warnings,
    ...environmentalElementsResult.warnings,
    ...mobsResult.warnings,
    ...poiResult.warnings,
    ...regionsResult.warnings,
    ...routesResult.warnings,
    ...asteroidBeltGatesResult.warnings,
    ...itemsResult.warnings,
  ];

  const mobCatalog = buildMobCatalog(mobsResult.value);
  const zones = buildZones(local.gameRootPath, zonesResult.value, stagesResult.value, mobCatalog, hazardBarrierProfilesResult.value);
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
    stageCatalog: buildStageCatalogEntries(stagesResult.value),
    mobCatalog: buildMobCatalogEntries(mobsResult.value),
    pois: buildPois(poiResult.value, zones),
    routes: buildRoutes(routesResult.value),
    asteroidBeltGates: buildAsteroidBeltGates(asteroidBeltGatesResult.value),
    environmentProfiles: buildEnvironmentProfiles(hazardBarrierProfilesResult.value, stagesResult.value),
    environmentalElements: buildEnvironmentalElements(environmentalElementsResult.value, hazardBarrierProfilesResult.value, stagesResult.value),
    mineableOreItems: buildMineableOreItems(itemsResult.value),
    warnings,
  };

  return NextResponse.json(payload);
}
