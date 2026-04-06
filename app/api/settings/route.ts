import { NextResponse } from "next/server";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildResponse() {
  const store = getStore();
  return {
    lastLoaded: store.lastLoaded,
    errors: store.errors,
    localGameSource: getLocalGameSourceState(),
  };
}

export async function GET() {
  await warmupLoadIfNeeded();
  return NextResponse.json(buildResponse());
}
