import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { buildMissionFilterOptions } from "@lib/mission-lab/filters";
import { getMissionLabWorkspace, resolveMissionLabSessionId } from "@lib/mission-lab/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = getMissionLabWorkspace(sessionId);
  const config = getConfig();

  return NextResponse.json({
    summary: workspace.summary,
    diagnostics: workspace.diagnostics,
    missions: workspace.missions,
    options: buildMissionFilterOptions(workspace.missions),
    levelBands: config.level_bands,
    hasWorkspace: Boolean(workspace.summary),
  });
}
