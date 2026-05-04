import { NextResponse } from "next/server";
import { readGameFactions } from "@lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const factions = await readGameFactions();
    if (!factions.length) {
      return NextResponse.json({ ok: false, error: "No active local game faction catalog is configured." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game source",
      data: factions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
