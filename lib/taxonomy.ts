import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const DEFAULT_CLASS_NAMES = ["Soldier", "Entrepreneur", "Scout", "Engineer", "Miner"];

const TAXONOMY_CONFIG_PATH = path.resolve(process.cwd(), ".gemini-taxonomy.json");

type TaxonomyConfig = {
  factions?: string[];
  classes?: string[];
};

export type FactionCatalogEntry = {
  name: string;
  defaultPoints: number | null;
  forcedPoints: number | null;
  source: "game" | "console";
};

export type TaxonomyCatalog = {
  factions: FactionCatalogEntry[];
  classes: string[];
  sources: {
    factions: "game" | "console" | "default";
    classes: "console" | "default";
  };
};

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueSortedNames(values: unknown[]) {
  return Array.from(new Set(values.map(cleanName).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function readConfig(): TaxonomyConfig {
  if (!fs.existsSync(TAXONOMY_CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(TAXONOMY_CONFIG_PATH, "utf-8")) as TaxonomyConfig;
    return {
      factions: Array.isArray(parsed.factions) ? uniqueSortedNames(parsed.factions) : undefined,
      classes: Array.isArray(parsed.classes) ? uniqueSortedNames(parsed.classes) : undefined,
    };
  } catch {
    return {};
  }
}

async function writeConfig(config: TaxonomyConfig) {
  await fsp.writeFile(TAXONOMY_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function parseGdStringNumberDictionary(source: string, constantName: string) {
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*:\\s*Dictionary\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return new Map<string, number>();

  const out = new Map<string, number>();
  const body = match[1];
  const entryPattern = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?|MIN_REPUTATION_POINTS|MAX_REPUTATION_POINTS)/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryPattern.exec(body))) {
    const [, name, rawValue] = entry;
    const value = rawValue === "MIN_REPUTATION_POINTS" ? -50000 : rawValue === "MAX_REPUTATION_POINTS" ? 100000 : Number(rawValue);
    if (Number.isFinite(value)) out.set(name, value);
  }

  return out;
}

export async function readGameFactions(): Promise<FactionCatalogEntry[]> {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) return [];

  const reputationPath = path.join(localGameSource.gameRootPath, "data", "database", "reputation", "PlayerReputation.gd");
  const source = await fsp.readFile(reputationPath, "utf-8");
  const defaults = parseGdStringNumberDictionary(source, "DEFAULT_FACTION_POINTS");
  const forced = parseGdStringNumberDictionary(source, "FORCED_FACTION_POINTS");
  return Array.from(defaults.entries())
    .map(([name, defaultPoints]) => ({
      name,
      defaultPoints,
      forcedPoints: forced.get(name) ?? null,
      source: "game" as const,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function readTaxonomyCatalog(): Promise<TaxonomyCatalog> {
  const config = readConfig();
  let gameFactions: FactionCatalogEntry[] = [];
  try {
    gameFactions = await readGameFactions();
  } catch {
    gameFactions = [];
  }

  const factionSource = config.factions?.length ? "console" : gameFactions.length ? "game" : "default";
  const factionNames = config.factions?.length ? config.factions : gameFactions.map((entry) => entry.name);
  const gameFactionByName = new Map(gameFactions.map((entry) => [entry.name, entry]));
  const factions = uniqueSortedNames(factionNames).map((name) => gameFactionByName.get(name) ?? {
    name,
    defaultPoints: null,
    forcedPoints: null,
    source: "console" as const,
  });

  return {
    factions,
    classes: config.classes?.length ? config.classes : [...DEFAULT_CLASS_NAMES],
    sources: {
      factions: factionSource,
      classes: config.classes?.length ? "console" : "default",
    },
  };
}

export async function saveTaxonomyCatalog(input: { factions?: unknown[]; classes?: unknown[] }) {
  const current = await readTaxonomyCatalog();
  const next: TaxonomyConfig = {
    factions: input.factions ? uniqueSortedNames(input.factions) : current.factions.map((entry) => entry.name),
    classes: input.classes ? uniqueSortedNames(input.classes) : current.classes,
  };
  await writeConfig(next);
  return readTaxonomyCatalog();
}
