import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@lib/config";
import { queryMissions } from "@lib/datastore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const bandParam = url.searchParams.get("band");
  let band: [number, number] | undefined = undefined;
  if (bandParam) {
    const [a,b] = bandParam.split("-").map(Number);
    band = [a,b];
  }
  const res = queryMissions({ band });
  return NextResponse.json({ ...res, bands: cfg.level_bands });
}
