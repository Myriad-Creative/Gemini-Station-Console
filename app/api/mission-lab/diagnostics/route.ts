import { NextRequest, NextResponse } from "next/server";
import { getMissionLabWorkspace, resolveMissionLabSessionId } from "@lib/mission-lab/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = getMissionLabWorkspace(sessionId);
  return NextResponse.json({
    summary: workspace.summary,
    diagnostics: workspace.diagnostics,
  });
}
