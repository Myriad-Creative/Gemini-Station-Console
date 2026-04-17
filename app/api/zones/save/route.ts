import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { ZonesManagerWorkspace } from "@lib/zones-manager/types";
import { stringifyZonesManagerWorkspace, validateZoneDrafts } from "@lib/zones-manager/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function saveAllZones(gameRoot: string, workspace: ZonesManagerWorkspace) {
  const errors = validateZoneDrafts(workspace.zones).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const zonesPath = path.join(gameRoot, "data", "database", "zones", "Zones.json");
  await fsp.mkdir(path.dirname(zonesPath), { recursive: true });
  await fsp.writeFile(zonesPath, `${stringifyZonesManagerWorkspace(workspace)}\n`, "utf-8");

  return NextResponse.json({
    ok: true,
    savedPath: zonesPath,
    savedCount: workspace.zones.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as ZonesManagerWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.zones)) {
      return NextResponse.json({ ok: false, error: "A zones workspace is required." }, { status: 400 });
    }

    return await saveAllZones(localGameSource.gameRootPath, workspace);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
