import { NextResponse } from "next/server";
import { loadAiProfiles } from "@lib/ai-manager/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await loadAiProfiles();
    return NextResponse.json(payload, { status: payload.ok ? 200 : 404 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sourceRoot: null,
        aiDirectory: null,
        summary: {
          totalProfiles: 0,
          parseErrors: 0,
          profilesWithScripts: 0,
          profilesUsedByMobs: 0,
          referencedByMobsOnly: [],
        },
        profiles: [],
        abilityOptions: [],
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
