import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import JSON5 from "json5";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { ShipJsonObject, ShipJsonValue, ShipProfile, ShipProfilesResponse } from "@lib/ship-lab/types";
import { normalizeShipThrusterDrafts, normalizeShipWeaponChargePointDrafts } from "@lib/ship-lab/utils";

const SHIPS_DIRECTORY = path.join("data", "ships");

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringOrEmpty(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberRecord(value: unknown) {
  const source = asObject(value);
  const next: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "number" && Number.isFinite(entry)) next[key] = entry;
    else if (typeof entry === "string") next[key] = entry;
  }
  return next;
}

function stringListFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function jsonArrayFromUnknown(value: unknown): ShipJsonValue[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toJsonValue(entry));
}

function toJsonValue(value: unknown): ShipJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).map(([key, entry]) => [key, toJsonValue(entry)]));
  }
  return null;
}

function parseJsonText(text: string) {
  return JSON5.parse(text.replace(/^\uFEFF/, "")) as unknown;
}

function buildProfile(fileName: string, rawText: string, entry: unknown, profileIndex: number | null): ShipProfile {
  const data = toJsonValue(asObject(entry)) as ShipJsonObject;
  const fileBaseName = path.basename(fileName, ".json");
  const id = stringOrEmpty(data.id) || fileBaseName;
  return {
    key: profileIndex === null ? fileBaseName : `${fileBaseName}-${profileIndex}`,
    fileName,
    relativePath: path.join(SHIPS_DIRECTORY, fileName),
    profileIndex,
    id,
    displayName: stringOrEmpty(data.display_name) || id,
    description: stringOrEmpty(data.description),
    scene: stringOrEmpty(data.scene),
    sprite: stringOrEmpty(data.sprite),
    starter: data.starter === true,
    stats: numberRecord(data.stats),
    modSlots: numberRecord(data.mod_slots),
    cargo: toJsonValue(asObject(data.cargo)) as ShipJsonObject,
    purchase: toJsonValue(asObject(data.purchase)) as ShipJsonObject,
    tags: stringListFromUnknown(data.tags),
    abilities: jsonArrayFromUnknown(data.abilities),
    thrusters: normalizeShipThrusterDrafts(data.thrusters),
    weaponChargePoints: normalizeShipWeaponChargePointDrafts(data),
    parseError: null,
    rawJson: JSON.stringify(data, null, 2),
    data,
  };
}

function buildParseErrorProfile(fileName: string, rawText: string, error: unknown): ShipProfile {
  const fileBaseName = path.basename(fileName, ".json");
  return {
    key: fileBaseName,
    fileName,
    relativePath: path.join(SHIPS_DIRECTORY, fileName),
    profileIndex: null,
    id: fileBaseName,
    displayName: fileBaseName,
    description: "",
    scene: "",
    sprite: "",
    starter: false,
    stats: {},
    modSlots: {},
    cargo: {},
    purchase: {},
    tags: [],
    abilities: [],
    thrusters: [],
    weaponChargePoints: [],
    parseError: error instanceof Error ? error.message : String(error),
    rawJson: rawText,
    data: null,
  };
}

export async function loadShipProfiles(): Promise<ShipProfilesResponse> {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data) {
    return {
      ok: false,
      sourceRoot: local.gameRootPath,
      shipsDirectory: null,
      summary: { totalProfiles: 0, starterCount: 0, parseErrors: 0 },
      profiles: [],
      error: local.gameRootPath ? local.errors.join(" ") || "Local game source is not available." : "No local game source is configured.",
    };
  }

  const shipsDirectory = path.join(local.gameRootPath, SHIPS_DIRECTORY);
  if (!fs.existsSync(shipsDirectory)) {
    return {
      ok: false,
      sourceRoot: local.gameRootPath,
      shipsDirectory,
      summary: { totalProfiles: 0, starterCount: 0, parseErrors: 0 },
      profiles: [],
      error: `Missing ship directory at ${SHIPS_DIRECTORY}.`,
    };
  }

  const entries = await fsp.readdir(shipsDirectory, { withFileTypes: true });
  const profiles: ShipProfile[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const absolutePath = path.join(shipsDirectory, entry.name);
    const rawText = await fsp.readFile(absolutePath, "utf-8");
    try {
      const parsed = parseJsonText(rawText);
      const root = asObject(parsed);
      if (Array.isArray(root.profiles)) {
        root.profiles.forEach((profile, index) => profiles.push(buildProfile(entry.name, rawText, profile, index)));
      } else {
        profiles.push(buildProfile(entry.name, rawText, parsed, null));
      }
    } catch (error) {
      profiles.push(buildParseErrorProfile(entry.name, rawText, error));
    }
  }

  return {
    ok: true,
    sourceRoot: local.gameRootPath,
    shipsDirectory,
    summary: {
      totalProfiles: profiles.length,
      starterCount: profiles.filter((profile) => profile.starter).length,
      parseErrors: profiles.filter((profile) => profile.parseError).length,
    },
    profiles,
  };
}
