import { NextRequest, NextResponse } from "next/server";
import { readUploadedDataFileText, type UploadedDataFileKind } from "@lib/uploaded-data";

export const runtime = "nodejs";

const SUPPORTED_KINDS = new Set<UploadedDataFileKind>([
  "mobs",
  "comms",
  "merchantProfiles",
  "poi",
  "regions",
  "tradeRoutes",
  "npcTraffic",
  "tutorialEntries",
  "tutorialTriggers",
  "shipStatDescriptions",
  "zones",
  "stages",
  "hazardBarrierProfiles",
]);

function isSupportedKind(value: string): value is UploadedDataFileKind {
  return SUPPORTED_KINDS.has(value as UploadedDataFileKind);
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") || "";
  if (!isSupportedKind(kind)) {
    return NextResponse.json({ ok: false, error: "Unsupported shared data source kind." }, { status: 400 });
  }

  const text = await readUploadedDataFileText(kind);
  if (!text) {
    return NextResponse.json({ ok: false, error: "Shared uploaded data source not available for that file." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    kind,
    sourceLabel: "Shared uploaded data",
    text,
  });
}
