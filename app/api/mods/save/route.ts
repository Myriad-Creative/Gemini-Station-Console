import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { exportModsJson, syncDerivedModFields, validateModDrafts, type ModDraft } from "@lib/authoring";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringifyModsJson(drafts: ModDraft[]) {
  return `${JSON.stringify(exportModsJson(drafts), null, 2)}\n`;
}

async function saveAllMods(gameRoot: string, rawDrafts: unknown[]) {
  const drafts = rawDrafts.map((entry) => syncDerivedModFields(entry as ModDraft));
  const errors = validateModDrafts(drafts).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const modsPath = path.join(gameRoot, "data", "database", "mods", "Mods.json");
  await fsp.mkdir(path.dirname(modsPath), { recursive: true });
  await fsp.writeFile(modsPath, stringifyModsJson(drafts), "utf-8");
  await loadAll();

  return NextResponse.json({
    ok: true,
    savedPath: modsPath,
    savedCount: drafts.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body?.drafts)) {
      return NextResponse.json({ ok: false, error: "A mod draft array is required." }, { status: 400 });
    }

    return await saveAllMods(localGameSource.gameRootPath, body.drafts);
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
