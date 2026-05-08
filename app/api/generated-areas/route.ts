import { randomBytes } from "crypto";
import type { Dirent } from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { GeneratedAreaArtifacts, GeneratedAreaEntry, GeneratedAreaMissionArtifact, GeneratedAreasWorkspace, JsonObject } from "@lib/generated-areas/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERATED_AREA_PATHS = {
  zones: path.join("data", "database", "zones", "Zones.json"),
  comms: path.join("data", "database", "comms", "Comms.json"),
  mobs: path.join("data", "database", "mobs", "mobs.json"),
  stages: path.join("data", "database", "stages", "Stages.json"),
  items: path.join("data", "database", "items", "items.json"),
  missions: path.join("scripts", "system", "missions", "missions"),
};

type MissionFileArtifact = GeneratedAreaMissionArtifact & {
  absolutePath: string;
};

type CoreGeneratedArtifacts = GeneratedAreaArtifacts & {
  stageDefinitions: Record<string, JsonObject>;
};

type CoreFiles = {
  zones: Record<string, JsonObject>;
  stages: Record<string, JsonObject>;
  comms: Record<string, JsonObject>;
  mobs: JsonObject[];
  missions: MissionFileArtifact[];
  items: JsonObject[];
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cloneObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
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

function gamePath(gameRoot: string, relativePath: string) {
  return path.join(gameRoot, relativePath);
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

function namedDictionary(value: unknown, rootKey?: string): Record<string, JsonObject> {
  const root = asObject(value);
  const source = rootKey && root[rootKey] && typeof root[rootKey] === "object" && !Array.isArray(root[rootKey]) ? asObject(root[rootKey]) : root;
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, JsonObject] => !!entry[1] && typeof entry[1] === "object" && !Array.isArray(entry[1])));
}

async function readDictionary(filePath: string, rootKey?: string): Promise<Record<string, JsonObject>> {
  return namedDictionary(await readJson(filePath, {}), rootKey);
}

function mobArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject).filter((entry) => Object.keys(entry).length);
  return asArray(asObject(value).mobs).map(asObject).filter((entry) => Object.keys(entry).length);
}

async function readMobArray(filePath: string): Promise<JsonObject[]> {
  return mobArray(await readJson(filePath, { mobs: [] }));
}

function itemArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject).filter((entry) => Object.keys(entry).length);
  const root = asObject(value);
  if (Array.isArray(root.items)) return root.items.map(asObject).filter((entry) => Object.keys(entry).length);
  return Object.values(root).map(asObject).filter((entry) => Object.keys(entry).length);
}

async function readMissionFiles(dirPath: string): Promise<MissionFileArtifact[]> {
  const missions: MissionFileArtifact[] = [];

  async function visit(currentDir: string) {
    let entries: Dirent[];
    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const data = asObject(await readJson(entryPath, {}));
      if (!Object.keys(data).length) continue;
      const id = stringValue(data.id, entry.name.replace(/\.json$/, ""));
      missions.push({
        id,
        title: stringValue(data.title, id),
        fileName: path.relative(dirPath, entryPath),
        absolutePath: entryPath,
        data,
      });
    }
  }

  await visit(dirPath);
  return missions.sort((left, right) => left.id.localeCompare(right.id));
}

async function readCoreFiles(gameRoot: string): Promise<CoreFiles> {
  const [zones, stages, comms, mobs, missions, items] = await Promise.all([
    readDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.zones)),
    readDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.stages)),
    readDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.comms), "contacts"),
    readMobArray(gamePath(gameRoot, GENERATED_AREA_PATHS.mobs)),
    readMissionFiles(gamePath(gameRoot, GENERATED_AREA_PATHS.missions)),
    readJson(gamePath(gameRoot, GENERATED_AREA_PATHS.items), []),
  ]);
  return { zones, stages, comms, mobs, missions, items: itemArray(items) };
}

async function writeCoreFiles(gameRoot: string, files: Pick<CoreFiles, "zones" | "stages" | "comms" | "mobs">) {
  await Promise.all([
    writeJson(gamePath(gameRoot, GENERATED_AREA_PATHS.zones), files.zones),
    writeJson(gamePath(gameRoot, GENERATED_AREA_PATHS.stages), files.stages),
    writeJson(gamePath(gameRoot, GENERATED_AREA_PATHS.comms), files.comms),
    writeJson(gamePath(gameRoot, GENERATED_AREA_PATHS.mobs), files.mobs),
  ]);
}

function generatedIdFor(value: unknown) {
  const object = asObject(value);
  return stringValue(object.generated_id, stringValue(asObject(object.meta).generated_id)).trim();
}

function generatedMatches(value: unknown, areaId: string) {
  return generatedIdFor(value) === areaId;
}

function contentBelongsToArea(contentId: string, areaId: string) {
  const content = contentId.trim();
  const area = areaId.trim();
  return !!content && !!area && (content === area || content.startsWith(`${area}_`) || content.startsWith(`mission.generated.${area}.`));
}

function slugify(value: string, fallback = "generated_area") {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback
  );
}

function randomSuffix() {
  return randomBytes(4).toString("hex");
}

function uniqueId(base: string, existingIds: Set<string>) {
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  existingIds.add(id);
  return id;
}

function generatedAreaIdFromRequest(request: JsonObject, existingIds: Set<string>) {
  const requested = stringValue(request.id).trim();
  if (requested && !existingIds.has(requested)) {
    existingIds.add(requested);
    return requested;
  }
  const levelMin = numberValue(request.level_min, 1);
  const levelMax = numberValue(request.level_max, levelMin);
  const baseName = slugify(stringValue(request.name, stringValue(request.archetype, "generated_area")));
  return uniqueId(`gen_${baseName}_${levelMin}_${levelMax}_${randomSuffix()}`, existingIds);
}

function allKnownIds(files: CoreFiles) {
  const ids = new Set<string>();
  for (const id of Object.keys(files.zones)) ids.add(id);
  for (const id of Object.keys(files.stages)) ids.add(id);
  for (const id of Object.keys(files.comms)) ids.add(id);
  for (const mob of files.mobs) {
    const mobId = stringValue(mob.id).trim();
    if (mobId) ids.add(mobId);
  }
  for (const mission of files.missions) ids.add(mission.id);
  return ids;
}

function generatedIds(files: CoreFiles) {
  const ids = new Set<string>();
  for (const [zoneId, zone] of Object.entries(files.zones)) {
    const generatedId = generatedIdFor(zone);
    if (generatedId) ids.add(generatedId);
    if (generatedId && zoneId.startsWith("gen_")) ids.add(zoneId);
  }
  for (const stage of Object.values(files.stages)) {
    const generatedId = generatedIdFor(stage);
    if (generatedId) ids.add(generatedId);
  }
  for (const mob of files.mobs) {
    const generatedId = generatedIdFor(mob);
    if (generatedId) ids.add(generatedId);
  }
  for (const [contactId, contact] of Object.entries(files.comms)) {
    const generatedId = generatedIdFor(contact);
    if (generatedId) ids.add(generatedId);
    if (!generatedId && contactId.startsWith("gen_")) ids.add(contactId.split("_").slice(0, -1).join("_"));
  }
  for (const mission of files.missions) {
    const generatedId = generatedIdFor(mission.data);
    if (generatedId) ids.add(generatedId);
  }
  return ids;
}

function zoneArray(zone: JsonObject | null, key: string) {
  return asArray(asObject(zone ?? {})[key]).map(asObject).filter((entry) => Object.keys(entry).length);
}

function artifactsForGeneratedId(files: CoreFiles, areaId: string): CoreGeneratedArtifacts {
  const zone = Object.entries(files.zones).find(([zoneId, value]) => zoneId === areaId || generatedMatches(value, areaId))?.[1] ?? null;
  const stageDefinitions = Object.fromEntries(Object.entries(files.stages).filter(([stageId, stage]) => generatedMatches(stage, areaId) || contentBelongsToArea(stageId, areaId)));
  const contacts = Object.fromEntries(Object.entries(files.comms).filter(([contactId, contact]) => generatedMatches(contact, areaId) || contentBelongsToArea(contactId, areaId)));
  const mobs = files.mobs.filter((mob) => generatedMatches(mob, areaId) || contentBelongsToArea(stringValue(mob.id), areaId));
  const missions = files.missions.filter((mission) => generatedMatches(mission.data, areaId) || contentBelongsToArea(mission.id, areaId) || contentBelongsToArea(mission.fileName, areaId));
  return { zone, stageDefinitions, contacts, mobs, missions };
}

function hasArtifacts(artifacts: GeneratedAreaArtifacts) {
  return (
    !!artifacts.zone ||
    !!Object.keys(artifacts.stageDefinitions ?? {}).length ||
    Object.keys(artifacts.contacts).length > 0 ||
    artifacts.mobs.length > 0 ||
    artifacts.missions.length > 0
  );
}

function requestFromZone(areaId: string, zone: JsonObject | null): JsonObject {
  const bounds = asObject(zone?.bounds);
  return {
    id: areaId,
    name: stringValue(zone?.name, areaId),
    archetype: stringValue(zone?.archetype),
    status: "generated",
    active: boolValue(zone?.active, true),
    poi_map: boolValue(zone?.poi_map, true),
    sector_id: asArray(zone?.sector_id).length ? zone?.sector_id : [0, 0],
    x: asArray(zone?.pos)[0] ?? 0,
    y: asArray(zone?.pos)[1] ?? 0,
    level_min: numberValue(zone?.level_min, 1),
    level_max: numberValue(zone?.level_max, numberValue(zone?.level_min, 1)),
    width: numberValue(bounds.width, 36000),
    height: numberValue(bounds.height, 30000),
    bounds_shape: stringValue(bounds.shape, "ellipse"),
    activation_radius: numberValue(zone?.activation_radius, 52000),
    stages: zoneArray(zone, "stages").map((stage) => {
      const { stage_id: _stageId, generated_id: _generatedId, source_stage_id: _sourceStageId, ...rest } = stage;
      return {
        ...rest,
        stage_id: stringValue(stage.source_stage_id, stringValue(stage.stage_id)),
        pos: asArray(stage.pos).length ? stage.pos : [0, 0],
      };
    }),
  };
}

async function loadStageCatalog(gameRoot: string) {
  const stages = await readDictionary(gamePath(gameRoot, GENERATED_AREA_PATHS.stages));
  return Object.entries(stages)
    .filter(([, stage]) => !boolValue(stage.generated))
    .map(([id, raw]) => ({
      id,
      name: stringValue(raw.name, id),
      shape: stringValue(raw.shape),
      width: typeof raw.width === "number" ? raw.width : null,
      height: typeof raw.height === "number" ? raw.height : null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function loadMobCatalog(gameRoot: string) {
  const mobs = await readMobArray(gamePath(gameRoot, GENERATED_AREA_PATHS.mobs));
  return mobs
    .filter((mob) => !boolValue(mob.generated))
    .map((mob) => ({
      id: stringValue(mob.id),
      name: stringValue(mob.display_name, stringValue(mob.name, stringValue(mob.id))),
      faction: stringValue(mob.faction),
      level: typeof mob.level === "number" ? mob.level : null,
    }))
    .filter((mob) => mob.id)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function loadWorkspace(gameRoot: string, warnings: string[] = []): Promise<GeneratedAreasWorkspace> {
  const files = await readCoreFiles(gameRoot);
  const ids = Array.from(generatedIds(files)).sort((left, right) => left.localeCompare(right));
  const emptyArtifacts: GeneratedAreaArtifacts = { zone: null, stageDefinitions: {}, contacts: {}, mobs: [], missions: [] };
  const entries: GeneratedAreaEntry[] = ids.map((areaId) => {
    const core = artifactsForGeneratedId(files, areaId);
    const request = requestFromZone(areaId, core.zone);
    return {
      id: areaId,
      name: stringValue(request.name, areaId),
      archetype: stringValue(request.archetype),
      status: "generated",
      request,
      staged: emptyArtifacts,
      core,
      hasStagedContent: false,
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
    mobCatalog: await loadMobCatalog(gameRoot),
    summary: {
      requestCount: entries.length,
      draftCount: 0,
      approvedCount: 0,
      promotedCount: entries.length,
      stagedAreaCount: 0,
      coreAreaCount: entries.filter((entry) => entry.hasCoreContent).length,
    },
    warnings,
  };
}

function itemStack(items: JsonObject[], itemId: number, count: number) {
  const item = items.find((entry) => Number(entry.id) === itemId);
  return {
    ...(item ? cloneObject(item) : { id: itemId }),
    count,
  };
}

function defaultStagePlacements(request: JsonObject) {
  const requestStages = asArray(request.stages).map(asObject).filter((stage) => stringValue(stage.stage_id).trim());
  if (requestStages.length) return requestStages;
  return [
    { stage_id: "ast_btm", pos: [0, 0] },
    { stage_id: "ast_top", pos: [0, 0] },
  ];
}

function baseZone(areaId: string, request: JsonObject): JsonObject {
  const levelMin = numberValue(request.level_min, 1);
  const levelMax = numberValue(request.level_max, levelMin);
  return {
    activation_radius: numberValue(request.activation_radius, 52000),
    activation_radius_border: false,
    active: boolValue(request.active, true),
    archetype: stringValue(request.archetype, "friendly_hub_under_siege"),
    bounds: {
      height: numberValue(request.height, 30000),
      shape: stringValue(request.bounds_shape, "ellipse"),
      width: numberValue(request.width, 36000),
    },
    environment_elements: [],
    generated: true,
    generated_id: areaId,
    level_max: levelMax,
    level_min: levelMin,
    lockboxes: [],
    mobs: [],
    name: stringValue(request.name, areaId),
    poi_map: boolValue(request.poi_map, true),
    pos: [numberValue(request.x), numberValue(request.y)],
    sector_id: asArray(request.sector_id).length ? request.sector_id : [0, 0],
    show_hud_on_enter: true,
    stages: defaultStagePlacements(request),
  };
}

function generatedContact(areaId: string, idSuffix: string, name: string, greeting: string, portrait = "res://assets/comms/default_man.png"): [string, JsonObject] {
  const id = `${areaId}_${idSuffix}`;
  return [
    id,
    {
      dialog: [greeting],
      greeting,
      meta: { generated: true, generated_id: areaId },
      name,
      portrait,
      generated: true,
      generated_id: areaId,
    },
  ];
}

function generatedSpawner(areaId: string, suffix: string, sourceMobId: string, displayName: string, levelMin: number, levelMax: number, patch: JsonObject = {}): JsonObject {
  return {
    angle_deg: 0,
    count: 1,
    level_max: levelMax,
    level_min: levelMin,
    mob_id: `${areaId}_${suffix}`,
    pos: [0, 0],
    radius: 0,
    rank: "normal",
    respawn_delay: 0,
    ...patch,
    generated_id: areaId,
    source_mob_id: sourceMobId,
    overrides: {
      display_name: displayName,
      ...asObject(patch.overrides),
      id: `${areaId}_${suffix}`,
    },
  };
}

function generatedMission(areaId: string, suffix: string, title: string, level: number, mission: JsonObject): GeneratedAreaMissionArtifact {
  const id = `mission.generated.${areaId}.${suffix}`;
  return {
    id,
    title,
    fileName: `${id}.json`,
    data: {
      ...mission,
      id,
      title,
      level: String(level),
      meta: {
        author: "ConsoleGeneratedAreaGenerator",
        generated: true,
        generated_id: areaId,
        ...asObject(mission.meta),
      },
      tags: ["generated", "area", ...asArray(mission.tags).map((tag) => stringValue(tag)).filter(Boolean)],
      generated: true,
      generated_id: areaId,
    },
  };
}

function buildGeneratedContent(areaId: string, request: JsonObject, items: JsonObject[]) {
  const zone = baseZone(areaId, request);
  const levelMin = numberValue(zone.level_min, 1);
  const levelMax = numberValue(zone.level_max, levelMin);
  const name = stringValue(zone.name, areaId);
  const archetype = stringValue(zone.archetype, "friendly_hub_under_siege");
  const contacts: Record<string, JsonObject> = {};
  const missions: GeneratedAreaMissionArtifact[] = [];

  if (archetype === "pirate_stronghold") {
    zone.mobs = [
      generatedSpawner(areaId, "stronghold_pirate", "PirateFighter", "Stronghold Raider", levelMin, levelMax, { count: 8, radius: 10000, respawn_delay: 90 }),
      generatedSpawner(areaId, "stronghold_interceptor", "PirateInterceptor", "Stronghold Interceptor", levelMin, levelMax, { count: 4, pos: [-5200, 4800], radius: 7000, respawn_delay: 90 }),
      generatedSpawner(areaId, "stronghold_boss", "PirateLeader", stringValue(request.elite_name, "Stronghold Captain"), levelMax, levelMax, { count: 1, pos: [1200, -700], rank: "elite" }),
    ];
    zone.lockboxes = [
      {
        allow_deposit: false,
        consume_key: true,
        id: `${areaId}_captains_chest`,
        items: [itemStack(items, 92, 1), itemStack(items, 86, 2), itemStack(items, 91, 1)],
        lock_key_mode: "item_id",
        locked: true,
        pos: [1900, -950],
        required_key_item_id: 902,
        slot_count: 8,
        generated_id: areaId,
      },
    ];
    missions.push(
      generatedMission(areaId, "stronghold", "Crack the Stronghold", levelMin, {
        arcs: ["generated_area"],
        description: `${name} is being used as a pirate holdout. Destroy the raiders and take down the captain.`,
        description_complete: "The stronghold is broken.",
        faction: "Independent",
        giver_id: `${areaId}_stronghold_boss`,
        repeatable: false,
        rewards: { credits: 750, items: [], mods: [], reputation: [], xp: 650 },
        steps: [
          {
            description: `${name} is being used as a pirate holdout. Destroy the raiders and take down the captain.`,
            mode: "sequential",
            objectives: [
              { count: 8, description: "Destroy the stronghold raiders.", objective: "Destroy the stronghold raiders.", progress_label: "Raiders destroyed", target_id: `${areaId}_stronghold_pirate`, type: "kill" },
              { count: 1, description: "Destroy the stronghold captain.", objective: "Destroy the stronghold captain.", progress_label: "Captain destroyed", target_id: `${areaId}_stronghold_boss`, type: "kill" },
            ],
          },
        ],
      }),
    );
  } else if (archetype === "npc_scan_habitat") {
    const contactName = stringValue(request.contact_name, "Habitat Medtech");
    const [contactId, contact] = generatedContact(areaId, "medtech", contactName, "Keep the scans gentle. These people have had enough alarms for one week.");
    contacts[contactId] = contact;
    const npcCount = numberValue(request.npc_count, 5);
    zone.stages = asArray(request.stages).map(asObject).filter((stage) => stringValue(stage.stage_id).trim());
    zone.mobs = [
      generatedSpawner(areaId, "habitat", "hab_default_hab", stringValue(request.hub_name, `${name} Habitat`), levelMin, levelMax, { pos: [-361, -815] }),
      generatedSpawner(areaId, "civilian_subject", "gem_basic_scout", "Civilian Scan Subject", levelMin, levelMax, { count: npcCount, pos: [-874, -369], radius: 5200, respawn_delay: 120 }),
    ];
    missions.push(
      generatedMission(areaId, "scan", "Quiet Screening", levelMin, {
        arcs: ["generated_area"],
        conversations: { briefing: { beats: [{ speaker: contactId, text: "We need clean scans before we can clear the residents." }] } },
        description: "Scan the nearby civilian traffic and report back to the habitat medtech.",
        description_complete: "Return to the medtech.",
        faction: "Independent",
        giver_id: `${areaId}_habitat`,
        repeatable: false,
        rewards: { credits: 450, items: [], mods: [], reputation: [], xp: 425 },
        steps: [
          {
            description: "Scan the nearby civilian traffic and report back to the habitat medtech.",
            mode: "sequential",
            objectives: [
              { contact_id: contactId, conversation_id: "briefing", description: "Speak with the habitat medtech.", objective: "Speak with the habitat medtech.", progress_label: "Medtech contacted", target_id: `${areaId}_habitat`, type: "talk" },
              { count: npcCount, description: "Scan the civilian subjects.", objective: "Scan the civilian subjects.", progress_label: "Subjects scanned", target_id: `${areaId}_civilian_subject`, type: "scan" },
            ],
          },
        ],
        turn_in_to: `${areaId}_habitat`,
      }),
    );
  } else if (archetype === "mining_colony") {
    const contactName = stringValue(request.contact_name, "Claim Foreman");
    const [contactId, contact] = generatedContact(areaId, "foreman", contactName, "Mind the field markers. The rocks are jumpy after the last survey blast.");
    contacts[contactId] = contact;
    const asteroidCount = numberValue(request.asteroid_count, 8);
    const oreItemId = numberValue(request.ore_item_id, 85);
    const oreCount = numberValue(request.ore_count, 3);
    const scanCount = numberValue(request.scan_count, 4);
    const mineCount = numberValue(request.mine_count, 4);
    zone.mobs = [generatedSpawner(areaId, "mining_hab", "hab_independent_mining_coop_1", stringValue(request.hub_name, `${name} Mining Hab`), levelMin, levelMax)];
    zone.environment_elements = [
      {
        active: true,
        data: {
          asteroid_fragment_drop_chance: 0.75,
          asteroid_rarity: 2,
          count: asteroidCount,
          durability: 500 + levelMin * 8,
          lootbox_count: 1,
          mining_xp_level: levelMin,
          ore_drop_count: 1,
          ore_item_id: oreItemId,
          position: [4500, 500],
          radius: 180,
          respawn_seconds: 600,
          rock_dust_drop_chance: 0.65,
          spawn_radius: 7800,
        },
        id: `${areaId}_asteroid_field`,
        name: `${name} Field`,
        tags: ["generated_area", areaId, `${areaId}_claim_asteroid`, "mineable_claim"],
        type: "mineable_asteroid",
        generated_id: areaId,
      },
    ];
    missions.push(
      generatedMission(areaId, "mining", "Claim Survey", levelMin, {
        arcs: ["generated_area"],
        conversations: { briefing: { beats: [{ speaker: contactId, text: "Survey the claim, crack a few samples, and bring the ore back here." }] } },
        description: "Survey the mining claim, mine samples, and return the ore to the foreman.",
        description_complete: "Return to the claim foreman.",
        faction: "Independent",
        giver_id: `${areaId}_mining_hab`,
        repeatable: false,
        rewards: { credits: 520, items: [], mods: [], reputation: [], xp: 500 },
        steps: [
          {
            description: "Survey the mining claim, mine samples, and return the ore to the foreman.",
            mode: "sequential",
            objectives: [
              { contact_id: contactId, conversation_id: "briefing", description: "Speak with the claim foreman.", objective: "Speak with the claim foreman.", progress_label: "Foreman contacted", target_id: `${areaId}_mining_hab`, type: "talk" },
              { count: scanCount, description: "Scan the claim asteroids.", objective: "Scan the claim asteroids.", progress_label: "Asteroids scanned", target_tag: `${areaId}_claim_asteroid`, type: "scan" },
              { count: mineCount, description: "Mine claim samples.", objective: "Mine claim samples.", progress_label: "Samples mined", target_tag: `${areaId}_claim_asteroid`, type: "mine" },
              { count: oreCount, description: "Collect ore samples.", item_id: oreItemId, objective: "Collect ore samples.", progress_label: "Ore collected", type: "collect" },
            ],
          },
        ],
        turn_in_to: `${areaId}_mining_hab`,
      }),
    );
  } else {
    const contactName = stringValue(request.contact_name, "Relay Marshal");
    const [contactId, contact] = generatedContact(areaId, "marshal", contactName, "Keep your transponder hot.");
    contacts[contactId] = contact;
    zone.mobs = [
      generatedSpawner(areaId, "hub", "hab_farm", stringValue(request.hub_name, `${name} Hub`), levelMin, levelMax),
      generatedSpawner(areaId, "raider", "PirateFighter", "Siege Raider", levelMin, levelMax, { count: 6, pos: [7200, -2600], radius: 8500, respawn_delay: 90 }),
      generatedSpawner(areaId, "interceptor", "PirateInterceptor", "Siege Interceptor", levelMin, levelMax, { count: 3, pos: [-7800, 3600], radius: 6500, respawn_delay: 90 }),
      generatedSpawner(areaId, "elite", "PirateLeader", stringValue(request.elite_name, "Cache Key Carrier"), levelMax, levelMax, { count: 1, pos: [11200, 2200], rank: "elite" }),
    ];
    zone.lockboxes = [
      {
        allow_deposit: false,
        consume_key: true,
        id: `${areaId}_relief_cache`,
        items: [itemStack(items, 91, 2), itemStack(items, 85, 3)],
        lock_key_mode: "item_id",
        locked: true,
        pos: [2700, 1600],
        required_key_item_id: 902,
        slot_count: 8,
        generated_id: areaId,
      },
    ];
    missions.push(
      generatedMission(areaId, "relief", "Break the Siege", levelMin, {
        arcs: ["generated_area"],
        conversations: {
          briefing: {
            beats: [
              { speaker: contactId, text: "We can hold the docking clamps, but not the outer perimeter." },
              { speaker: contactId, text: "The leader is carrying a cache key. Crack that ship and the relief crate is yours." },
            ],
          },
        },
        description: "The local relay is boxed in by pirates. Coordinate with the marshal, clear the attackers, and take down their card carrier.",
        description_complete: "Return to the relay marshal.",
        faction: "Independent",
        giver_id: `${areaId}_hub`,
        repeatable: false,
        rewards: { credits: 650, items: [], mods: [], reputation: [], xp: 550 },
        steps: [
          {
            description: "The local relay is boxed in by pirates. Coordinate with the marshal, clear the attackers, and take down their card carrier.",
            mode: "sequential",
            objectives: [
              { contact_id: contactId, conversation_id: "briefing", description: "Speak with the relay marshal.", objective: "Speak with the relay marshal.", progress_label: "Marshal contacted", target_id: `${areaId}_hub`, type: "talk" },
              { count: 6, description: "Destroy the pirate raiders around the hub.", objective: "Destroy the pirate raiders around the hub.", progress_label: "Raiders destroyed", target_id: `${areaId}_raider`, type: "kill" },
              { count: 1, description: "Destroy the elite pirate carrying the cache key.", objective: "Destroy the elite pirate carrying the cache key.", progress_label: "Elite destroyed", target_id: `${areaId}_elite`, type: "kill" },
            ],
          },
        ],
        turn_in_to: `${areaId}_hub`,
      }),
    );
  }

  return { zone, contacts, missions };
}

function resolveSourceStageId(stages: Record<string, JsonObject>, areaId: string, stage: JsonObject) {
  const explicit = stringValue(stage.source_stage_id).trim();
  if (explicit) return explicit;
  const stageId = stringValue(stage.stage_id).trim();
  const existing = stages[stageId];
  if (existing && generatedMatches(existing, areaId)) return stringValue(existing.source_stage_id, stageId);
  return stageId;
}

function normalizeStagePlacements(areaId: string, zone: JsonObject, stages: Record<string, JsonObject>) {
  const usedStageIds = new Set<string>();
  const normalized = zoneArray(zone, "stages").map((rawStage, index) => {
    const stage = { ...rawStage };
    const sourceStageId = resolveSourceStageId(stages, areaId, stage);
    if (!sourceStageId) throw new Error(`Stage placement ${index + 1} needs a stage ID.`);
    const generatedStageId = stringValue(stage.stage_id).startsWith(`${areaId}_`) ? stringValue(stage.stage_id) : `${areaId}_${sourceStageId}`;
    const sourceStage = stages[sourceStageId];
    const existingGeneratedStage = stages[generatedStageId];
    if (!sourceStage && !existingGeneratedStage) throw new Error(`Stage "${sourceStageId}" was not found in Stages.json.`);
    const { generated_id: _generatedId, generated: _generated, source_stage_id: _sourceStageId, ...stageExtra } = stage;
    stages[generatedStageId] = {
      ...(sourceStage ? cloneObject(sourceStage) : cloneObject(existingGeneratedStage)),
      generated: true,
      generated_id: areaId,
      source_stage_id: sourceStageId,
    };
    usedStageIds.add(generatedStageId);
    return {
      ...stageExtra,
      pos: asArray(stage.pos).length ? stage.pos : [0, 0],
      stage_id: generatedStageId,
      generated_id: areaId,
      source_stage_id: sourceStageId,
    };
  });

  for (const [stageId, stage] of Object.entries(stages)) {
    if (generatedMatches(stage, areaId) && !usedStageIds.has(stageId)) delete stages[stageId];
  }
  zone.stages = normalized;
}

function resolveSourceMobId(mobById: Map<string, JsonObject>, areaId: string, spawner: JsonObject) {
  const explicit = stringValue(spawner.source_mob_id).trim();
  if (explicit) return explicit;
  const mobId = stringValue(spawner.mob_id).trim();
  const existing = mobById.get(mobId);
  if (existing && generatedMatches(existing, areaId)) return stringValue(existing.source_mob_id, mobId);
  return mobId;
}

function normalizeMobSpawners(areaId: string, zone: JsonObject, mobs: JsonObject[]) {
  const mobById = new Map(mobs.map((mob) => [stringValue(mob.id), mob]));
  const usedMobIds = new Set<string>();
  const generatedMobRecords = new Map<string, JsonObject>();

  const normalized = zoneArray(zone, "mobs").map((rawSpawner, index) => {
    const spawner = { ...rawSpawner };
    const overrides = asObject(spawner.overrides);
    const sourceMobId = resolveSourceMobId(mobById, areaId, spawner);
    if (!sourceMobId) throw new Error(`Mob spawner ${index + 1} needs a mob ID.`);
    const currentMobId = stringValue(spawner.mob_id).trim();
    const preferredId = stringValue(overrides.id).trim();
    const generatedMobId = preferredId || (currentMobId.startsWith(`${areaId}_`) ? currentMobId : `${areaId}_${slugify(sourceMobId, "mob")}`);
    const sourceMob = mobById.get(sourceMobId);
    const existingGeneratedMob = mobById.get(generatedMobId);
    if (!sourceMob && !existingGeneratedMob) throw new Error(`Mob "${sourceMobId}" was not found in mobs.json.`);
    const overrideWithoutId = { ...overrides };
    delete overrideWithoutId.id;
    const canKeepExistingRecord =
      !!existingGeneratedMob &&
      generatedMatches(existingGeneratedMob, areaId) &&
      stringValue(existingGeneratedMob.source_mob_id, sourceMobId) === sourceMobId &&
      !Object.keys(overrideWithoutId).length;
    const baseRecord = cloneObject(canKeepExistingRecord ? existingGeneratedMob : (sourceMob ?? existingGeneratedMob ?? {}));
    const baseTags = asArray(baseRecord.tags).map((tag) => stringValue(tag)).filter(Boolean);
    generatedMobRecords.set(generatedMobId, {
      ...baseRecord,
      ...overrideWithoutId,
      id: generatedMobId,
      tags: Array.from(new Set([...baseTags, "generated_area", areaId, stringValue(zone.archetype)].filter(Boolean))),
      generated: true,
      generated_id: areaId,
      source_mob_id: sourceMobId,
    });
    usedMobIds.add(generatedMobId);
    delete spawner.overrides;
    return {
      ...spawner,
      mob_id: generatedMobId,
      generated_id: areaId,
      source_mob_id: sourceMobId,
    };
  });

  zone.mobs = normalized;
  const retained = mobs.filter((mob) => !generatedMatches(mob, areaId) || usedMobIds.has(stringValue(mob.id)));
  const retainedById = new Map(retained.map((mob) => [stringValue(mob.id), mob]));
  for (const [mobId, mob] of generatedMobRecords) retainedById.set(mobId, mob);
  return Array.from(retainedById.values());
}

function normalizeNestedGeneratedIds(areaId: string, zone: JsonObject) {
  for (const key of ["lockboxes", "environment_elements"]) {
    if (!Array.isArray(zone[key])) continue;
    zone[key] = asArray(zone[key]).map((entry) => {
      const object = asObject(entry);
      return Object.keys(object).length ? { ...object, generated_id: areaId } : object;
    });
  }
}

function normalizeGeneratedZone(areaId: string, zone: JsonObject, files: CoreFiles) {
  zone.generated = true;
  zone.generated_id = areaId;
  normalizeStagePlacements(areaId, zone, files.stages);
  files.mobs = normalizeMobSpawners(areaId, zone, files.mobs);
  normalizeNestedGeneratedIds(areaId, zone);
}

async function applySubmittedEdits(gameRoot: string, body: JsonObject) {
  const areaId = stringValue(body.areaId).trim();
  if (!areaId) throw new Error("Generated area ID is required.");
  const zone = asObject(body.zone);
  if (!Object.keys(zone).length) return;

  const files = await readCoreFiles(gameRoot);
  const currentZoneId = Object.entries(files.zones).find(([zoneId, value]) => zoneId === areaId || generatedMatches(value, areaId))?.[0];
  if (!currentZoneId) throw new Error(`Generated area "${areaId}" was not found in Zones.json.`);
  const nextZone = { ...asObject(files.zones[currentZoneId]), ...zone };
  normalizeGeneratedZone(areaId, nextZone, files);
  files.zones[currentZoneId] = nextZone;
  await writeCoreFiles(gameRoot, files);
}

async function writeGeneratedMissions(gameRoot: string, areaId: string, missions: GeneratedAreaMissionArtifact[]) {
  const missionDir = gamePath(gameRoot, GENERATED_AREA_PATHS.missions);
  await fsp.mkdir(missionDir, { recursive: true });
  const existing = await readMissionFiles(missionDir);
  for (const mission of existing) {
    if (generatedMatches(mission.data, areaId)) await fsp.rm(mission.absolutePath, { force: true });
  }
  for (const mission of missions) {
    await writeJson(path.join(missionDir, mission.fileName), mission.data);
  }
}

async function generateArea(gameRoot: string, request: JsonObject) {
  const files = await readCoreFiles(gameRoot);
  const areaId = generatedAreaIdFromRequest(request, allKnownIds(files));
  if (generatedIds(files).has(areaId) || files.zones[areaId]) throw new Error(`Generated area ID "${areaId}" already exists.`);
  const nextRequest = { ...request, id: areaId };
  const { zone, contacts, missions } = buildGeneratedContent(areaId, nextRequest, files.items);
  normalizeGeneratedZone(areaId, zone, files);
  files.zones[areaId] = zone;
  for (const [contactId, contact] of Object.entries(contacts)) files.comms[contactId] = contact;
  await writeCoreFiles(gameRoot, files);
  await writeGeneratedMissions(gameRoot, areaId, missions);
  return areaId;
}

async function previewArea(gameRoot: string, request: JsonObject) {
  const files = await readCoreFiles(gameRoot);
  const areaId = generatedAreaIdFromRequest(request, allKnownIds(files));
  if (generatedIds(files).has(areaId) || files.zones[areaId]) throw new Error(`Generated area ID "${areaId}" already exists.`);
  const { zone, contacts, missions } = buildGeneratedContent(areaId, { ...request, id: areaId }, files.items);
  normalizeGeneratedZone(areaId, zone, files);
  return {
    areaId,
    counts: {
      zones: 1,
      stageDefinitions: Object.values(files.stages).filter((stage) => generatedMatches(stage, areaId)).length,
      contacts: Object.keys(contacts).length,
      mobRecords: files.mobs.filter((mob) => generatedMatches(mob, areaId)).length,
      mobSpawns: zoneArray(zone, "mobs").length,
      missions: missions.length,
      lockboxes: zoneArray(zone, "lockboxes").length,
      environment: zoneArray(zone, "environment_elements").length,
    },
  };
}

async function rejectArea(gameRoot: string, areaId: string) {
  const files = await readCoreFiles(gameRoot);
  for (const [zoneId, zone] of Object.entries(files.zones)) {
    if (zoneId === areaId || generatedMatches(zone, areaId) || contentBelongsToArea(zoneId, areaId)) {
      delete files.zones[zoneId];
      continue;
    }
    for (const key of ["stages", "mobs", "lockboxes", "environment_elements"]) {
      if (Array.isArray(zone[key])) zone[key] = asArray(zone[key]).filter((entry) => !generatedMatches(entry, areaId));
    }
  }
  for (const [stageId, stage] of Object.entries(files.stages)) {
    if (generatedMatches(stage, areaId) || contentBelongsToArea(stageId, areaId)) delete files.stages[stageId];
  }
  for (const [contactId, contact] of Object.entries(files.comms)) {
    if (generatedMatches(contact, areaId) || contentBelongsToArea(contactId, areaId)) delete files.comms[contactId];
  }
  files.mobs = files.mobs.filter((mob) => !generatedMatches(mob, areaId) && !contentBelongsToArea(stringValue(mob.id), areaId));
  for (const mission of files.missions) {
    if (generatedMatches(mission.data, areaId) || contentBelongsToArea(mission.id, areaId) || contentBelongsToArea(mission.fileName, areaId)) await fsp.rm(mission.absolutePath, { force: true });
  }
  await writeCoreFiles(gameRoot, files);
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

    if (action === "save") {
      await applySubmittedEdits(local.gameRootPath, body);
      return NextResponse.json({ ok: true, message: `Saved generated area "${areaId}" into core game data.`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "generate") {
      const request = asObject(body.request);
      if (!Object.keys(request).length) throw new Error("A generated area request is required.");
      const generatedId = await generateArea(local.gameRootPath, request);
      return NextResponse.json({ ok: true, areaId: generatedId, message: `Generated "${generatedId}" into core game data.`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "preview") {
      const request = asObject(body.request);
      if (!Object.keys(request).length) throw new Error("A generated area request is required.");
      const preview = await previewArea(local.gameRootPath, request);
      return NextResponse.json({ ok: true, ...preview });
    }
    if (action === "reject") {
      if (!areaId) return NextResponse.json({ ok: false, error: "Generated area ID is required." }, { status: 400 });
      await rejectArea(local.gameRootPath, areaId);
      return NextResponse.json({ ok: true, message: `Deleted every generated artifact tagged "${areaId}".`, workspace: await loadWorkspace(local.gameRootPath) });
    }
    if (action === "approve" || action === "promote") {
      return NextResponse.json({ ok: true, message: "Generated areas now write directly into core game data; no staging promotion is required.", workspace: await loadWorkspace(local.gameRootPath) });
    }
    return NextResponse.json({ ok: false, error: `Unsupported generated area action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
