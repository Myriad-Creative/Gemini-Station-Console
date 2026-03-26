import type { NextRequest } from "next/server";
import type { MissionFilterState, MissionLabWorkspace } from "@lib/mission-lab/types";
import { createDefaultMissionFilterState } from "@lib/mission-lab/filters";

const G = globalThis as typeof globalThis & {
  __MISSION_LAB_SESSIONS__?: Map<string, MissionLabWorkspace>;
};

if (!G.__MISSION_LAB_SESSIONS__) {
  G.__MISSION_LAB_SESSIONS__ = new Map<string, MissionLabWorkspace>();
}

const SESSION_STORE = G.__MISSION_LAB_SESSIONS__;

export function resolveMissionLabSessionId(req: NextRequest) {
  return req.headers.get("x-mission-lab-session") || new URL(req.url).searchParams.get("session") || "default";
}

export function createEmptyMissionLabWorkspace(sessionId: string): MissionLabWorkspace {
  return {
    sessionId,
    summary: null,
    missions: [],
    graphNodes: [],
    graphEdges: [],
    diagnostics: {
      files: [],
      successfulFiles: [],
      warningFiles: [],
      failedFiles: [],
      strictJsonInvalidFiles: [],
      duplicateMissionIds: [],
      missingPrerequisiteTargets: [],
      placeholderValues: [],
      cycles: [],
      warningsCount: 0,
      errorsCount: 0,
      ignoredEntries: [],
    },
    filters: createDefaultMissionFilterState(),
  };
}

export function getMissionLabWorkspace(sessionId: string) {
  if (!SESSION_STORE.has(sessionId)) {
    SESSION_STORE.set(sessionId, createEmptyMissionLabWorkspace(sessionId));
  }
  return SESSION_STORE.get(sessionId)!;
}

export function setMissionLabWorkspace(sessionId: string, workspace: MissionLabWorkspace) {
  SESSION_STORE.set(sessionId, workspace);
  return workspace;
}

export function clearMissionLabWorkspace(sessionId: string) {
  const workspace = createEmptyMissionLabWorkspace(sessionId);
  SESSION_STORE.set(sessionId, workspace);
  return workspace;
}

export function updateMissionLabFilters(sessionId: string, nextFilters: MissionFilterState) {
  const workspace = getMissionLabWorkspace(sessionId);
  const updated = {
    ...workspace,
    filters: nextFilters,
  };
  SESSION_STORE.set(sessionId, updated);
  return updated;
}
