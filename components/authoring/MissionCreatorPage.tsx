"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import MissionWorkshop from "@components/authoring/MissionWorkshop";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import type { MissionImportSummary, NormalizedMission } from "@lib/mission-lab/types";
import {
  MISSION_STORAGE_KEY,
  MissionDraft,
  createMissionDraft,
  normalizeImportedMission,
} from "@lib/authoring";

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
  const sessionId = useMissionLabSessionId();
  const [missions, setMissions] = useState<MissionDraft[]>([createMissionDraft()]);
  const [referenceMissions, setReferenceMissions] = useState<NormalizedMission[]>([]);
  const [workspaceSummary, setWorkspaceSummary] = useState<MissionImportSummary | null>(null);
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
    if (!sessionId) return;
    let cancelled = false;

    async function loadWorkspaceData() {
      try {
        const response = await fetch("/api/mission-lab/workspace", {
          headers: buildMissionLabSessionHeaders(sessionId),
        });
        const json = await response.json().catch(() => ({ summary: null, missions: [] }));
        if (cancelled) return;
        setWorkspaceSummary(json.summary ?? null);
        setReferenceMissions(Array.isArray(json.missions) ? json.missions : []);
      } catch {
        if (cancelled) return;
        setWorkspaceSummary(null);
        setReferenceMissions([]);
      }
    }

    void loadWorkspaceData();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const knownMissionIds = useMemo(() => {
    return Array.from(
      new Set([
        ...referenceMissions.map((mission) => mission.id.trim()).filter(Boolean),
        ...missions.map((mission) => mission.id.trim()).filter(Boolean),
      ]),
    ).sort((left, right) => left.localeCompare(right));
  }, [referenceMissions, missions]);

  function seedMissionDrafts() {
    if (!referenceMissions.length) {
      setWorkspaceMessage("No shared mission workspace is loaded. Import a missions zip on the Missions dashboard first.");
      return;
    }

    const seeded = referenceMissions.map((mission) => normalizeImportedMission(mission.raw));
    startTransition(() => {
      setMissions(seeded.length ? seeded : [createMissionDraft()]);
    });
    setWorkspaceMessage(`Seeded ${seeded.length} mission draft(s) from the shared imported workspace.`);
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
          Build mission drafts in the richer authoring model, seeded from the shared imported mission workspace when needed.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              Import a missions zip on the Missions dashboard to make its normalized mission data available here for draft seeding and prerequisite validation.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Draft missions</div>
                <div className="mt-1 text-2xl font-semibold">{missions.length}</div>
                <div className="mt-1 text-xs text-white/50">Imported mission seeds available: {referenceMissions.length}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Known mission ids</div>
                <div className="mt-1 text-2xl font-semibold">{knownMissionIds.length}</div>
                <div className="mt-1 text-xs text-white/50">
                  {workspaceSummary ? `Shared workspace source: ${workspaceSummary.sourceLabel ?? workspaceSummary.sourceType}` : "Import a workspace to add reference mission ids."}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn justify-center" onClick={seedMissionDrafts}>
              Seed Imported Missions
            </button>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearMissionDrafts}>
              Clear Missions
            </button>
          </div>
        </div>

        {!workspaceSummary ? (
          <div className="text-sm text-white/55">
            No shared mission workspace is loaded.{" "}
            <Link href="/missions" className="text-cyan-100 hover:text-white">
              Import one on the Missions dashboard.
            </Link>
          </div>
        ) : null}
        {workspaceMessage ? <div className="text-sm text-accent">{workspaceMessage}</div> : null}
      </div>

      <MissionWorkshop
        missions={missions}
        onChange={setMissions}
        knownMissionIds={knownMissionIds}
        consoleMissionCount={referenceMissions.length}
      />
    </div>
  );
}
