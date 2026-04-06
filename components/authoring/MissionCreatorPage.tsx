"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import MissionWorkshop from "@components/authoring/MissionWorkshop";
import type { MissionDraft } from "@lib/mission-authoring";
import { createMissionDraft, hydrateStoredMissionDraft, normalizeImportedMission } from "@lib/mission-authoring";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import type { MissionImportSummary, NormalizedMission } from "@lib/mission-lab/types";
import {
  clearMissionCreatorWorkspaceStorage,
  MISSION_CREATOR_CLEARED_EVENT,
  MISSION_STORAGE_KEY,
  MISSION_WORKSPACE_SEED_KEY,
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
  const lastAutoSeedRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = loadDrafts<MissionDraft[]>(MISSION_STORAGE_KEY, []);
    setMissions(stored.length ? stored.map((mission) => hydrateStoredMissionDraft(mission)) : [createMissionDraft()]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(missions));
  }, [hydrated, missions]);

  useEffect(() => {
    function handleWorkspaceCleared() {
      lastAutoSeedRef.current = null;
      setReferenceMissions([]);
      setWorkspaceSummary(null);
      setMissions([createMissionDraft()]);
      setWorkspaceMessage("Cleared mission drafts because the shared missions workspace was cleared.");
    }

    window.addEventListener(MISSION_CREATOR_CLEARED_EVENT, handleWorkspaceCleared);
    return () => {
      window.removeEventListener(MISSION_CREATOR_CLEARED_EVENT, handleWorkspaceCleared);
    };
  }, []);

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

  useEffect(() => {
    if (hydrated && !workspaceSummary && !referenceMissions.length) {
      const storedFingerprint = window.localStorage.getItem(MISSION_WORKSPACE_SEED_KEY);
      if (storedFingerprint) {
        clearMissionCreatorWorkspaceStorage();
        return;
      }
    }

    if (!hydrated || !workspaceSummary || !referenceMissions.length) return;

    const fingerprint = `${workspaceSummary.importedAt}:${referenceMissions.length}`;
    const storedFingerprint = window.localStorage.getItem(MISSION_WORKSPACE_SEED_KEY);
    if (storedFingerprint === fingerprint) {
      lastAutoSeedRef.current = fingerprint;
      return;
    }
    if (lastAutoSeedRef.current === fingerprint) return;

    const seeded = referenceMissions.map((mission) => normalizeImportedMission(mission.raw));
    startTransition(() => {
      setMissions(seeded.length ? seeded : [createMissionDraft()]);
    });
    setWorkspaceMessage(`Auto-seeded ${seeded.length} mission draft(s) from the shared imported workspace.`);
    window.localStorage.setItem(MISSION_WORKSPACE_SEED_KEY, fingerprint);
    lastAutoSeedRef.current = fingerprint;
  }, [hydrated, referenceMissions, workspaceSummary]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Mission Creator</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Build mission drafts in the richer authoring model. When a shared missions zip is loaded in Settings, this page auto-seeds from it.
        </p>
        {workspaceMessage ? <div className="mt-3 text-sm text-accent">{workspaceMessage}</div> : null}
      </div>

      {!workspaceSummary ? (
        <div className="card space-y-3">
          <div className="text-sm text-white/70">
            No shared mission workspace is loaded yet. Import a missions zip in Settings first, and the creator will auto-seed from it.
          </div>
          <div>
            <Link href="/settings" className="btn">
              Go To Settings
            </Link>
          </div>
        </div>
      ) : null}

      <MissionWorkshop
        missions={missions}
        onChange={setMissions}
        knownMissionIds={knownMissionIds}
        consoleMissionCount={referenceMissions.length}
        referenceMissions={referenceMissions}
      />
    </div>
  );
}
