import { NextRequest, NextResponse } from "next/server";
import { applyMissionFilters } from "@lib/mission-lab/filters";
import { readMissionFilterState } from "@lib/mission-lab/filter-query";
import { collectFocusedSubgraph } from "@lib/mission-lab/graph";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId, updateMissionLabFilters } from "@lib/mission-lab/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = await getResolvedMissionLabWorkspace(sessionId);
  const searchParams = new URL(req.url).searchParams;
  const nextFilters = readMissionFilterState(searchParams, workspace.filters);
  const filteredMissions = applyMissionFilters(workspace.missions, nextFilters);
  const filteredKeys = new Set(filteredMissions.map((mission) => mission.key));
  const nodes = workspace.graphNodes.filter((node) => filteredKeys.has(node.id));
  const edges = workspace.graphEdges.filter((edge) => filteredKeys.has(edge.source) && filteredKeys.has(edge.target));

  const selectedMissionKey = filteredMissions.some((mission) => mission.key === nextFilters.selectedMissionKey)
    ? nextFilters.selectedMissionKey
    : filteredMissions[0]?.key ?? null;
  const focusedMissionKey = filteredMissions.some((mission) => mission.key === nextFilters.focusedMissionKey)
    ? nextFilters.focusedMissionKey
    : selectedMissionKey;

  const updatedWorkspace = updateMissionLabFilters(sessionId, {
    ...nextFilters,
    selectedMissionKey,
    focusedMissionKey,
  });

  return NextResponse.json({
    summary: updatedWorkspace.summary,
    filters: updatedWorkspace.filters,
    nodes,
    edges,
    focus: collectFocusedSubgraph(nodes, edges, focusedMissionKey),
  });
}
