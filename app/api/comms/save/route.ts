import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { CommsLabWorkspace } from "@lib/comms-manager/types";
import { stringifyCommsWorkspace, validateCommsContacts } from "@lib/comms-manager/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function saveAllComms(gameRoot: string, workspace: CommsLabWorkspace) {
  const errors = validateCommsContacts(workspace.contacts).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const commsPath = path.join(gameRoot, "data", "database", "comms", "Comms.json");
  await fsp.mkdir(path.dirname(commsPath), { recursive: true });
  await fsp.writeFile(commsPath, `${stringifyCommsWorkspace(workspace)}\n`, "utf-8");
  await loadAll();

  return NextResponse.json({
    ok: true,
    savedPath: commsPath,
    savedCount: workspace.contacts.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as CommsLabWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.contacts)) {
      return NextResponse.json({ ok: false, error: "A comms workspace is required." }, { status: 400 });
    }

    return await saveAllComms(localGameSource.gameRootPath, workspace);
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
