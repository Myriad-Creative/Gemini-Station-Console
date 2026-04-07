import { NextRequest, NextResponse } from "next/server";
import { getStore, loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await loadAll();
  const store = getStore();
  return NextResponse.json({
    ok: true,
    via: "local-game-root",
    lastLoaded: store.lastLoaded ?? null,
    errors: store.errors,
    localGameSource: getLocalGameSourceState(),
  });
}
