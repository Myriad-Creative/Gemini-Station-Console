import { NextRequest, NextResponse } from "next/server";
import { applyMissionFilters, buildMissionFilterOptions } from "@lib/mission-lab/filters";
import { readMissionFilterState } from "@lib/mission-lab/filter-query";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId, updateMissionLabFilters } from "@lib/mission-lab/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = await getResolvedMissionLabWorkspace(sessionId);
  const searchParams = new URL(req.url).searchParams;
  const nextFilters = readMissionFilterState(searchParams, workspace.filters);
  const rows = applyMissionFilters(workspace.missions, nextFilters);

  const selectedMissionKey = rows.some((mission) => mission.key === nextFilters.selectedMissionKey)
    ? nextFilters.selectedMissionKey
    : rows[0]?.key ?? null;
  const focusedMissionKey = rows.some((mission) => mission.key === nextFilters.focusedMissionKey)
    ? nextFilters.focusedMissionKey
    : selectedMissionKey;

  const updatedWorkspace = updateMissionLabFilters(sessionId, {
    ...nextFilters,
    selectedMissionKey,
    focusedMissionKey,
  });
  const selectedMission = rows.find((mission) => mission.key === selectedMissionKey) ?? null;

  return NextResponse.json({
    summary: updatedWorkspace.summary,
    filters: updatedWorkspace.filters,
    options: buildMissionFilterOptions(updatedWorkspace.missions),
    rows,
    selectedMission,
    totalFiltered: rows.length,
    totalAll: updatedWorkspace.missions.length,
  });
}
