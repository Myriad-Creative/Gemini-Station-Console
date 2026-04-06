import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export type LocalGameSourceAvailability = {
  data: boolean;
  assets: boolean;
  missions: boolean;
};

export type LocalGameSourceState = {
  active: boolean;
  gameRootPath: string | null;
  dataRootPath: string | null;
  assetsRootPath: string | null;
  missionsRootPath: string | null;
  lastValidated: string | null;
  available: LocalGameSourceAvailability;
  errors: string[];
};

type LocalGameSourceConfig = {
  gameRootPath: string;
  lastValidated: string;
};

const LOCAL_GAME_SOURCE_CONFIG = path.resolve(process.cwd(), ".gemini-local-source.json");
const MISSIONS_RELATIVE_PATH = path.join("scripts", "system", "missions", "missions");

function emptyAvailability(): LocalGameSourceAvailability {
  return {
    data: false,
    assets: false,
    missions: false,
  };
}

function normalizeRootPath(input: string) {
  const trimmed = input.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return "";
  return path.resolve(trimmed);
}

function deriveState(gameRootPath: string, lastValidated: string): LocalGameSourceState {
  const dataRootPath = path.join(gameRootPath, "data");
  const assetsRootPath = path.join(gameRootPath, "assets");
  const missionsRootPath = path.join(gameRootPath, MISSIONS_RELATIVE_PATH);
  const errors: string[] = [];

  const available = {
    data: fs.existsSync(dataRootPath),
    assets: fs.existsSync(assetsRootPath),
    missions: fs.existsSync(missionsRootPath),
  };

  if (!fs.existsSync(gameRootPath)) {
    errors.push("Configured game root path does not exist.");
  } else if (!fs.statSync(gameRootPath).isDirectory()) {
    errors.push("Configured game root path is not a directory.");
  }

  if (!available.data) errors.push("Missing data directory at /data.");
  if (!available.assets) errors.push("Missing assets directory at /assets.");
  if (!available.missions) errors.push("Missing mission directory at /scripts/system/missions/missions.");

  return {
    active: errors.length === 0,
    gameRootPath,
    dataRootPath: available.data ? dataRootPath : null,
    assetsRootPath: available.assets ? assetsRootPath : null,
    missionsRootPath: available.missions ? missionsRootPath : null,
    lastValidated,
    available,
    errors,
  };
}

function readConfig(): LocalGameSourceConfig | null {
  if (!fs.existsSync(LOCAL_GAME_SOURCE_CONFIG)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_GAME_SOURCE_CONFIG, "utf-8")) as LocalGameSourceConfig;
    if (typeof parsed?.gameRootPath === "string" && parsed.gameRootPath.trim()) {
      return {
        gameRootPath: normalizeRootPath(parsed.gameRootPath),
        lastValidated: typeof parsed.lastValidated === "string" ? parsed.lastValidated : new Date().toISOString(),
      };
    }
  } catch {}
  return null;
}

export function getLocalGameSourceState(): LocalGameSourceState {
  const config = readConfig();
  if (!config) {
    return {
      active: false,
      gameRootPath: null,
      dataRootPath: null,
      assetsRootPath: null,
      missionsRootPath: null,
      lastValidated: null,
      available: emptyAvailability(),
      errors: [],
    };
  }
  return deriveState(config.gameRootPath, config.lastValidated);
}

export async function setLocalGameSourceRoot(gameRootPath: string): Promise<LocalGameSourceState> {
  const normalizedPath = normalizeRootPath(gameRootPath);
  if (!normalizedPath) {
    throw new Error("Enter the local Gemini Station game root path before saving it.");
  }

  const nextState = deriveState(normalizedPath, new Date().toISOString());
  if (nextState.errors.length) {
    throw new Error(nextState.errors.join(" "));
  }

  const payload: LocalGameSourceConfig = {
    gameRootPath: normalizedPath,
    lastValidated: nextState.lastValidated ?? new Date().toISOString(),
  };

  await fsp.writeFile(LOCAL_GAME_SOURCE_CONFIG, JSON.stringify(payload, null, 2), "utf-8");
  return nextState;
}

export async function clearLocalGameSource(): Promise<LocalGameSourceState> {
  await fsp.rm(LOCAL_GAME_SOURCE_CONFIG, { force: true });
  return getLocalGameSourceState();
}
