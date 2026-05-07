import { execFile } from "child_process";
import fsp from "fs/promises";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { GeneratedAreaArtifacts, GeneratedAreaEntry, GeneratedAreaMissionArtifact, GeneratedAreasWorkspace, JsonObject } from "@lib/generated-areas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const GENERATED_AREA_PATHS = {
  requests: path.join("data", "generated", "areas", "GeneratedAreaRequests.json"),
  stagedZones: path.join("data", "generated", "zones", "generated_areas.json"),
  stagedComms: path.join("data", "generated", "comms", "generated_areas_comms.json"),
  stagedMobs: path.join("data", "generated", "mobs", "generated_area_mobs.json"),
  stagedMissions: path.join("scripts", "system", "missions", "missions", "generated", "generated_areas"),
  coreZones: path.join("data", "database", "zones", "generated_areas.json"),
  coreComms: path.join("data", "database", "comms", "generated_areas_comms.json"),
  coreMobs: path.join("data", "database", "mobs", "generated_area_mobs.json"),
  coreMissions: path.join("scripts", "system", "missions", "missions", "generated_areas"),
  stages: path.join("data", "database", "stages", "Stages.json"),
  generatorScript: path.join("scripts", "tools", "generated_areas", "generate_generated_areas.gd"),
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function gamePath(gameRoot: string, relativePath: string) {
  return path.join(gameRoot, relativePath);
}

async function pathExists(filePath: string) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string, fallback: unknown = {}) {
  try {
    const text = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`, "utf-8");
}

async function readNamedDictionary(filePath: string, rootKey: string): Promise<Record<string, JsonObject>> {
  const root = asObject(await readJson(filePath, {}));
  const hasNamedRoot = Object.prototype.hasOwnProperty.call(root, rootKey) && !!root[rootKey] && typeof root[rootKey] === "object" && !Array.isArray(root[rootKey]);
  const values = hasNamedRoot ? asObject(root[rootKey]) : root;
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, JsonObject] => !!entry[1] && typeof entry[1] === "object" && !Array.isArray(entry[1])));
}

async function writeNamedDictionary(filePath: string, rootKey: string, values: Record<string, JsonObject>) {
  await writeJson(filePath, { [rootKey]: values });
}

function extractMobArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject).filter((entry) => Object.keys(entry).length);
  return asArray(asObject(value).mobs).map(asObject).filter((entry) => Object.keys(entry).length);
}

async function readMobArray(filePath: string): Promise<JsonObject[]> {
  return extractMobArray(await readJson(filePath, { mobs: [] }));
}

async function writeMobArray(filePath: string, mobs: JsonObject[]) {
  await writeJson(filePath, { mobs });
}

function contentBelongsToArea(contentId: string, areaId: string) {
  const content = contentId.trim();
  const area = areaId.trim();
  if (!content || !area) return false;
  return content === area || content.startsWith(`${area}_`) || content.includes(area);
}

async function readMissionFiles(dirPath: string): Promise<GeneratedAreaMissionArtifact[]> {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const missions: GeneratedAreaMissionArtifact[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const data = asObject(await readJson(path.join(dirPath, entry.name), {}));
      if (!Object.keys(data).length) continue;
      const id = stringValue(data.id, entry.name.replace(/\.json$/, ""));
      missions.push({
        id,
        title: stringValue(data.title, id),
        fileName: entry.name,
        data,
      });
    }
    return missions.sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

async function deleteMatchingMissionFiles(dirPath: string, areaId: string) {
  const missions = await readMissionFiles(dirPath);
  for (const mission of missions) {
    if (!contentBelongsToArea(mission.id, areaId)) continue;
    await fsp.rm(path.join(dirPath, mission.fileName), { force: true });
  }
}

function requestAreas(root: JsonObject): JsonObject[] {
  return asArray(root.areas).map(asObject).filter((entry) => stringValue(entry.id).trim());
}

function upsertAreaRequest(root: JsonObject, request: JsonObject) {
  const areaId = stringValue(request.id).trim();
  if (!areaId) throw new Error("Generated area request ID is required.");
  const areas = requestAreas(root);
  const index = areas.findIndex((entry) => stringValue(entry.id).trim() === areaId);
  if (index >= 0) {
    areas[index] = { ...areas[index], ...request, id: areaId };
  } else {
    areas.push({ ...request, id: areaId });
  }
  root.areas = areas;
}

function removeAreaRequest(root: JsonObject, areaId: string) {
  root.areas = requestAreas(root).filter((entry) => stringValue(entry.id).trim() !== areaId);
}

function setAreaRequestStatus(root: JsonObject, areaId: string, status: string, extra: JsonObject = {}) {
  const areas = requestAreas(root);
  const index = areas.findIndex((entry) => stringValue(entry.id).trim() === areaId);
  if (index < 0) throw new Error(`Generated area request "${areaId}" was not found.`);
  areas[index] = { ...areas[index], ...extra, status };
  root.areas = areas;
}

async function writeRequests(gameRoot: string, root: JsonObject) {
  await writeJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { ...root, areas: requestAreas(root) });
}

function matchingDictionary(values: Record<string, JsonObject>, areaId: string) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => contentBelongsToArea(id, areaId)));
}

function withoutMatchingDictionary(values: Record<string, JsonObject>, areaId: string) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => !contentBelongsToArea(id, areaId)));
}

function matchingMobs(mobs: JsonObject[], areaId: string) {
  return mobs.filter((mob) => contentBelongsToArea(stringValue(mob.id), areaId));
}

function withoutMatchingMobs(mobs: JsonObject[], areaId: string) {
  return mobs.filter((mob) => !contentBelongsToArea(stringValue(mob.id), areaId));
}

function matchingMissions(missions: GeneratedAreaMissionArtifact[], areaId: string) {
  return missions.filter((mission) => contentBelongsToArea(mission.id, areaId));
}

function artifactsForArea(zoneValues: Record<string, JsonObject>, contacts: Record<string, JsonObject>, mobs: JsonObject[], missions: GeneratedAreaMissionArtifact[], areaId: string): GeneratedAreaArtifacts {
  return {
    zone: zoneValues[areaId] ?? matchingDictionary(zoneValues, areaId)[areaId] ?? null,
    contacts: matchingDictionary(contacts, areaId),
    mobs: matchingMobs(mobs, areaId),
    missions: matchingMissions(missions, areaId),
  };
}

function hasArtifacts(artifacts: GeneratedAreaArtifacts) {
  return !!artifacts.zone || Object.keys(artifacts.contacts).length > 0 || artifacts.mobs.length > 0 || artifacts.missions.length > 0;
}

async function loadStageCatalog(gameRoot: string) {
  const stages = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.stages), {}));
  return Object.entries(stages)
    .map(([id, raw]) => {
      const stage = asObject(raw);
      return {
        id,
        name: stringValue(stage.name, id),
        shape: stringValue(stage.shape, ""),
        width: numberValue(stage.width),
        height: numberValue(stage.height),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function loadWorkspace(gameRoot: string, warnings: string[] = []): Promise<GeneratedAreasWorkspace> {
  const requestRoot = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { areas: [] }));
  const stagedZones = await readNamedDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.stagedZones), "zones");
  const stagedComms = await readNamedDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.stagedComms), "contacts");
  const stagedMobs = await readMobArray(gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMobs));
  const stagedMissions = await readMissionFiles(gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMissions));
  const coreZones = await readNamedDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.coreZones), "zones");
  const coreComms = await readNamedDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.coreComms), "contacts");
  const coreMobs = await readMobArray(gamePath(gameRoot, GENERATED_AREA_PATHS.coreMobs));
  const coreMissions = await readMissionFiles(gamePath(gameRoot, GENERATED_AREA_PATHS.coreMissions));
  const areas = requestAreas(requestRoot);
  const areaIds = new Set<string>(areas.map((entry) => stringValue(entry.id).trim()));
  for (const zoneId of [...Object.keys(stagedZones), ...Object.keys(coreZones)]) areaIds.add(zoneId);

  const entries: GeneratedAreaEntry[] = Array.from(areaIds)
    .sort((left, right) => left.localeCompare(right))
    .map((areaId) => {
      const request = areas.find((entry) => stringValue(entry.id).trim() === areaId) ?? { id: areaId, status: "draft" };
      const staged = artifactsForArea(stagedZones, stagedComms, stagedMobs, stagedMissions, areaId);
      const core = artifactsForArea(coreZones, coreComms, coreMobs, coreMissions, areaId);
      const zone = staged.zone ?? core.zone ?? {};
      const name = stringValue(request.name, stringValue(zone.name, areaId));
      return {
        id: areaId,
        name,
        archetype: stringValue(request.archetype, stringValue(zone.archetype, "")),
        status: stringValue(request.status, "draft").toLowerCase(),
        request,
        staged,
        core,
        hasStagedContent: hasArtifacts(staged),
        hasCoreContent: hasArtifacts(core),
      };
    });

  return {
    ok: true,
    sourceRoot: gameRoot,
    generatedAt: new Date().toISOString(),
    paths: Object.fromEntries(Object.entries(GENERATED_AREA_PATHS).map(([key, relativePath]) => [key, gamePath(gameRoot, relativePath)])),
    entries,
    stageCatalog: await loadStageCatalog(gameRoot),
    summary: {
      requestCount: areas.length,
      draftCount: entries.filter((entry) => entry.status === "draft").length,
      approvedCount: entries.filter((entry) => entry.status === "approved").length,
      promotedCount: entries.filter((entry) => entry.status === "promoted").length,
      stagedAreaCount: entries.filter((entry) => entry.hasStagedContent).length,
      coreAreaCount: entries.filter((entry) => entry.hasCoreContent).length,
    },
    warnings,
  };
}

async function applySubmittedEdits(gameRoot: string, body: JsonObject) {
  const areaId = stringValue(body.areaId).trim();
  if (!areaId) throw new Error("Generated area ID is required.");
  const request = asObject(body.request);
  const zone = asObject(body.zone);
  const zoneTarget = stringValue(body.zoneTarget, "staged") === "core" ? "core" : "staged";

  if (Object.keys(request).length) {
    const requestRoot = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { areas: [] }));
    upsertAreaRequest(requestRoot, { ...request, id: areaId });
    await writeRequests(gameRoot, requestRoot);
  }

  if (Object.keys(zone).length) {
    const zonePath = gamePath(gameRoot, zoneTarget === "core" ? GENERATED_AREA_PATHS.coreZones : GENERATED_AREA_PATHS.stagedZones);
    const zones = await readNamedDictionary(zonePath, "zones");
    zones[areaId] = zone;
    await writeNamedDictionary(zonePath, "zones", zones);
  }
}

async function approveArea(gameRoot: string, areaId: string) {
  const requestRoot = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { areas: [] }));
  setAreaRequestStatus(requestRoot, areaId, "approved");
  await writeRequests(gameRoot, requestRoot);
}

async function promoteArea(gameRoot: string, areaId: string) {
  const stagedZonesPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedZones);
  const stagedCommsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedComms);
  const stagedMobsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMobs);
  const coreZonesPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreZones);
  const coreCommsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreComms);
  const coreMobsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreMobs);
  const stagedMissionDir = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMissions);
  const coreMissionDir = gamePath(gameRoot, GENERATED_AREA_PATHS.coreMissions);
  const stagedZones = await readNamedDictionary(stagedZonesPath, "zones");
  const stagedComms = await readNamedDictionary(stagedCommsPath, "contacts");
  const stagedMobs = await readMobArray(stagedMobsPath);
  const stagedMissions = await readMissionFiles(stagedMissionDir);
  const promotedZones = matchingDictionary(stagedZones, areaId);
  const promotedComms = matchingDictionary(stagedComms, areaId);
  const promotedMobs = matchingMobs(stagedMobs, areaId);
  const promotedMissions = matchingMissions(stagedMissions, areaId);
  if (!Object.keys(promotedZones).length && !Object.keys(promotedComms).length && !promotedMobs.length && !promotedMissions.length) {
    throw new Error(`No staged generated content was found for "${areaId}".`);
  }

  const coreZones = await readNamedDictionary(coreZonesPath, "zones");
  const coreComms = await readNamedDictionary(coreCommsPath, "contacts");
  const coreMobsById = new Map((await readMobArray(coreMobsPath)).map((mob) => [stringValue(mob.id), mob]));
  for (const [id, zone] of Object.entries(promotedZones)) coreZones[id] = zone;
  for (const [id, contact] of Object.entries(promotedComms)) coreComms[id] = contact;
  for (const mob of promotedMobs) {
    const mobId = stringValue(mob.id).trim();
    if (mobId) coreMobsById.set(mobId, mob);
  }
  await writeNamedDictionary(coreZonesPath, "zones", coreZones);
  await writeNamedDictionary(coreCommsPath, "contacts", coreComms);
  await writeMobArray(coreMobsPath, Array.from(coreMobsById.values()));
  await fsp.mkdir(coreMissionDir, { recursive: true });
  for (const mission of promotedMissions) {
    await writeJson(path.join(coreMissionDir, `${mission.id}.json`), mission.data);
    await fsp.rm(path.join(stagedMissionDir, mission.fileName), { force: true });
  }

  await writeNamedDictionary(stagedZonesPath, "zones", withoutMatchingDictionary(stagedZones, areaId));
  await writeNamedDictionary(stagedCommsPath, "contacts", withoutMatchingDictionary(stagedComms, areaId));
  await writeMobArray(stagedMobsPath, withoutMatchingMobs(stagedMobs, areaId));
  const requestRoot = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { areas: [] }));
  setAreaRequestStatus(requestRoot, areaId, "promoted", { promoted_at: new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "") });
  await writeRequests(gameRoot, requestRoot);
}

async function rejectArea(gameRoot: string, areaId: string) {
  const stagedZonesPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedZones);
  const stagedCommsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedComms);
  const stagedMobsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMobs);
  const coreZonesPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreZones);
  const coreCommsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreComms);
  const coreMobsPath = gamePath(gameRoot, GENERATED_AREA_PATHS.coreMobs);
  await writeNamedDictionary(stagedZonesPath, "zones", withoutMatchingDictionary(await readNamedDictionary(stagedZonesPath, "zones"), areaId));
  await writeNamedDictionary(stagedCommsPath, "contacts", withoutMatchingDictionary(await readNamedDictionary(stagedCommsPath, "contacts"), areaId));
  await writeMobArray(stagedMobsPath, withoutMatchingMobs(await readMobArray(stagedMobsPath), areaId));
  await writeNamedDictionary(coreZonesPath, "zones", withoutMatchingDictionary(await readNamedDictionary(coreZonesPath, "zones"), areaId));
  await writeNamedDictionary(coreCommsPath, "contacts", withoutMatchingDictionary(await readNamedDictionary(coreCommsPath, "contacts"), areaId));
  await writeMobArray(coreMobsPath, withoutMatchingMobs(await readMobArray(coreMobsPath), areaId));
  await deleteMatchingMissionFiles(gamePath(gameRoot, GENERATED_AREA_PATHS.stagedMissions), areaId);
  await deleteMatchingMissionFiles(gamePath(gameRoot, GENERATED_AREA_PATHS.coreMissions), areaId);
  const requestRoot = asObject(await readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.requests), { areas: [] }));
  removeAreaRequest(requestRoot, areaId);
  await writeRequests(gameRoot, requestRoot);
}

async function runGenerator(gameRoot: string) {
  const scriptPath = gamePath(gameRoot, GENERATED_AREA_PATHS.generatorScript);
  if (!(await pathExists(scriptPath))) throw new Error("Generated areas generator script was not found in the configured game root.");
  const candidates = [process.env.GODOT_BIN, "godot", "godot4"].filter((value): value is string => !!value);
  let lastError = "";
  for (const command of candidates) {
    try {
      const result = await execFileAsync(command, ["--headless", "--script", GENERATED_AREA_PATHS.generatorScript], { cwd: gameRoot, timeout: 120000 });
      return `${result.stdout}${result.stderr}`.trim();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Could not run Godot generated area generator. ${lastError}`);
}

function localUnavailableResponse() {
  return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
}

export async function GET() {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data || !local.available.missions) return localUnavailableResponse();
  return NextResponse.json(await loadWorkspace(local.gameRootPath));
}

export async function POST(req: NextRequest) {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data || !local.available.missions) return localUnavailableResponse();
  try {
    const body = asObject(await req.json().catch(() => ({})));
    const action = stringValue(body.action).trim();
    const areaId = stringValue(body.areaId).trim();
    if (action !== "generate") {
      if (!areaId) return NextResponse.json({ ok: false, error: "Generated area ID is required." }, { status: 400 });
      await applySubmittedEdits(local.gameRootPath, body);
    }

    if (action === "save") {
      return NextResponse.json({ ok: true, message: `Saved generated area "${areaId}".`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "approve") {
      await approveArea(local.gameRootPath, areaId);
      return NextResponse.json({ ok: true, message: `Approved "${areaId}" for promotion.`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "promote") {
      await approveArea(local.gameRootPath, areaId);
      await promoteArea(local.gameRootPath, areaId);
      return NextResponse.json({ ok: true, message: `Promoted "${areaId}" into core generated area files.`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "reject") {
      await rejectArea(local.gameRootPath, areaId);
      return NextResponse.json({ ok: true, message: `Rejected and deleted generated area "${areaId}".`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "generate") {
      const output = await runGenerator(local.gameRootPath);
      return NextResponse.json({ ok: true, message: output || "Generated area staging files refreshed.", workspace: await loadWorkspace(local.gameRootPath) });
    }
    return NextResponse.json({ ok: false, error: `Unsupported generated area action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
