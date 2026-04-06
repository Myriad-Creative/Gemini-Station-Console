import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await loadAll();
  return NextResponse.json({ ok: true, via: "local-game-root" });
}
