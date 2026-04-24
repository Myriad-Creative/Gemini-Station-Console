import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { ItemManagerWorkspace } from "@lib/item-manager/types";
import { stringifyItemWorkspace, validateItemDrafts } from "@lib/item-manager/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function saveAllItems(gameRoot: string, workspace: ItemManagerWorkspace) {
  const errors = validateItemDrafts(workspace.items).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const itemsPath = path.join(gameRoot, "data", "database", "items", "items.json");
  await fsp.mkdir(path.dirname(itemsPath), { recursive: true });
  await fsp.writeFile(itemsPath, `${stringifyItemWorkspace(workspace)}\n`, "utf-8");
  await loadAll();

  return NextResponse.json({
    ok: true,
    savedPath: itemsPath,
    savedCount: workspace.items.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as ItemManagerWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.items)) {
      return NextResponse.json({ ok: false, error: "An item workspace is required." }, { status: 400 });
    }

    return await saveAllItems(localGameSource.gameRootPath, workspace);
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
