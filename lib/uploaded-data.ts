import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export type UploadedDataAvailability = {
  mods: boolean;
  items: boolean;
  mobs: boolean;
  abilities: boolean;
  comms: boolean;
  merchantProfiles: boolean;
  poi: boolean;
  regions: boolean;
  tradeRoutes: boolean;
  npcTraffic: boolean;
  tutorialEntries: boolean;
  tutorialTriggers: boolean;
  shipStatDescriptions: boolean;
  zones: boolean;
  stages: boolean;
  hazardBarrierProfiles: boolean;
  asteroidBeltGates: boolean;
};

export type UploadedDataState = {
  active: boolean;
  storagePath: string | null;
  sourceLabel: string | null;
  fileCount: number;
  jsonCount: number;
  totalBytes: number;
  lastImported: string | null;
  available: UploadedDataAvailability;
};

type UploadedDataMetadata = {
  sourceLabel: string;
  fileCount: number;
  jsonCount: number;
  totalBytes: number;
  lastImported: string;
  available: UploadedDataAvailability;
};

type UploadedDataEntry = {
  relativePath: string;
  buffer: Buffer;
};

export type UploadedDataFileKind =
  | "mods"
  | "items"
  | "mobs"
  | "abilitiesIndex"
  | "comms"
  | "merchantProfiles"
  | "poi"
  | "regions"
  | "tradeRoutes"
  | "npcTraffic"
  | "tutorialEntries"
  | "tutorialTriggers"
  | "shipStatDescriptions"
  | "zones"
  | "stages"
  | "hazardBarrierProfiles"
  | "asteroidBeltGates";

const UPLOADED_DATA_ROOT = path.resolve(process.cwd(), ".gemini-uploaded-data");
const UPLOADED_DATA_DIR = path.join(UPLOADED_DATA_ROOT, "data");
const UPLOADED_DATA_METADATA = path.join(UPLOADED_DATA_ROOT, "metadata.json");

export const DATA_FILE_PATHS: Record<UploadedDataFileKind, string> = {
  mods: path.join("data", "database", "mods", "Mods.json"),
  items: path.join("data", "database", "items", "items.json"),
  mobs: path.join("data", "database", "mobs", "mobs.json"),
  abilitiesIndex: path.join("data", "database", "abilities", "json", "_AbilityIndex.json"),
  comms: path.join("data", "database", "comms", "Comms.json"),
  merchantProfiles: path.join("data", "database", "vendor", "merchant_profiles.json"),
  poi: path.join("data", "map", "poi.json"),
  regions: path.join("data", "map", "regions.json"),
  tradeRoutes: path.join("data", "routes", "trade_routes.json"),
  npcTraffic: path.join("data", "traffic", "npc_traffic.json"),
  tutorialEntries: path.join("data", "tutorial", "info_entries.json"),
  tutorialTriggers: path.join("data", "tutorial", "info_triggers.json"),
  shipStatDescriptions: path.join("data", "ui", "ShipStatDescriptions.json"),
  zones: path.join("data", "database", "zones", "Zones.json"),
  stages: path.join("data", "database", "stages", "Stages.json"),
  hazardBarrierProfiles: path.join("data", "database", "environment", "HazardBarrierProfiles.json"),
  asteroidBeltGates: path.join("data", "database", "environment", "AsteroidBeltGates.json"),
};

function emptyAvailability(): UploadedDataAvailability {
  return {
    mods: false,
    items: false,
    mobs: false,
    abilities: false,
    comms: false,
    merchantProfiles: false,
    poi: false,
    regions: false,
    tradeRoutes: false,
    npcTraffic: false,
    tutorialEntries: false,
    tutorialTriggers: false,
    shipStatDescriptions: false,
    zones: false,
    stages: false,
    hazardBarrierProfiles: false,
    asteroidBeltGates: false,
  };
}

function normalizeUploadedDataPath(rawPath: string): string | null {
  const cleaned = rawPath.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!cleaned) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === "." || part === "..")) return null;
  if (parts.includes("__MACOSX")) return null;
  if (parts[parts.length - 1] === ".DS_Store") return null;

  const dataIndex = parts.findIndex((part) => part.toLowerCase() === "data");
  const scopedParts = dataIndex >= 0 ? parts.slice(dataIndex) : ["data", ...parts];
  if (scopedParts.length < 2) return null;
  return scopedParts.join("/");
}

function detectAvailability(root: string): UploadedDataAvailability {
  return {
    mods: fs.existsSync(path.join(root, DATA_FILE_PATHS.mods)),
    items: fs.existsSync(path.join(root, DATA_FILE_PATHS.items)),
    mobs: fs.existsSync(path.join(root, DATA_FILE_PATHS.mobs)),
    abilities: fs.existsSync(path.join(root, DATA_FILE_PATHS.abilitiesIndex)),
    comms: fs.existsSync(path.join(root, DATA_FILE_PATHS.comms)),
    merchantProfiles: fs.existsSync(path.join(root, DATA_FILE_PATHS.merchantProfiles)),
    poi: fs.existsSync(path.join(root, DATA_FILE_PATHS.poi)),
    regions: fs.existsSync(path.join(root, DATA_FILE_PATHS.regions)),
    tradeRoutes: fs.existsSync(path.join(root, DATA_FILE_PATHS.tradeRoutes)),
    npcTraffic: fs.existsSync(path.join(root, DATA_FILE_PATHS.npcTraffic)),
    tutorialEntries: fs.existsSync(path.join(root, DATA_FILE_PATHS.tutorialEntries)),
    tutorialTriggers: fs.existsSync(path.join(root, DATA_FILE_PATHS.tutorialTriggers)),
    shipStatDescriptions: fs.existsSync(path.join(root, DATA_FILE_PATHS.shipStatDescriptions)),
    zones: fs.existsSync(path.join(root, DATA_FILE_PATHS.zones)),
    stages: fs.existsSync(path.join(root, DATA_FILE_PATHS.stages)),
    hazardBarrierProfiles: fs.existsSync(path.join(root, DATA_FILE_PATHS.hazardBarrierProfiles)),
    asteroidBeltGates: fs.existsSync(path.join(root, DATA_FILE_PATHS.asteroidBeltGates)),
  };
}

function buildState(metadata?: UploadedDataMetadata | null): UploadedDataState {
  return {
    active: !!metadata,
    storagePath: metadata ? path.relative(process.cwd(), UPLOADED_DATA_DIR) || ".gemini-uploaded-data/data" : null,
    sourceLabel: metadata?.sourceLabel ?? null,
    fileCount: metadata?.fileCount ?? 0,
    jsonCount: metadata?.jsonCount ?? 0,
    totalBytes: metadata?.totalBytes ?? 0,
    lastImported: metadata?.lastImported ?? null,
    available: metadata?.available ?? emptyAvailability(),
  };
}

function summarizeDataDir(dir: string): UploadedDataMetadata {
  let fileCount = 0;
  let jsonCount = 0;
  let totalBytes = 0;

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      fileCount += 1;
      if (entry.name.toLowerCase().endsWith(".json")) jsonCount += 1;
      try {
        totalBytes += fs.statSync(fullPath).size;
      } catch {}
    }
  }

  let lastImported: string;
  try {
    lastImported = fs.statSync(dir).mtime.toISOString();
  } catch {
    lastImported = new Date().toISOString();
  }

  return {
    sourceLabel: "Uploaded data",
    fileCount,
    jsonCount,
    totalBytes,
    lastImported,
    available: detectAvailability(UPLOADED_DATA_ROOT),
  };
}

function readMetadata(): UploadedDataMetadata | null {
  if (!fs.existsSync(UPLOADED_DATA_DIR)) return null;

  try {
    if (fs.existsSync(UPLOADED_DATA_METADATA)) {
      const parsed = JSON.parse(fs.readFileSync(UPLOADED_DATA_METADATA, "utf-8")) as UploadedDataMetadata;
      if (
        typeof parsed?.fileCount === "number" &&
        typeof parsed?.jsonCount === "number" &&
        typeof parsed?.totalBytes === "number" &&
        typeof parsed?.lastImported === "string" &&
        parsed?.available
      ) {
        return parsed;
      }
    }
  } catch {}

  return summarizeDataDir(UPLOADED_DATA_DIR);
}

export function getUploadedDataState(): UploadedDataState {
  return buildState(readMetadata());
}

export function getUploadedDataRoot(): string | null {
  return fs.existsSync(UPLOADED_DATA_DIR) ? UPLOADED_DATA_ROOT : null;
}

export function resolveUploadedDataFile(kind: UploadedDataFileKind): string | null {
  const root = getUploadedDataRoot();
  if (!root) return null;
  const absolute = path.join(root, DATA_FILE_PATHS[kind]);
  return fs.existsSync(absolute) ? absolute : null;
}

export async function readUploadedDataFileText(kind: UploadedDataFileKind): Promise<string | null> {
  const absolute = resolveUploadedDataFile(kind);
  if (!absolute) return null;
  return await fsp.readFile(absolute, "utf-8");
}

export async function clearUploadedData(): Promise<UploadedDataState> {
  await fsp.rm(UPLOADED_DATA_ROOT, { recursive: true, force: true });
  return buildState(null);
}

export async function importUploadedData(entries: UploadedDataEntry[], sourceLabel: string): Promise<UploadedDataState> {
  const tempRoot = path.resolve(process.cwd(), ".gemini-uploaded-data.tmp");
  await fsp.rm(tempRoot, { recursive: true, force: true });

  let fileCount = 0;
  let jsonCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const relativePath = normalizeUploadedDataPath(entry.relativePath);
    if (!relativePath) continue;

    const destination = path.join(tempRoot, relativePath);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, entry.buffer);

    fileCount += 1;
    totalBytes += entry.buffer.length;
    if (relativePath.toLowerCase().endsWith(".json")) jsonCount += 1;
  }

  if (!fileCount) {
    await fsp.rm(tempRoot, { recursive: true, force: true });
    throw new Error("No usable data files were found. Choose the /data folder itself or a zip that contains the data directory.");
  }

  const available = detectAvailability(tempRoot);
  const metadata: UploadedDataMetadata = {
    sourceLabel,
    fileCount,
    jsonCount,
    totalBytes,
    lastImported: new Date().toISOString(),
    available,
  };

  await fsp.writeFile(path.join(tempRoot, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
  await fsp.rm(UPLOADED_DATA_ROOT, { recursive: true, force: true });
  await fsp.rename(tempRoot, UPLOADED_DATA_ROOT);

  return buildState(metadata);
}
