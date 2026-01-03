import { NextResponse } from "next/server";
import { getSummary, getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";

export async function GET() {
  try {
    await warmupLoadIfNeeded();
    const store = getStore();
    const summary = getSummary();
    const counts = {
      mods: store.mods.length,
      items: store.items.length,
      missions: store.missions.length,
      mobs: store.mobs.length,
      abilities: store.abilities.length
    };
    return NextResponse.json({
      lastLoaded: store.lastLoaded,
      manifestUrl: store.manifestUrl,
      dataUrls: store.dataUrls,
      errors: store.errors,
      counts,
      ...summary
    });
  } catch (e:any) {
    return NextResponse.json({
      lastLoaded: null,
      manifestUrl: null,
      dataUrls: null,
      errors: [String(e?.message || e)],
      counts: { mods: 0, items: 0, missions: 0, mobs: 0, abilities: 0 },
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
