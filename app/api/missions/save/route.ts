import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { loadAll } from "@lib/datastore";
import { exportMissionDraft, missionFilename, validateMissionDrafts, type MissionDraft } from "@lib/mission-authoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringifyMissionJson(mission: MissionDraft) {
  return `${JSON.stringify(exportMissionDraft(mission), null, 2)}\n`;
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.missionsRootPath || !localGameSource.available.missions) {
    return NextResponse.json({ ok: false, error: "No active local game mission folder is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mission = body?.mission as MissionDraft | undefined;
    const index = Number.isInteger(body?.index) ? Number(body.index) : 0;
    const knownMissionIds = Array.isArray(body?.knownMissionIds) ? body.knownMissionIds.map((entry: unknown) => String(entry)) : [];
    if (!mission || typeof mission !== "object") {
      return NextResponse.json({ ok: false, error: "A mission draft is required." }, { status: 400 });
    }

    const errors = validateMissionDrafts([mission], knownMissionIds).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.map((issue) => issue.message).join(" ") }, { status: 400 });
    }

    const filename = missionFilename(mission, index);
    const targetPath = path.join(localGameSource.missionsRootPath, filename);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, stringifyMissionJson(mission), "utf-8");
    await loadAll();

    return NextResponse.json({
      ok: true,
      savedPath: targetPath,
      filename,
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
