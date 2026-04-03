import fs from "fs";
import path from "path";
import { parseTresFields } from "./tres";
import { Ability } from "@lib/types";
import { exists, listFilesRecursive, readJson } from "./fileutils";

export function parseAbilityRegistry(repoRoot: string): Map<string | number, string> {
  const registryCandidates = [
    path.join(repoRoot, "data", "database", "abilities", "AbilityRegistry.gd"),
    path.join(repoRoot, "scripts", "abilities", "AbilityRegistry.gd")
  ];
  let registryPath = registryCandidates.find(exists);
  if (!registryPath) return new Map();

  const text = fs.readFileSync(registryPath, "utf-8");
  const rx = /abilities\s*\[\s*("?)(\d+|\w+)\1\s*\]\s*=\s*preload\(["']res:\/\/(.+?\.tres)["']\)/g;
  const out = new Map<string | number, string>();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const idRaw = m[2];
    const id: string | number = /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw;
    const resPath = m[3].replace(/^\/+/, "");
    out.set(id, path.join(repoRoot, resPath));
  }
  return out;
}

export function parseAbilities(repoRoot: string): Ability[] {
  const mapping = parseAbilityRegistry(repoRoot);
  const abilities: Ability[] = [];
  const seen = new Set<string | number>();

  const abilitiesDir = path.join(repoRoot, "scripts", "abilities");
  const tresFiles = new Set(listFilesRecursive(abilitiesDir, [".tres"]));
  for (const [_id, p] of mapping) tresFiles.add(p);

  for (const p of tresFiles) {
    try {
      const idMatch = Array.from(mapping.entries()).find(([, file]) => path.resolve(file) === path.resolve(p));
      const id = idMatch ? idMatch[0] : path.basename(p, ".tres");
      if (seen.has(id)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      const fields = parseTresFields(raw);
      abilities.push({
        id,
        name: (fields.name as string) || undefined,
        description: (fields.description as string) || undefined,
        cooldown: typeof fields.cooldown === "number" ? fields.cooldown : undefined,
        energy_cost: typeof fields.energy_cost === "number" ? fields.energy_cost : undefined,
        resource: p
      });
      seen.add(id);
    } catch {}
  }
  return abilities;
}

export function parseAbilitiesFromData(raw: Array<any> | Record<string, any> | null): Ability[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.map((a): Ability => ({
    id: a.id ?? a.key ?? a.name,
    name: a.name,
    description: a.description,
    cooldown: typeof a.cooldown === "number" ? a.cooldown : undefined,
    energy_cost: typeof a.energy_cost === "number" ? a.energy_cost : undefined,
    resource: a.resource
  }));
}

export function parseAbilitiesFromDataDirectory(repoRoot: string): Ability[] {
  const jsonDir = path.join(repoRoot, "data", "database", "abilities", "json");
  const indexPath = path.join(jsonDir, "_AbilityIndex.json");
  const indexData = readJson<Record<string, string>>(indexPath) || {};
  const files = new Set<string>();
  const idByPath = new Map<string, string | number>();

  for (const [id, rawPath] of Object.entries(indexData)) {
    const cleaned = String(rawPath).replace(/^res:\/\//, "").replace(/^\/+/, "");
    const absolute = path.join(repoRoot, cleaned.startsWith("data/") ? cleaned : path.join("data", "database", "abilities", "json", path.basename(cleaned)));
    files.add(absolute);
    idByPath.set(path.resolve(absolute), /^\d+$/.test(id) ? Number(id) : id);
  }

  for (const file of listFilesRecursive(jsonDir, [".json"])) {
    if (path.basename(file) === "_AbilityIndex.json") continue;
    files.add(file);
  }

  const abilities: Ability[] = [];
  const seen = new Set<string | number>();
  for (const file of Array.from(files)) {
    try {
      const raw = readJson<any>(file);
      if (!raw || typeof raw !== "object") continue;
      const properties = raw.properties && typeof raw.properties === "object" ? raw.properties : raw;
      const resolvedId = idByPath.get(path.resolve(file)) ?? raw.id ?? path.basename(file, ".json");
      if (seen.has(resolvedId)) continue;
      abilities.push({
        id: resolvedId,
        name: properties.name,
        description: properties.description,
        cooldown: typeof properties.cooldown === "number" ? properties.cooldown : undefined,
        energy_cost: typeof properties.energy_cost === "number" ? properties.energy_cost : undefined,
        resource: file,
      });
      seen.add(resolvedId);
    } catch {}
  }

  return abilities;
}
