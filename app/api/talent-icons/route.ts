import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { TalentIconOption } from "@lib/talent-manager/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_ICON_COUNT = 1200;

async function collectImageFiles(root: string, dir: string, out: TalentIconOption[]) {
  if (out.length >= MAX_ICON_COUNT) return;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (out.length >= MAX_ICON_COUNT) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectImageFiles(root, fullPath, out);
      continue;
    }
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
    const [category = "assets"] = relativePath.split("/");
    out.push({
      fileName: entry.name,
      relativePath,
      resPath: `res://assets/${relativePath}`,
      category,
    });
  }
}

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.assetsRootPath || !localGameSource.available.assets) {
    return NextResponse.json(
      {
        ok: false,
        data: [],
        error: "No active local game assets folder is configured.",
      },
      {
        status: 404,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const icons: TalentIconOption[] = [];
  await collectImageFiles(localGameSource.assetsRootPath, localGameSource.assetsRootPath, icons);
  icons.sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json(
    {
      ok: true,
      data: icons,
      capped: icons.length >= MAX_ICON_COUNT,
      message: icons.length >= MAX_ICON_COUNT ? `Showing the first ${MAX_ICON_COUNT} icons found under assets.` : "",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
