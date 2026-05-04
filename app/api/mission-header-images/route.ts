import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.assetsRootPath || !localGameSource.available.assets) {
    return NextResponse.json({ ok: false, error: "No active local game assets folder is configured." }, { status: 404 });
  }

  try {
    const missionAssetsRoot = path.join(localGameSource.assetsRootPath, "missions");
    const entries = await fsp.readdir(missionAssetsRoot, { withFileTypes: true });
    const images = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.startsWith("header_"))
      .filter((entry) => IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const resPath = `res://assets/missions/${entry.name}`;
        return {
          fileName: entry.name,
          resPath,
          label: entry.name.replace(/\.[^.]+$/, "").replace(/^header_/, "").replace(/_/g, " "),
        };
      })
      .sort((left, right) => left.fileName.localeCompare(right.fileName));

    return NextResponse.json({ ok: true, data: images });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
