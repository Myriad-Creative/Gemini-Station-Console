import { NextResponse } from "next/server";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";

export async function GET() {
  await warmupLoadIfNeeded();
  const store = getStore();
  return NextResponse.json({ data: store.mobs });
}
