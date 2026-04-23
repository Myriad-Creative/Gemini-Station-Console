import { NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bandOf(level: number, bands: [number,number][]) {
  for (const [a,b] of bands) if (level>=a && level<=b) return `${a}-${b}`;
  return "unknown";
}

export async function GET() {
  await warmupLoadIfNeeded();
  const cfg = getConfig();
  const { mods } = getStore();
  const bands = cfg.level_bands;
  const required = cfg.coverage_threshold_per_slot;

  const by: Record<string, Record<string, Record<number, number>>> = {};
  const totals: Record<string, Record<string, number>> = {};
  for (const m of mods) {
    const band = bandOf(m.levelRequirement, bands);
    by[band] ||= {}; by[band][m.slot] ||= {}; by[band][m.slot][m.rarity] = (by[band][m.slot][m.rarity] ?? 0) + 1;
    totals[band] ||= {}; totals[band][m.slot] = (totals[band][m.slot] ?? 0) + 1;
  }

  const slots = Array.from(new Set(mods.map(m => m.slot))).sort();
  const rarities = [0,1,2,3,4];
  const rows: any[] = [];
  for (const [a,b] of bands) {
    const bandLabel = `${a}-${b}`;
    for (const slot of slots) {
      const row: any = { band: bandLabel, slot };
      let total = 0;
      for (const r of rarities) {
        const c = by[bandLabel]?.[slot]?.[r] ?? 0;
        row[`r${r}`] = c; total += c;
      }
      row.total = total;
      row.required = required;
      rows.push(row);
    }
  }
  return NextResponse.json({ rows, rarities, required, bands });
}
