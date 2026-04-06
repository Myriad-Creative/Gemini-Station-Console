import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { queryMissions, warmupLoadIfNeeded } from "@lib/datastore";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId } from "@lib/mission-lab/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await warmupLoadIfNeeded();
  const cfg = getConfig();
  const url = new URL(req.url);
  const bandParam = url.searchParams.get("band");
  let band: [number, number] | undefined = undefined;
  if (bandParam) {
    const [a,b] = bandParam.split("-").map(Number);
    band = [a,b];
  }
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = await getResolvedMissionLabWorkspace(sessionId);

  if (workspace.summary) {
    let rows = workspace.missions.map((mission) => ({
      id: mission.id,
      title: mission.title,
      giver_id: mission.giverId ?? "",
      faction: mission.faction ?? "",
      arcs: mission.arcs,
      tags: mission.tags,
      repeatable: mission.repeatable,
      level: mission.level ?? 0,
      objectives: mission.steps.flatMap((step) => step.objectives),
    }));

    if (band) {
      const [min, max] = band;
      rows = rows.filter((mission) => mission.level >= min && mission.level <= max);
    }

    return NextResponse.json({ rows, bands: cfg.level_bands });
  }

  const res = queryMissions({ band });
  return NextResponse.json({ ...res, bands: cfg.level_bands });
}
