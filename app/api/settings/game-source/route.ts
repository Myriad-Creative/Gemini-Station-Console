import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { clearLocalGameSource, getLocalGameSourceState, setLocalGameSourceRoot } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, localGameSource: getLocalGameSourceState() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const gameRootPath = typeof body?.gameRootPath === "string" ? body.gameRootPath : "";
    const localGameSource = await setLocalGameSourceRoot(gameRootPath);
    await loadAll();
    return NextResponse.json({ ok: true, localGameSource });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e),
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    const localGameSource = await clearLocalGameSource();
    await loadAll();
    return NextResponse.json({ ok: true, localGameSource });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e),
      },
      { status: 400 },
    );
  }
}
