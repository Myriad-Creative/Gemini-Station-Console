import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import JSON5 from "json5";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import type { AiAbilityOption, AiAbilityRef, AiJsonValue, AiProfile, AiProfilesResponse } from "@lib/ai-manager/types";
import { getLocalGameSourceState } from "@lib/local-game-source";

type JsonObject = Record<string, unknown>;

const AI_DIRECTORY = path.join("data", "database", "AI");
const MOBS_FILE = path.join("data", "database", "mobs", "mobs.json");

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringOrEmpty(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseJsonText(text: string) {
  return JSON5.parse(text.replace(/^\uFEFF/, "")) as unknown;
}

function toJsonValue(value: unknown): AiJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).map(([key, entry]) => [key, toJsonValue(entry)]));
  }
  return null;
}

function normalizeAbilityRefs(value: unknown): AiAbilityRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): AiAbilityRef | null => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const source = entry as JsonObject;
        const id = stringOrEmpty(source.id);
        if (!id) return null;
        return {
          id,
          weight: numberOrNull(source.weight),
          cooldownPriority: stringOrEmpty(source.cooldown_priority) || null,
        };
      }
      const id = stringOrEmpty(entry);
      return id ? { id } : null;
    })
    .filter((entry): entry is AiAbilityRef => Boolean(entry));
}

function objectKeys(value: unknown) {
  const source = asObject(value);
  return Object.keys(source).sort((left, right) => left.localeCompare(right));
}

function stringListFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function collectBehaviorSections(source: JsonObject) {
  return [
    "on_combat_start",
    "combat_conditions",
    "retreat_conditions",
    "movement",
    "combat",
  ].filter((key) => key in source);
}

async function loadMobAiUsage(gameRootPath: string) {
  const mobsPath = path.join(gameRootPath, MOBS_FILE);
  const usage = new Map<string, string[]>();
  if (!fs.existsSync(mobsPath)) return usage;

  const parsed = parseJsonText(await fsp.readFile(mobsPath, "utf-8"));
  const entries = Array.isArray(parsed) ? parsed : Object.values(asObject(parsed));
  for (const entry of entries) {
    const mob = asObject(entry);
    const aiType = stringOrEmpty(mob.ai_type);
    if (!aiType) continue;
    const mobId = stringOrEmpty(mob.id) || stringOrEmpty(mob.display_name) || "Unnamed mob";
    const current = usage.get(aiType) ?? [];
    current.push(mobId);
    usage.set(aiType, current);
  }
  return usage;
}

function profileAliases(fileBaseName: string, source: JsonObject) {
  return Array.from(
    new Set([fileBaseName, stringOrEmpty(source.id), stringOrEmpty(source.ai_type)].filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

function buildProfile(fileName: string, rawText: string, parsed: unknown, mobUsage: Map<string, string[]>): AiProfile {
  const source = asObject(parsed);
  const fileBaseName = path.basename(fileName, ".json");
  const aliases = profileAliases(fileBaseName, source);
  const referencedByMobIds = Array.from(
    new Set(aliases.flatMap((alias) => mobUsage.get(alias) ?? [])),
  ).sort((left, right) => left.localeCompare(right));

  return {
    key: fileBaseName,
    fileName,
    relativePath: path.join(AI_DIRECTORY, fileName),
    id: stringOrEmpty(source.id) || fileBaseName,
    aiType: stringOrEmpty(source.ai_type) || fileBaseName,
    tags: stringListFromUnknown(source.tags),
    notes: stringOrEmpty(source.notes),
    script: stringOrEmpty(source.script) || null,
    aggroRange: numberOrNull(source.aggro_range),
    weaponRange: numberOrNull(source.weapon_range),
    mainAbilities: normalizeAbilityRefs(source.main_abilities),
    secondaryAbilities: normalizeAbilityRefs(source.secondary_abilities),
    behaviorSections: collectBehaviorSections(source),
    movementKeys: objectKeys(source.movement),
    combatKeys: objectKeys(source.combat),
    aliases,
    referencedByMobCount: referencedByMobIds.length,
    referencedByMobIds,
    parseError: null,
    rawJson: JSON.stringify(parsed, null, 2),
    data: toJsonValue(source) as Record<string, AiJsonValue>,
  };
}

function buildParseErrorProfile(fileName: string, rawText: string, error: unknown): AiProfile {
  const fileBaseName = path.basename(fileName, ".json");
  return {
    key: fileBaseName,
    fileName,
    relativePath: path.join(AI_DIRECTORY, fileName),
    id: fileBaseName,
    aiType: fileBaseName,
    tags: [],
    notes: "",
    script: null,
    aggroRange: null,
    weaponRange: null,
    mainAbilities: [],
    secondaryAbilities: [],
    behaviorSections: [],
    movementKeys: [],
    combatKeys: [],
    aliases: [fileBaseName],
    referencedByMobCount: 0,
    referencedByMobIds: [],
    parseError: error instanceof Error ? error.message : String(error),
    rawJson: rawText,
    data: null,
  };
}

function loadAbilityOptions(gameRootPath: string): AiAbilityOption[] {
  try {
    return loadAbilityManagerDatabase(gameRootPath).abilities
      .map((ability) => ({
        id: ability.id,
        name: ability.name || ability.id,
        description: ability.description || undefined,
        minRangeType: ability.minRangeType.trim() || null,
        maxRangeType: ability.maxRangeType.trim() || null,
        attackRange: ability.attackRange.trim() ? Number(ability.attackRange.trim()) : null,
      }))
      .sort((left, right) => {
        const leftId = Number(left.id);
        const rightId = Number(right.id);
        if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
        return `${left.name} ${left.id}`.localeCompare(`${right.name} ${right.id}`);
      });
  } catch {
    return [];
  }
}

export async function loadAiProfiles(): Promise<AiProfilesResponse> {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath || !local.available.data) {
    return {
      ok: false,
      sourceRoot: local.gameRootPath,
      aiDirectory: null,
      summary: {
        totalProfiles: 0,
        parseErrors: 0,
        profilesWithScripts: 0,
        profilesUsedByMobs: 0,
        referencedByMobsOnly: [],
      },
      profiles: [],
      abilityOptions: [],
      error: local.gameRootPath ? local.errors.join(" ") || "Local game source is not available." : "No local game source is configured.",
    };
  }

  const aiDirectory = path.join(local.gameRootPath, AI_DIRECTORY);
  if (!fs.existsSync(aiDirectory)) {
    return {
      ok: false,
      sourceRoot: local.gameRootPath,
      aiDirectory,
      summary: {
        totalProfiles: 0,
        parseErrors: 0,
        profilesWithScripts: 0,
        profilesUsedByMobs: 0,
        referencedByMobsOnly: [],
      },
      profiles: [],
      abilityOptions: [],
      error: `Missing AI directory at ${AI_DIRECTORY}.`,
    };
  }

  const [entries, mobUsage] = await Promise.all([
    fsp.readdir(aiDirectory, { withFileTypes: true }),
    loadMobAiUsage(local.gameRootPath).catch(() => new Map<string, string[]>()),
  ]);
  const abilityOptions = loadAbilityOptions(local.gameRootPath);

  const profiles: AiProfile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const absolutePath = path.join(aiDirectory, entry.name);
    const rawText = await fsp.readFile(absolutePath, "utf-8");
    try {
      profiles.push(buildProfile(entry.name, rawText, parseJsonText(rawText), mobUsage));
    } catch (error) {
      profiles.push(buildParseErrorProfile(entry.name, rawText, error));
    }
  }

  profiles.sort((left, right) => left.fileName.localeCompare(right.fileName));

  const knownAliases = new Set(profiles.flatMap((profile) => profile.aliases));
  const referencedByMobsOnly = Array.from(mobUsage.keys())
    .filter((aiType) => !knownAliases.has(aiType))
    .sort((left, right) => left.localeCompare(right));

  return {
    ok: true,
    sourceRoot: local.gameRootPath,
    aiDirectory,
    summary: {
      totalProfiles: profiles.length,
      parseErrors: profiles.filter((profile) => profile.parseError).length,
      profilesWithScripts: profiles.filter((profile) => profile.script).length,
      profilesUsedByMobs: profiles.filter((profile) => profile.referencedByMobCount > 0).length,
      referencedByMobsOnly,
    },
    profiles,
    abilityOptions,
  };
}
