import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { getStore, queryMods, warmupLoadIfNeeded } from "@lib/datastore";
import { computeCompositeScore } from "@parser/stats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await warmupLoadIfNeeded();
  const url = new URL(req.url);
  const slot = url.searchParams.get("slot") || undefined;
  const level_min = url.searchParams.get("level_min") ? Number(url.searchParams.get("level_min")) : undefined;
  const level_max = url.searchParams.get("level_max") ? Number(url.searchParams.get("level_max")) : undefined;
  const rarity = url.searchParams.getAll("rarity").map(Number);
  const classRestriction = url.searchParams.get("class") || undefined;
  const stat = url.searchParams.get("stat") || undefined;
  const ability = url.searchParams.get("ability") || undefined;
  const search = url.searchParams.get("q") || undefined;

  const rows = queryMods({ slot, level_min, level_max, rarity: rarity.length? rarity: undefined, classRestriction, stat, ability, search });

  const cfg = getConfig();
  const data = rows.map(m => ({
    ...m,
    composite: computeCompositeScore(m, cfg.weights.global, cfg.weights.perSlot, cfg.weights.abilityWeight)
  }));

  const store = getStore();
  const slots = Array.from(new Set(store.mods.map(m => m.slot))).sort();
  const rarities = Array.from(new Set(store.mods.map(m => m.rarity))).sort((a,b)=>a-b);
  const classes = Array.from(new Set(store.mods.flatMap(m => m.classRestriction || []))).sort();
  const stats = Array.from(new Set(store.mods.flatMap(m => Object.keys(m.stats)))).sort();

  return NextResponse.json({ data, slots, rarities, classes, stats });
}
