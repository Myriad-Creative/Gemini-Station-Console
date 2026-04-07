import { NextRequest, NextResponse } from "next/server";
import { type UploadedDataFileKind } from "@lib/uploaded-data";
import { readPreferredDataFileText } from "@lib/shared-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_KINDS = new Set<UploadedDataFileKind>([
  "items",
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
    return NextResponse.json({ ok: false, error: "Unsupported local game data kind." }, { status: 400 });
  }

  const { text, sourceLabel } = await readPreferredDataFileText(kind);
  if (!text) {
    return NextResponse.json({ ok: false, error: "Local game source is not available for that file." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    kind,
    sourceLabel,
    text,
  });
}
