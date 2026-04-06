import { NextRequest, NextResponse } from "next/server";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId } from "@lib/mission-lab/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = await getResolvedMissionLabWorkspace(sessionId);
  return NextResponse.json({
    summary: workspace.summary,
    diagnostics: workspace.diagnostics,
  });
}
