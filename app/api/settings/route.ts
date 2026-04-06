import { NextResponse } from "next/server";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { getUploadedAssetsState } from "@lib/uploaded-assets";
import { getUploadedDataState } from "@lib/uploaded-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildResponse() {
  const store = getStore();
  return {
    lastLoaded: store.lastLoaded,
    errors: store.errors,
    localGameSource: getLocalGameSourceState(),
    uploadedAssets: getUploadedAssetsState(),
    uploadedData: getUploadedDataState(),
  };
}

export async function GET() {
  await warmupLoadIfNeeded();
  return NextResponse.json(buildResponse());
}
