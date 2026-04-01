"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import MissionWorkshop from "@components/authoring/MissionWorkshop";
import {
  MISSION_STORAGE_KEY,
  MissionDraft,
  createMissionDraft,
  normalizeImportedMission,
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

function loadDrafts<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function MissionCreatorPage() {
  const [missions, setMissions] = useState<MissionDraft[]>([createMissionDraft()]);
  const [existingMissions, setExistingMissions] = useState<ExistingMissionRow[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadDrafts<MissionDraft[]>(MISSION_STORAGE_KEY, []);
    setMissions(stored.length ? stored : [createMissionDraft()]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(missions));
  }, [hydrated, missions]);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleData() {
      try {
        const response = await fetch("/api/missions");
        const json = await response.json().catch(() => ({ rows: [] }));
        if (cancelled) return;
        setExistingMissions(Array.isArray(json.rows) ? json.rows : []);
      } catch {
        if (cancelled) return;
        setExistingMissions([]);
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
      return;
    }

    const seeded = existingMissions.map((mission) => normalizeImportedMission(mission));
    startTransition(() => {
      setMissions(seeded.length ? seeded : [createMissionDraft()]);
    });
    setWorkspaceMessage(`Seeded ${seeded.length} mission draft(s) from the current console data.`);
  }

  function clearMissionDrafts() {
    setMissions([createMissionDraft()]);
    setWorkspaceMessage("Cleared mission drafts.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Mission Creator</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Build mission drafts in the richer authoring model, validate them live, and export JSON you can drop into the game repo.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              The console&apos;s read-only mission feed is normalized and may not contain every runtime field. This creator keeps richer
              authoring data in `extra JSON` blocks and exports a compatibility-first mission shape.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Draft missions</div>
                <div className="mt-1 text-2xl font-semibold">{missions.length}</div>
                <div className="mt-1 text-xs text-white/50">Console mission seeds available: {existingMissions.length}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Known mission ids</div>
                <div className="mt-1 text-2xl font-semibold">{knownMissionIds.length}</div>
                <div className="mt-1 text-xs text-white/50">Used for prerequisite validation and duplicate checks.</div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn justify-center" onClick={seedMissionDrafts}>
              Seed Mission Drafts
            </button>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearMissionDrafts}>
              Clear Missions
            </button>
          </div>
        </div>

        {workspaceMessage ? <div className="text-sm text-accent">{workspaceMessage}</div> : null}
      </div>

      <MissionWorkshop
        missions={missions}
        onChange={setMissions}
        knownMissionIds={knownMissionIds}
        consoleMissionCount={existingMissions.length}
      />
    </div>
  );
}
