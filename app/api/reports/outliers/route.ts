import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { computeOutliers } from "@parser/stats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await warmupLoadIfNeeded();
  const cfg = getConfig();
  const url = new URL(req.url);
  const z = url.searchParams.get("z");
  const thr = z ? Number(z) : cfg.zscore_threshold;
  const outliers = computeOutliers(getStore().mods, thr);
  return NextResponse.json({ outliers, z: thr });
}
