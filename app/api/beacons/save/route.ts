import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { BeaconWorkspace } from "@lib/beacon-manager/types";
import { stringifyBeaconWorkspace, validateBeaconDrafts } from "@lib/beacon-manager/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as BeaconWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.beacons)) {
      return NextResponse.json({ ok: false, error: "A beacon workspace is required." }, { status: 400 });
    }

    const errors = validateBeaconDrafts(workspace).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.map((issue) => issue.message).join(" ") }, { status: 400 });
    }

    const beaconsPath = path.join(localGameSource.gameRootPath, "data", "database", "beacons", "beacons.json");
    await fsp.mkdir(path.dirname(beaconsPath), { recursive: true });
    await fsp.writeFile(beaconsPath, `${stringifyBeaconWorkspace(workspace)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedCount: workspace.beacons.length,
    });
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
