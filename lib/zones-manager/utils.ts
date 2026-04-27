import {
  copySnippetWithKey,
  createDraftKey,
  createUniqueId,
  duplicateIdMap,
  objectWithoutKeys,
  parseExtraJsonObject,
} from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type {
  ZoneDraft,
  ZoneMobSpawnDraft,
  ZonesManagerSummary,
  ZonesManagerWorkspace,
  ZoneStagePlacementDraft,
  ZoneValidationIssue,
} from "@lib/zones-manager/types";

type JsonObject = Record<string, unknown>;

const ZONE_TOP_LEVEL_KEYS = [
  "name",
  "active",
  "show_hud_on_enter",
  "poi_map",
  "poi_hidden",
  "poi_label",
  "sector_id",
  "activation_radius",
  "activation_radius_border",
  "pos",
  "bounds",
  "stages",
  "mobs",
] as const;

const BOUNDS_KEYS = ["shape", "width", "height", "points"] as const;
const STAGE_KEYS = ["stage_id", "pos"] as const;
const MOB_KEYS = ["mob_id", "count", "radius", "spawn_area", "respawn_delay", "pos", "angle_deg", "level_min", "level_max", "rank"] as const;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function formatJsonObject(value: JsonObject) {
  return Object.keys(value).length ? JSON.stringify(value, null, 2) : "";
}

function toNumberString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function cleanObject<T extends JsonObject>(value: T) {
  const next: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (typeof entry === "string" && !entry.trim()) continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    if (entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) continue;
    next[key] = entry;
  }
  return next;
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePointList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        return { x: Number(entry[0]), y: Number(entry[1]) };
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const record = entry as JsonObject;
        return { x: Number(record.x), y: Number(record.y) };
      }
      return null;
    })
    .filter((point): point is { x: number; y: number } => !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function formatPointList(value: unknown) {
  const points = parsePointList(value);
  return points.length ? JSON.stringify(points.map((point) => [point.x, point.y]), null, 2) : "";
}

function parsePointListText(text: string, label: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = parseTolerantJsonText(trimmed);
  if (parsed.errors.length) {
    throw new Error(`${label}: ${parsed.errors.join(" ")}`);
  }
  if (!Array.isArray(parsed.value)) {
    throw new Error(`${label} must be a JSON array of [x, y] points.`);
  }
  return parsePointList(parsed.value);
}

function pointsToJsonArray(points: Array<{ x: number; y: number }>) {
  return points.map((point) => [Math.round(point.x), Math.round(point.y)]);
}

function createZoneStagePlacementDraft(value?: JsonObject): ZoneStagePlacementDraft {
  const pos = Array.isArray(value?.pos) ? value.pos : [];
  return {
    key: createDraftKey("zone-stage"),
    stageId: String(value?.stage_id ?? "").trim(),
    posX: toNumberString(pos[0]),
    posY: toNumberString(pos[1]),
    extraJson: formatJsonObject(objectWithoutKeys(value ?? {}, [...STAGE_KEYS])),
  };
}

function exportZoneStagePlacementDraft(draft: ZoneStagePlacementDraft) {
  return {
    stage_id: draft.stageId.trim(),
    pos: [parseNumber(draft.posX), parseNumber(draft.posY)],
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for zone stage "${draft.stageId || "untitled"}"`),
  };
}

function createZoneMobSpawnDraft(value?: JsonObject): ZoneMobSpawnDraft {
  const pos = Array.isArray(value?.pos) ? value.pos : [];
  const spawnArea = asObject(value?.spawn_area);
  return {
    key: createDraftKey("zone-mob"),
    mobId: String(value?.mob_id ?? "").trim(),
    count: toNumberString(value?.count),
    radius: toNumberString(value?.radius),
    spawnAreaShape: String(spawnArea.shape ?? "").trim(),
    spawnAreaPointsJson: formatPointList(spawnArea.points),
    respawnDelay: toNumberString(value?.respawn_delay),
    posX: toNumberString(pos[0]),
    posY: toNumberString(pos[1]),
    angleDeg: toNumberString(value?.angle_deg),
    levelMin: toNumberString(value?.level_min),
    levelMax: toNumberString(value?.level_max),
    rank: String(value?.rank ?? "").trim(),
    extraJson: formatJsonObject(objectWithoutKeys(value ?? {}, [...MOB_KEYS])),
  };
}

function exportZoneMobSpawnDraft(draft: ZoneMobSpawnDraft) {
  const spawnAreaPoints = parsePointListText(draft.spawnAreaPointsJson, `Spawn Area Points JSON for zone mob "${draft.mobId || "untitled"}"`);
  const spawnAreaShape = draft.spawnAreaShape.trim();
  return cleanObject({
    mob_id: draft.mobId.trim(),
    count: parseNumber(draft.count),
    radius: parseNumber(draft.radius),
    spawn_area:
      spawnAreaShape || spawnAreaPoints.length
        ? cleanObject({
            shape: spawnAreaShape || "polygon",
            points: spawnAreaPoints.length ? pointsToJsonArray(spawnAreaPoints) : undefined,
          })
        : undefined,
    respawn_delay: parseNumber(draft.respawnDelay),
    pos: [parseNumber(draft.posX), parseNumber(draft.posY)],
    angle_deg: parseNumber(draft.angleDeg),
    level_min: parseOptionalNumber(draft.levelMin),
    level_max: parseOptionalNumber(draft.levelMax),
    rank: draft.rank.trim(),
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for zone mob "${draft.mobId || "untitled"}"`),
  });
}

function createZoneDraft(id: string, record?: JsonObject): ZoneDraft {
  const sector = Array.isArray(record?.sector_id) ? record.sector_id : [0, 0];
  const pos = Array.isArray(record?.pos) ? record.pos : [0, 0];
  const bounds = asObject(record?.bounds);
  const stages = Array.isArray(record?.stages) ? record.stages : [];
  const mobs = Array.isArray(record?.mobs) ? record.mobs : [];

  return {
    key: createDraftKey("zone"),
    id,
    name: String(record?.name ?? "").trim(),
    active: Boolean(record?.active),
    showHudOnEnter: Boolean(record?.show_hud_on_enter),
    poiMap: Boolean(record?.poi_map),
    poiHidden: Boolean(record?.poi_hidden),
    poiLabel: String(record?.poi_label ?? "").trim(),
    sectorX: toNumberString(sector[0]),
    sectorY: toNumberString(sector[1]),
    posX: toNumberString(pos[0]),
    posY: toNumberString(pos[1]),
    activationRadius: toNumberString(record?.activation_radius),
    activationRadiusBorder: Boolean(record?.activation_radius_border),
    boundsShape: String(bounds.shape ?? "ellipse").trim(),
    boundsWidth: toNumberString(bounds.width),
    boundsHeight: toNumberString(bounds.height),
    boundsPointsJson: formatPointList(bounds.points),
    boundsExtraJson: formatJsonObject(objectWithoutKeys(bounds, [...BOUNDS_KEYS])),
    stages: stages.map((entry) => createZoneStagePlacementDraft(asObject(entry))),
    mobs: mobs.map((entry) => createZoneMobSpawnDraft(asObject(entry))),
    extraJson: formatJsonObject(objectWithoutKeys(record ?? {}, [...ZONE_TOP_LEVEL_KEYS])),
  };
}

function exportZoneDraft(draft: ZoneDraft) {
  const boundsPoints = parsePointListText(draft.boundsPointsJson, `Bounds Points JSON for zone "${draft.id || "untitled"}"`);
  return cleanObject({
    name: draft.name.trim(),
    active: draft.active,
    show_hud_on_enter: draft.showHudOnEnter,
    poi_map: draft.poiMap ? true : undefined,
    poi_hidden: draft.poiMap ? draft.poiHidden : undefined,
    poi_label: draft.poiLabel.trim() || undefined,
    sector_id: [parseNumber(draft.sectorX), parseNumber(draft.sectorY)],
    activation_radius: parseNumber(draft.activationRadius),
    activation_radius_border: draft.activationRadiusBorder,
    pos: [parseNumber(draft.posX), parseNumber(draft.posY)],
    bounds: cleanObject({
      shape: draft.boundsShape.trim() || "ellipse",
      width: parseNumber(draft.boundsWidth),
      height: parseNumber(draft.boundsHeight),
      points: boundsPoints.length ? pointsToJsonArray(boundsPoints) : undefined,
      ...parseExtraJsonObject(draft.boundsExtraJson, `Bounds Extra JSON for zone "${draft.id || "untitled"}"`),
    }),
    stages: draft.stages.map((entry) => exportZoneStagePlacementDraft(entry)),
    mobs: draft.mobs.map((entry) => exportZoneMobSpawnDraft(entry)),
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for zone "${draft.id || "untitled"}"`),
  });
}

export function createBlankZone(existingIds: string[] = []): ZoneDraft {
  const id = createUniqueId("new_zone", existingIds);
  return createZoneDraft(id, {
    name: "New Zone",
    active: true,
    show_hud_on_enter: true,
    poi_map: false,
    poi_hidden: false,
    sector_id: [0, 0],
    activation_radius: 50000,
    activation_radius_border: false,
    pos: [0, 0],
    bounds: {
      shape: "ellipse",
      width: 15000,
      height: 15000,
      points: [],
    },
    stages: [],
    mobs: [],
  });
}

export function createBlankZoneStagePlacement(): ZoneStagePlacementDraft {
  return createZoneStagePlacementDraft({
    stage_id: "",
    pos: [0, 0],
  });
}

export function createBlankZoneMobSpawn(): ZoneMobSpawnDraft {
  return createZoneMobSpawnDraft({
    mob_id: "",
    count: 1,
    radius: 0,
    spawn_area: {},
    respawn_delay: 30,
    pos: [0, 0],
    angle_deg: 0,
    rank: "normal",
  });
}

export function createBlankZonesWorkspace(): ZonesManagerWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    zones: [createBlankZone()],
  };
}

export function cloneZone(draft: ZoneDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("zone"),
    id: createUniqueId(`${draft.id || "zone"}_copy`, existingIds),
    stages: draft.stages.map((stage) => ({ ...stage, key: createDraftKey("zone-stage") })),
    mobs: draft.mobs.map((mob) => ({ ...mob, key: createDraftKey("zone-mob") })),
  };
}

export function importZonesManagerWorkspace(text: string | null, sourceLabel: string | null): ZonesManagerWorkspace {
  if (!text) return createBlankZonesWorkspace();

  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) {
    throw new Error(parsed.errors.join(" "));
  }

  const root = parsed.value as JsonObject;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("Zones.json must contain a top-level object.");
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    zones: Object.entries(root)
      .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => createZoneDraft(id, asObject(value))),
  };
}

export function stringifyZonesManagerWorkspace(workspace: ZonesManagerWorkspace) {
  const root = Object.fromEntries(workspace.zones.map((draft) => [draft.id.trim(), exportZoneDraft(draft)]));
  return JSON.stringify(root, null, 2);
}

export function stringifySingleZone(draft: ZoneDraft) {
  return copySnippetWithKey(draft.id.trim(), exportZoneDraft(draft));
}

function pushIssue(issues: ZoneValidationIssue[], issue: ZoneValidationIssue) {
  issues.push(issue);
}

function validateNumericField(issues: ZoneValidationIssue[], zoneKey: string, field: string, value: string, label: string, options?: { min?: number }) {
  const trimmed = value.trim();
  if (!trimmed) {
    pushIssue(issues, { level: "error", zoneKey, field, message: `${label} cannot be blank.` });
    return;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    pushIssue(issues, { level: "error", zoneKey, field, message: `${label} must be a valid number.` });
    return;
  }

  if (options?.min !== undefined && parsed < options.min) {
    pushIssue(issues, { level: "error", zoneKey, field, message: `${label} must be at least ${options.min}.` });
  }
}

function validateOptionalNumericField(issues: ZoneValidationIssue[], zoneKey: string, field: string, value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    pushIssue(issues, { level: "error", zoneKey, field, message: `${label} must be a valid number.` });
  }
}

export function validateZoneDrafts(
  zones: ZoneDraft[],
  references?: {
    stageIds?: Set<string>;
    mobIds?: Set<string>;
  },
) {
  const issues: ZoneValidationIssue[] = [];
  const duplicateIds = duplicateIdMap(zones.map((zone) => ({ id: zone.id, key: zone.key })));
  const supportedBounds = new Set(["ellipse", "rectangle", "rect", "polygon"]);

  for (const zone of zones) {
    const zoneLabel = zone.name.trim() || zone.id.trim() || "Untitled zone";
    if (!zone.id.trim()) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "id", message: "Zone ID cannot be blank." });
    } else if (duplicateIds.has(zone.id.trim())) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "id", message: `Zone ID "${zone.id.trim()}" is duplicated.` });
    }

    if (!zone.name.trim()) {
      pushIssue(issues, { level: "warning", zoneKey: zone.key, field: "name", message: `Zone "${zone.id || "untitled"}" is missing a display name.` });
    }

    validateNumericField(issues, zone.key, "sectorX", zone.sectorX, "Sector X");
    validateNumericField(issues, zone.key, "sectorY", zone.sectorY, "Sector Y");
    validateNumericField(issues, zone.key, "posX", zone.posX, "Zone Position X");
    validateNumericField(issues, zone.key, "posY", zone.posY, "Zone Position Y");
    validateNumericField(issues, zone.key, "activationRadius", zone.activationRadius, "Activation Radius", { min: 0 });
    validateNumericField(issues, zone.key, "boundsWidth", zone.boundsWidth, "Bounds Width", { min: 1 });
    validateNumericField(issues, zone.key, "boundsHeight", zone.boundsHeight, "Bounds Height", { min: 1 });

    if (!zone.boundsShape.trim()) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "boundsShape", message: "Bounds Shape cannot be blank." });
    } else if (!supportedBounds.has(zone.boundsShape.trim().toLowerCase())) {
      pushIssue(issues, {
        level: "warning",
        zoneKey: zone.key,
        field: "boundsShape",
        message: `Zone "${zoneLabel}" uses unsupported bounds shape "${zone.boundsShape}". The preview will approximate it as a rectangle.`,
      });
    }

    try {
      const boundsPoints = parsePointListText(zone.boundsPointsJson, `Bounds Points JSON for zone "${zone.id || "untitled"}"`);
      if (zone.boundsShape.trim().toLowerCase() === "polygon" && boundsPoints.length < 3) {
        pushIssue(issues, { level: "error", zoneKey: zone.key, field: "boundsPointsJson", message: `Zone "${zoneLabel}" polygon bounds need at least 3 points.` });
      }
    } catch (error) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "boundsPointsJson", message: error instanceof Error ? error.message : String(error) });
    }

    try {
      parseExtraJsonObject(zone.boundsExtraJson, `Bounds Extra JSON for zone "${zone.id || "untitled"}"`);
    } catch (error) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "boundsExtraJson", message: error instanceof Error ? error.message : String(error) });
    }

    try {
      parseExtraJsonObject(zone.extraJson, `Extra JSON for zone "${zone.id || "untitled"}"`);
    } catch (error) {
      pushIssue(issues, { level: "error", zoneKey: zone.key, field: "extraJson", message: error instanceof Error ? error.message : String(error) });
    }

    if (!zone.stages.length && !zone.mobs.length) {
      pushIssue(issues, {
        level: "warning",
        zoneKey: zone.key,
        field: "contents",
        message: `Zone "${zoneLabel}" has no stages or mobs configured yet.`,
      });
    }

    zone.stages.forEach((stage, index) => {
      const itemLabel = stage.stageId.trim() || `Stage #${index + 1}`;
      if (!stage.stageId.trim()) {
        pushIssue(issues, { level: "error", zoneKey: zone.key, field: `stage:${stage.key}:stageId`, message: `Zone "${zoneLabel}" has a stage placement with no stage ID.` });
      } else if (references?.stageIds && !references.stageIds.has(stage.stageId.trim())) {
        pushIssue(issues, {
          level: "warning",
          zoneKey: zone.key,
          field: `stage:${stage.key}:stageId`,
          message: `Zone "${zoneLabel}" references unknown stage "${stage.stageId}".`,
        });
      }

      validateNumericField(issues, zone.key, `stage:${stage.key}:posX`, stage.posX, `${itemLabel} Position X`);
      validateNumericField(issues, zone.key, `stage:${stage.key}:posY`, stage.posY, `${itemLabel} Position Y`);

      try {
        parseExtraJsonObject(stage.extraJson, `Extra JSON for zone stage "${stage.stageId || "untitled"}"`);
      } catch (error) {
        pushIssue(issues, {
          level: "error",
          zoneKey: zone.key,
          field: `stage:${stage.key}:extraJson`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    zone.mobs.forEach((mob, index) => {
      const itemLabel = mob.mobId.trim() || `Mob #${index + 1}`;
      if (!mob.mobId.trim()) {
        pushIssue(issues, { level: "error", zoneKey: zone.key, field: `mob:${mob.key}:mobId`, message: `Zone "${zoneLabel}" has a mob spawn with no mob ID.` });
      } else if (references?.mobIds && !references.mobIds.has(mob.mobId.trim())) {
        pushIssue(issues, {
          level: "warning",
          zoneKey: zone.key,
          field: `mob:${mob.key}:mobId`,
          message: `Zone "${zoneLabel}" references unknown mob "${mob.mobId}".`,
        });
      }

      validateNumericField(issues, zone.key, `mob:${mob.key}:count`, mob.count, `${itemLabel} Count`, { min: 0 });
      validateNumericField(issues, zone.key, `mob:${mob.key}:radius`, mob.radius, `${itemLabel} Radius`, { min: 0 });
      validateNumericField(issues, zone.key, `mob:${mob.key}:respawnDelay`, mob.respawnDelay, `${itemLabel} Respawn Delay`, { min: 0 });
      validateNumericField(issues, zone.key, `mob:${mob.key}:posX`, mob.posX, `${itemLabel} Position X`);
      validateNumericField(issues, zone.key, `mob:${mob.key}:posY`, mob.posY, `${itemLabel} Position Y`);
      validateNumericField(issues, zone.key, `mob:${mob.key}:angleDeg`, mob.angleDeg, `${itemLabel} Angle`);
      validateOptionalNumericField(issues, zone.key, `mob:${mob.key}:levelMin`, mob.levelMin, `${itemLabel} Level Min`);
      validateOptionalNumericField(issues, zone.key, `mob:${mob.key}:levelMax`, mob.levelMax, `${itemLabel} Level Max`);

      try {
        const spawnAreaPoints = parsePointListText(mob.spawnAreaPointsJson, `Spawn Area Points JSON for zone mob "${mob.mobId || "untitled"}"`);
        if (mob.spawnAreaShape.trim().toLowerCase() === "polygon" && spawnAreaPoints.length < 3) {
          pushIssue(issues, { level: "error", zoneKey: zone.key, field: `mob:${mob.key}:spawnAreaPointsJson`, message: `${itemLabel} polygon spawn area needs at least 3 points.` });
        }
      } catch (error) {
        pushIssue(issues, {
          level: "error",
          zoneKey: zone.key,
          field: `mob:${mob.key}:spawnAreaPointsJson`,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const levelMin = parseOptionalNumber(mob.levelMin);
      const levelMax = parseOptionalNumber(mob.levelMax);
      if (levelMin !== undefined && levelMax !== undefined && levelMin > levelMax) {
        pushIssue(issues, {
          level: "warning",
          zoneKey: zone.key,
          field: `mob:${mob.key}:levels`,
          message: `${itemLabel} has Level Min above Level Max in zone "${zoneLabel}".`,
        });
      }

      try {
        parseExtraJsonObject(mob.extraJson, `Extra JSON for zone mob "${mob.mobId || "untitled"}"`);
      } catch (error) {
        pushIssue(issues, {
          level: "error",
          zoneKey: zone.key,
          field: `mob:${mob.key}:extraJson`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  return issues;
}

export function summarizeZonesManagerWorkspace(workspace: ZonesManagerWorkspace | null, issues: ZoneValidationIssue[]): ZonesManagerSummary {
  const zones = workspace?.zones ?? [];
  return {
    totalZones: zones.length,
    activeZones: zones.filter((zone) => zone.active).length,
    poiZones: zones.filter((zone) => zone.poiMap).length,
    totalStagePlacements: zones.reduce((total, zone) => total + zone.stages.length, 0),
    totalMobPlacements: zones.reduce((total, zone) => total + zone.mobs.length, 0),
    errorCount: new Set(issues.filter((issue) => issue.level === "error").map((issue) => issue.zoneKey)).size,
    warningCount: new Set(issues.filter((issue) => issue.level === "warning").map((issue) => issue.zoneKey)).size,
  };
}
