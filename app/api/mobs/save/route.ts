import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { MobLabWorkspace } from "@lib/mob-lab/types";
import { stringifyMobWorkspace, validateMobDrafts } from "@lib/mob-lab/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function saveAllMobs(gameRoot: string, workspace: MobLabWorkspace) {
  const errors = validateMobDrafts(workspace.mobs).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const mobsPath = path.join(gameRoot, "data", "database", "mobs", "mobs.json");
  await fsp.mkdir(path.dirname(mobsPath), { recursive: true });
  await fsp.writeFile(mobsPath, `${stringifyMobWorkspace(workspace)}\n`, "utf-8");
  await loadAll();

  return NextResponse.json({
    ok: true,
    savedPath: mobsPath,
    savedCount: workspace.mobs.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as MobLabWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.mobs)) {
      return NextResponse.json({ ok: false, error: "A mob workspace is required." }, { status: 400 });
    }

    return await saveAllMobs(localGameSource.gameRootPath, workspace);
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
