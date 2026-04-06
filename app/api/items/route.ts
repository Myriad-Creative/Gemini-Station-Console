import { NextRequest, NextResponse } from "next/server";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await warmupLoadIfNeeded();
  const store = getStore();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.toLowerCase();
  const rarity = url.searchParams.getAll("rarity").map(Number);
  const min = url.searchParams.get("level_min") ? Number(url.searchParams.get("level_min")) : undefined;
  const max = url.searchParams.get("level_max") ? Number(url.searchParams.get("level_max")) : undefined;

  let rows = store.items.slice();
  if (q) rows = rows.filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
  if (rarity.length) rows = rows.filter(i => rarity.includes(i.rarity));
  if (min != null) rows = rows.filter(i => i.levelRequirement >= min);
  if (max != null) rows = rows.filter(i => i.levelRequirement <= max);

  const rarities = Array.from(new Set(store.items.map(i => i.rarity))).sort((a,b)=>a-b);
  return NextResponse.json({ data: rows, rarities });
}
