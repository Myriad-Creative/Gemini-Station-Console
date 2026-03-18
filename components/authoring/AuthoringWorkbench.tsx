"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import MissionWorkshop from "@components/authoring/MissionWorkshop";
import ModWorkshop from "@components/authoring/ModWorkshop";
import {
  MISSION_STORAGE_KEY,
  MOD_STORAGE_KEY,
  MissionDraft,
  ModDraft,
  createMissionDraft,
  createModDraft,
  normalizeImportedMission,
  normalizeImportedMod,
} from "@lib/authoring";

type ExistingMissionRow = {
  id: string;
  title: string;
  giver_id?: string;
  faction?: string;
  arcs?: string[];
  tags?: string[];
  repeatable?: boolean;
  level_min?: number;
  level_max?: number;
  objectives?: unknown[];
};

type ExistingModRow = {
  id: string;
  name: string;
  slot: string;
  classRestriction?: string[];
  levelRequirement?: number;
  itemLevel?: number;
  rarity?: number;
  durability?: number;
  sellPrice?: number;
  stats?: Record<string, number>;
  abilities?: Array<number | string>;
  icon?: string;
  description?: string;
};

function loadDrafts<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export default function AuthoringWorkbench() {
  const [tab, setTab] = useState<"missions" | "mods">("missions");
  const [missions, setMissions] = useState<MissionDraft[]>([createMissionDraft()]);
  const [mods, setMods] = useState<ModDraft[]>([createModDraft()]);
  const [existingMissions, setExistingMissions] = useState<ExistingMissionRow[]>([]);
  const [existingMods, setExistingMods] = useState<ExistingModRow[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedMissions = loadDrafts<MissionDraft[]>(MISSION_STORAGE_KEY, []);
    const storedMods = loadDrafts<ModDraft[]>(MOD_STORAGE_KEY, []);

    setMissions(storedMissions.length ? storedMissions : [createMissionDraft()]);
    setMods(storedMods.length ? storedMods.map((mod) => normalizeImportedMod(mod)) : [createModDraft()]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(missions));
  }, [hydrated, missions]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(mods));
  }, [hydrated, mods]);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleData() {
      try {
        const [missionsResponse, modsResponse] = await Promise.all([fetch("/api/missions"), fetch("/api/mods")]);
        const missionsJson = await missionsResponse.json().catch(() => ({ rows: [] }));
        const modsJson = await modsResponse.json().catch(() => ({ data: [] }));
        if (cancelled) return;

        setExistingMissions(Array.isArray(missionsJson.rows) ? missionsJson.rows : []);
        setExistingMods(Array.isArray(modsJson.data) ? modsJson.data : []);
      } catch {
        if (cancelled) return;
        setExistingMissions([]);
        setExistingMods([]);
      }
    }

    loadConsoleData();

    return () => {
      cancelled = true;
    };
  }, []);

  const knownMissionIds = useMemo(() => {
    return Array.from(
      new Set([
        ...existingMissions.map((mission) => mission.id.trim()).filter(Boolean),
        ...missions.map((mission) => mission.id.trim()).filter(Boolean),
      ]),
    ).sort((left, right) => left.localeCompare(right));
  }, [existingMissions, missions]);

  function seedMissionDrafts() {
    if (!existingMissions.length) {
      setWorkspaceMessage("No mission data is currently loaded in the console.");
      setTab("missions");
      return;
    }

    const seeded = existingMissions.map((mission) => normalizeImportedMission(mission));
    startTransition(() => {
      setMissions(seeded.length ? seeded : [createMissionDraft()]);
      setTab("missions");
    });
    setWorkspaceMessage(`Seeded ${seeded.length} mission draft(s) from the current console data.`);
  }

  function seedModDrafts() {
    if (!existingMods.length) {
      setWorkspaceMessage("No mod data is currently loaded in the console.");
      setTab("mods");
      return;
    }

    const seeded = existingMods.map((mod) => normalizeImportedMod(mod));
    startTransition(() => {
      setMods(seeded.length ? seeded : [createModDraft()]);
      setTab("mods");
    });
    setWorkspaceMessage(`Seeded ${seeded.length} mod draft(s) from the current console data.`);
  }

  function clearMissionDrafts() {
    setMissions([createMissionDraft()]);
    setTab("missions");
    setWorkspaceMessage("Cleared mission drafts.");
  }

  function clearModDrafts() {
    setMods([createModDraft()]);
    setTab("mods");
    setWorkspaceMessage("Cleared mod drafts.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Authoring Workspace</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Build missions and mods in the console, validate drafts live, and export JSON files you can drop into the
            game repo or paste into the runtime data set.
          </p>
        </div>

        <div className="flex gap-2 rounded-lg border border-white/10 bg-white/5 p-1">
          <button
            className={`rounded px-3 py-2 text-sm transition ${tab === "missions" ? "bg-accent text-black" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
            onClick={() => setTab("missions")}
          >
            Mission Builder
          </button>
          <button
            className={`rounded px-3 py-2 text-sm transition ${tab === "mods" ? "bg-accent text-black" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
            onClick={() => setTab("mods")}
          >
            Mod Builder
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              The console&apos;s read-only mission feed is normalized and may not contain every runtime field. The
              authoring model here is intentionally richer, keeps custom fields in `extra JSON` blocks, and exports a
              compatibility-first JSON shape.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Draft missions</div>
                <div className="mt-1 text-2xl font-semibold">{missions.length}</div>
                <div className="mt-1 text-xs text-white/50">Console mission seeds available: {existingMissions.length}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Draft mods</div>
                <div className="mt-1 text-2xl font-semibold">{mods.length}</div>
                <div className="mt-1 text-xs text-white/50">Console mod seeds available: {existingMods.length}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn justify-center" onClick={seedMissionDrafts}>
              Seed Mission Drafts
            </button>
            <button className="btn justify-center" onClick={seedModDrafts}>
              Seed Mod Drafts
            </button>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearMissionDrafts}>
              Clear Missions
            </button>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearModDrafts}>
              Clear Mods
            </button>
          </div>
        </div>

        {workspaceMessage ? <div className="text-sm text-accent">{workspaceMessage}</div> : null}
      </div>

      {tab === "missions" ? (
        <MissionWorkshop
          missions={missions}
          onChange={setMissions}
          knownMissionIds={knownMissionIds}
          consoleMissionCount={existingMissions.length}
        />
      ) : (
        <ModWorkshop mods={mods} onChange={setMods} consoleModCount={existingMods.length} />
      )}
    </div>
  );
}
