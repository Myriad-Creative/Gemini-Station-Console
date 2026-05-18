import { NextResponse } from "next/server";
import { loadShipProfiles } from "@lib/ship-lab/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadShipProfiles();
    return NextResponse.json(payload, { status: payload.ok ? 200 : 404 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sourceRoot: null,
        shipsDirectory: null,
        summary: { totalProfiles: 0, starterCount: 0, parseErrors: 0 },
        profiles: [],
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
