import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { MerchantLabWorkspace } from "@lib/merchant-lab/types";
import { stringifyMerchantWorkspace, validateMerchantProfiles } from "@lib/merchant-lab/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function saveAllMerchantProfiles(gameRoot: string, workspace: MerchantLabWorkspace) {
  const errors = validateMerchantProfiles(workspace.profiles).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const merchantProfilesPath = path.join(gameRoot, "data", "database", "vendor", "merchant_profiles.json");
  await fsp.mkdir(path.dirname(merchantProfilesPath), { recursive: true });
  await fsp.writeFile(merchantProfilesPath, `${stringifyMerchantWorkspace(workspace)}\n`, "utf-8");
  await loadAll();

  return NextResponse.json({
    ok: true,
    savedPath: merchantProfilesPath,
    savedCount: workspace.profiles.length,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace = body?.workspace as MerchantLabWorkspace | undefined;
    if (!workspace || !Array.isArray(workspace.profiles)) {
      return NextResponse.json({ ok: false, error: "A merchant profile workspace is required." }, { status: 400 });
    }

    return await saveAllMerchantProfiles(localGameSource.gameRootPath, workspace);
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
