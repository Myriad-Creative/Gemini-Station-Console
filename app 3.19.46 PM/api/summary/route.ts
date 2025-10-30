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
      repoRoot: store.repoRoot,
      errors: store.errors,
      ...summary
    });
  } catch (e:any) {
    return NextResponse.json({
      lastLoaded: null,
      repoRoot: null,
      errors: [String(e?.message || e)],
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
