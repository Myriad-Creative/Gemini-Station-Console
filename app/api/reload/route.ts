import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await loadAll();
  return NextResponse.json({ ok: true, via: "manifest" });
}
