import { Ability, Hole, Mission, Mob, Mod, Outlier, Summary, Item } from "@lib/types";
import { DataUrls, getConfig } from "@lib/config";
import { parseModsFromData } from "@parser/mods";
import { parseAbilitiesFromData } from "@parser/abilities";
import { parseMobsFromData } from "@parser/mobs";
import { parseMissionsFromData } from "@parser/missions";
import { parseItemsFromData } from "@parser/items";
import { computeOutliers } from "@parser/stats";
import { readJsonFromUrl } from "@parser/fileutils";
import { parseLooseJson } from "@lib/json";

type Store = {
  manifestUrl: string | null;
  dataUrls: DataUrls | null;
  mods: Mod[];
  abilities: Ability[];
  mobs: Mob[];
  missions: Mission[];
  items: Item[];
  lastLoaded?: string;
  errors: string[];
};

const G = global as any;
if (!G.__GEMINI_STORE__) {
  G.__GEMINI_STORE__ = <Store>{
    manifestUrl: null,
    dataUrls: null,
    mods: [],
    abilities: [],
    mobs: [],
    missions: [],
    items: [],
    errors: []
  };
}
const STORE: Store = G.__GEMINI_STORE__;

export function getStore() { return STORE; }

export async function warmupLoadIfNeeded(): Promise<void> {
  if (!STORE.lastLoaded) {
    try { await loadAll(); } catch {}
  }
}

async function fetchJson<T = any>(url?: string | null): Promise<{ data: T | null; error?: string }> {
  if (!url) return { data: null, error: "URL not provided" };
  try {
    const data = await readJsonFromUrl<T>(url);
    return { data };
  } catch (e: any) {
    return { data: null, error: `Failed to fetch ${url}: ${e?.message || e}` };
  }
}

async function loadModsData(url?: string | null, overrideJson?: string | null): Promise<{ data: any | null; error?: string }> {
  if (overrideJson?.trim()) {
    try {
      return { data: parseLooseJson(overrideJson) };
    } catch (e: any) {
      return { data: null, error: `Invalid Mods.json override: ${e?.message || e}` };
    }
  }
  return fetchJson(url);
}

export async function loadAll(): Promise<Store> {
  STORE.errors = [];
  const cfg = getConfig();
  const dataUrls: DataUrls = { ...(cfg.data_urls || {}) };
  const usingModsOverride = !!cfg.mods_override_json?.trim();
  STORE.manifestUrl = null;
  STORE.dataUrls = dataUrls;
  const missingRequired = ["mods", "items"].filter(k => {
    if (k === "mods" && usingModsOverride) return false;
    return !(dataUrls as any)?.[k];
  });
  if (missingRequired.length) {
    STORE.errors.push(`Missing URLs for: ${missingRequired.join(", ")}`);
  }
  try {
    const fetchResults = await Promise.all([
      loadModsData(dataUrls?.mods, cfg.mods_override_json ?? null),
      fetchJson(dataUrls?.items),
      fetchJson(dataUrls?.mobs),
      fetchJson(dataUrls?.missions),
      fetchJson(dataUrls?.abilities)
    ]);
    const [modsRes, itemsRes, mobsRes, missionsRes, abilitiesRes] = fetchResults;
    const [modsData, itemsData, mobsData, missionsData, abilitiesData] = [modsRes.data, itemsRes.data, mobsRes.data, missionsRes.data, abilitiesRes.data];
    const urlMap: Array<[keyof DataUrls, { data: any; error?: string }]> = [
      ["mods", modsRes],
      ["items", itemsRes],
      ["mobs", mobsRes],
      ["missions", missionsRes],
      ["abilities", abilitiesRes]
    ];
    for (const [k, res] of urlMap) {
      if (res.error && (dataUrls as any)?.[k]) STORE.errors.push(res.error);
    }

    const mobs = parseMobsFromData(mobsData);
    if (dataUrls?.mobs && !mobs.length) STORE.errors.push(`Loaded zero mobs from ${dataUrls.mobs}`);
    const mobIndex = new Map(mobs.map(m => [String(m.id), m]));

    const missions = parseMissionsFromData(missionsData, mobIndex);
    if (dataUrls?.missions && !missions.length) STORE.errors.push(`Loaded zero missions from ${dataUrls.missions}`);

    const abilities = parseAbilitiesFromData(abilitiesData);
    if (dataUrls?.abilities && !abilities.length) STORE.errors.push(`Loaded zero abilities from ${dataUrls.abilities}`);

    const mods = parseModsFromData(modsData);
    if (usingModsOverride && !mods.length) STORE.errors.push("Loaded zero mods from the saved Mods.json override.");
    else if (dataUrls?.mods && !mods.length) STORE.errors.push(`Loaded zero mods from ${dataUrls.mods}`);

    const items = parseItemsFromData(itemsData);
    if (dataUrls?.items && !items.length) STORE.errors.push(`Loaded zero items from ${dataUrls.items}`);

    STORE.mods = mods;
    STORE.items = items;
    STORE.abilities = abilities;
    STORE.mobs = mobs;
    STORE.missions = missions;
    STORE.lastLoaded = new Date().toISOString();
    if (!mods.length && !missions.length && !mobs.length && !items.length && !abilities.length) {
      STORE.errors.push('Parsed zero records. Check manifest and source URLs.');
    }
  } catch (e: any) {
    STORE.errors.push(String(e?.message || e));
  }
  return STORE;
}

// --------- Queries & summaries ----------

export function getSummary(): Summary {
  const cfg = getConfig();
  const { level_bands, coverage_threshold_per_slot, zscore_threshold } = cfg;
  const mods = STORE.mods;
  const missions = STORE.missions;

  // Missions per band
  const bandCounts = level_bands.map(([a,b]) => {
    const count = missions.filter(ms => {
      const lv = ms.has_explicit_gating
        ? (ms.level_min ?? ms.level_max ?? ms.inferred_level ?? 0)
        : (ms.inferred_level ?? 0);
      return lv >= a && lv <= b;
    }).length;
    return { band: `${a}-${b}`, count };
  });

  // Coverage (slot x level) across 1..100, plus banded coverage
  const coverageMap = new Map<string, number>(); // key: slot::level
  const slots = new Set(mods.map(m => m.slot));
  for (const m of mods) {
    const key = `${m.slot}::${m.levelRequirement}`;
    coverageMap.set(key, (coverageMap.get(key) ?? 0) + 1);
  }
  const coverage: { slot: string; level: number; count: number }[] = [];
  const allLevels = Array.from({length: 100}, (_,i)=>i+1);
  for (const slot of Array.from(slots).sort()) {
    for (const lv of allLevels) {
      const key = `${slot}::${lv}`;
      coverage.push({ slot, level: lv, count: coverageMap.get(key) ?? 0 });
    }
  }

  const bandLabels = level_bands.map(([a,b]) => `${a}-${b}`);
  const coverageBandsMap = new Map<string, number>(); // key: slot::band
  function bandOf(level:number){ for (const [a,b] of level_bands){ if(level>=a && level<=b) return `${a}-${b}`;} return bandLabels[0]; }
  for (const m of mods) {
    const band = bandOf(m.levelRequirement);
    const key = `${m.slot}::${band}`;
    coverageBandsMap.set(key, (coverageBandsMap.get(key) ?? 0) + 1);
  }
  const modsCoverageBands: { slot: string; band: string; count: number }[] = [];
  for (const slot of Array.from(slots).sort()) {
    for (const band of bandLabels) {
      const key = `${slot}::${band}`;
      modsCoverageBands.push({ slot, band, count: coverageBandsMap.get(key) ?? 0 });
    }
  }

  // Rarity counts
  const rarityCounts: { rarity: number; count: number }[] = [];
  const rarityMap = new Map<number, number>();
  for (const m of mods) rarityMap.set(m.rarity, (rarityMap.get(m.rarity) ?? 0) + 1);
  for (const [r, c] of Array.from(rarityMap.entries()).sort((a,b)=>a[0]-b[0])) rarityCounts.push({ rarity: r, count: c });

  // Holes (legacy list)
  const holes: any[] = [];
  const perLevelSlot = new Map<string, number>();
  for (const m of mods) {
    const k = `${m.slot}::${m.levelRequirement}`;
    perLevelSlot.set(k, (perLevelSlot.get(k) ?? 0) + 1);
  }
  for (const slot of Array.from(slots)) {
    for (const lv of allLevels) {
      const k = `${slot}::${lv}`;
      const c = perLevelSlot.get(k) ?? 0;
      if (c < coverage_threshold_per_slot) {
        holes.push({ slot, level: lv, count: c, required: coverage_threshold_per_slot });
      }
    }
  }

  // Outliers
  const outliers: Outlier[] = computeOutliers(mods, zscore_threshold);

  return { missionsByBand: bandCounts, modsCoverage: coverage, modsCoverageBands, bandLabels, rarityCounts, holes, outliers };
}

export function queryMods(q: {
  slot?: string;
  level_min?: number;
  level_max?: number;
  rarity?: number[];
  classRestriction?: string;
  stat?: string;
  ability?: string;
  search?: string;
}) {
  let rows = STORE.mods.slice();
  if (q.slot) rows = rows.filter(m => m.slot === q.slot);
  if (q.level_min != null) rows = rows.filter(m => m.levelRequirement >= (q.level_min as number));
  if (q.level_max != null) rows = rows.filter(m => m.levelRequirement <= (q.level_max as number));
  if (q.rarity && q.rarity.length) rows = rows.filter(m => q.rarity!.includes(m.rarity));
  if (q.classRestriction) rows = rows.filter(m => (m.classRestriction || []).includes(q.classRestriction!));
  if (q.stat) rows = rows.filter(m => Object.prototype.hasOwnProperty.call(m.stats, q.stat!));
  if (q.ability) rows = rows.filter(m => (m.abilities || []).map(String).includes(String(q.ability)));
  if (q.search) {
    const s = q.search.toLowerCase();
    rows = rows.filter(m =>
      m.name.toLowerCase().includes(s) ||
      m.id.toLowerCase().includes(s)
    );
  }
  return rows;
}

export function queryMissions(q: { band?: [number, number] }) {
  const cfg = getConfig();
  let rows = STORE.missions.slice();
  if (q.band) {
    const [a, b] = q.band;
    rows = rows.filter(ms => {
      const lv = ms.has_explicit_gating
        ? (ms.level_min ?? ms.level_max ?? ms.inferred_level ?? 0)
        : (ms.inferred_level ?? 0);
      return lv >= a && lv <= b;
    });
  }
  return { rows, bands: cfg.level_bands };
}
