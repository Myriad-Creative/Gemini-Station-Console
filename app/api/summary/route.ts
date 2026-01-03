import { NextResponse } from "next/server";
import { getSummary, getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";

export async function GET() {
  try {
    await warmupLoadIfNeeded();
    const store = getStore();
    const summary = getSummary();
    return NextResponse.json({
      lastLoaded: store.lastLoaded,
      manifestUrl: store.manifestUrl,
      dataUrls: store.dataUrls,
      errors: store.errors,
      ...summary
    });
  } catch (e:any) {
    return NextResponse.json({
      lastLoaded: null,
      manifestUrl: null,
      dataUrls: null,
      errors: [String(e?.message || e)],
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
