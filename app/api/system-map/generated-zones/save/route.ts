import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

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

function vecArray(value: unknown) {
  const point = asRecord(value);
  return [Math.round(numberValue(point.x)), Math.round(numberValue(point.y))];
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readJson(filePath: string, fallback: unknown) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf-8")) as unknown;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`, "utf-8");
}

function generatedZonesRoot(value: unknown) {
  const root = asRecord(value);
  const zones = isRecord(root.zones) ? asRecord(root.zones) : root;
  return { root, zones };
}

function stageToJson(stageValue: unknown, existing: unknown) {
  const stage = asRecord(stageValue);
  return {
    ...asRecord(existing),
    stage_id: stringValue(stage.stageId),
    pos: vecArray(stage.local),
  };
}

function mobToJson(mobValue: unknown, existing: unknown) {
  const mob = asRecord(mobValue);
  const next: JsonRecord = {
    ...asRecord(existing),
    mob_id: stringValue(mob.mobId),
    count: numberValue(mob.count, 1),
    pos: vecArray(mob.local),
    radius: numberValue(mob.radius),
    respawn_delay: numberValue(mob.respawnDelay),
    angle_deg: numberValue(mob.angleDeg),
    rank: stringValue(mob.rank, "normal"),
  };
  const levelMin = nullableNumber(mob.levelMin);
  const levelMax = nullableNumber(mob.levelMax);
  if (levelMin === undefined) delete next.level_min;
  else next.level_min = levelMin;
  if (levelMax === undefined) delete next.level_max;
  else next.level_max = levelMax;
  const spawnArea = asRecord(mob.spawnArea);
  const spawnAreaPoints = asArray(spawnArea.points);
  if (stringValue(spawnArea.shape).toLowerCase() === "polygon" && spawnAreaPoints.length) {
    next.spawn_area = {
      ...asRecord(next.spawn_area),
      shape: "polygon",
      points: spawnAreaPoints.map(vecArray),
    };
  } else if (next.spawn_area && isRecord(next.spawn_area)) {
    const existingSpawnArea = { ...asRecord(next.spawn_area) };
    delete existingSpawnArea.points;
    if (Object.keys(existingSpawnArea).length) next.spawn_area = existingSpawnArea;
    else delete next.spawn_area;
  }
  return next;
}

function patchGeneratedZone(existingValue: unknown, zoneValue: unknown) {
  const existing = asRecord(existingValue);
  const zone = asRecord(zoneValue);
  const bounds = asRecord(zone.bounds);
  const existingBounds = asRecord(existing.bounds);
  return {
    ...existing,
    name: stringValue(zone.name, stringValue(existing.name)),
    active: boolValue(zone.active, boolValue(existing.active)),
    show_hud_on_enter: boolValue(zone.showHudOnEnter, boolValue(existing.show_hud_on_enter)),
    poi_map: boolValue(zone.poiMap, boolValue(existing.poi_map)),
    poi_hidden: boolValue(zone.poiHidden, boolValue(existing.poi_hidden)),
    ...(stringValue(zone.poiLabel).trim() ? { poi_label: stringValue(zone.poiLabel).trim() } : {}),
    sector_id: vecArray(zone.sector),
    pos: vecArray(zone.local),
    activation_radius: numberValue(zone.activationRadius, numberValue(existing.activation_radius)),
    activation_radius_border: boolValue(zone.activationRadiusBorder, boolValue(existing.activation_radius_border)),
    bounds: {
      ...existingBounds,
      shape: stringValue(bounds.shape, stringValue(existingBounds.shape, "ellipse")),
      width: numberValue(bounds.width, numberValue(existingBounds.width)),
      height: numberValue(bounds.height, numberValue(existingBounds.height)),
      ...(asArray(bounds.points).length ? { points: asArray(bounds.points).map(vecArray) } : {}),
    },
    stages: asArray(zone.stages).map((stage, index) => stageToJson(stage, asArray(existing.stages)[numberValue(asRecord(stage).originalIndex, index)])),
    mobs: asArray(zone.mobs).map((mob, index) => mobToJson(mob, asArray(existing.mobs)[numberValue(asRecord(mob).originalIndex, index)])),
  };
}

export async function POST(req: NextRequest) {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = asRecord(await req.json().catch(() => ({})));
    const zonesForSave = asArray(body.zones).map(asRecord);
    if (!zonesForSave.length) {
      return NextResponse.json({ ok: false, error: "At least one generated zone is required." }, { status: 400 });
    }

    const zonesPath = path.join(local.gameRootPath, "data", "database", "zones", "generated_areas.json");
    const parsed = await readJson(zonesPath, { zones: {} });
    const { root, zones } = generatedZonesRoot(parsed);
    for (const zone of zonesForSave) {
      const originalId = stringValue(zone.originalId, stringValue(zone.id)).trim();
      const id = stringValue(zone.id).trim();
      if (!originalId || !id) throw new Error("Generated zone ID is required.");
      if (id !== originalId) throw new Error(`Generated zone IDs cannot be renamed from the system map. Keep "${originalId}" as the ID.`);
      if (!isRecord(zones[originalId])) throw new Error(`Generated zone "${originalId}" was not found in generated_areas.json.`);
      zones[originalId] = patchGeneratedZone(zones[originalId], zone);
    }

    await writeJson(zonesPath, { ...root, zones });
    return NextResponse.json({ ok: true, savedPath: zonesPath, savedCount: zonesForSave.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
