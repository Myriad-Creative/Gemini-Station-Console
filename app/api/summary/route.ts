import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { getSummary, getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { getMissionLabWorkspace, resolveMissionLabSessionId } from "@lib/mission-lab/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await warmupLoadIfNeeded();
    const store = getStore();
    const summary = getSummary();
    const sessionId = resolveMissionLabSessionId(req);
    const missionWorkspace = getMissionLabWorkspace(sessionId);
    const cfg = getConfig();

    const missionRows = missionWorkspace.summary ? missionWorkspace.missions : [];
    const missionsByBand = missionWorkspace.summary
      ? cfg.level_bands.map(([min, max]) => ({
          band: `${min}-${max}`,
          count: missionRows.filter((mission) => mission.level != null && mission.level >= min && mission.level <= max).length,
        }))
      : summary.missionsByBand;

    const counts = {
      mods: store.mods.length,
      items: store.items.length,
      missions: missionRows.length,
      mobs: store.mobs.length,
      abilities: store.abilities.length
    };
    return NextResponse.json({
      lastLoaded: store.lastLoaded,
      errors: store.errors,
      counts,
      ...summary,
      missionsByBand,
    });
  } catch (e:any) {
    return NextResponse.json({
      lastLoaded: null,
      errors: [String(e?.message || e)],
      counts: { mods: 0, items: 0, missions: 0, mobs: 0, abilities: 0 },
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
