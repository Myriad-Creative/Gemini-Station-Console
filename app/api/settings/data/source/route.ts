import { NextRequest, NextResponse } from "next/server";
import { readUploadedDataFileText } from "@lib/uploaded-data";

export const runtime = "nodejs";

type SupportedKind = "comms" | "merchantProfiles";

function isSupportedKind(value: string): value is SupportedKind {
  return value === "comms" || value === "merchantProfiles";
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") || "";
  if (!isSupportedKind(kind)) {
    return NextResponse.json({ ok: false, error: "Unsupported shared data source kind." }, { status: 400 });
  }

  const mappedKind = kind === "comms" ? "comms" : "merchantProfiles";
  const text = await readUploadedDataFileText(mappedKind);
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
