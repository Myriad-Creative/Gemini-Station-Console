import { NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const database = loadAbilityManagerDatabase(localGameSource.gameRootPath);
    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game root",
      database,
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

