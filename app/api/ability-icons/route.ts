import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ICON_FOLDER = "icons";

async function collectImageFiles(assetsRoot: string, directory: string) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const icons: Array<{
    fileName: string;
    relativePath: string;
    resPath: string;
    folder: string;
    folderLabel: string;
  }> = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      icons.push(...(await collectImageFiles(assetsRoot, absolutePath)));
      continue;
    }
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const relativePath = path.relative(assetsRoot, absolutePath).split(path.sep).join("/");
    icons.push({
      fileName: entry.name,
      relativePath,
      resPath: `res://assets/${relativePath}`,
      folder: ICON_FOLDER,
      folderLabel: "Icons",
    });
  }

  return icons;
}

export async function GET() {
  const localSource = getLocalGameSourceState();
  if (!localSource.available.assets || !localSource.assetsRootPath) {
    return NextResponse.json(
      {
        ok: false,
        data: [],
        message: "Ability icon catalog is unavailable until the local game assets folder is connected.",
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const iconsRoot = path.join(localSource.assetsRootPath, ICON_FOLDER);
  const data = (await collectImageFiles(localSource.assetsRootPath, iconsRoot))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json(
    {
      ok: true,
      data,
      message: data.length ? "" : "No ability or status effect icons were found in assets/icons.",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
