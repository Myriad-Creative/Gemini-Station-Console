import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ICON_FOLDERS = [
  { folder: "abilities", label: "Abilities" },
  { folder: "status_effects", label: "Status Effects" },
] as const;

async function collectImageFiles(assetsRoot: string, folder: (typeof ICON_FOLDERS)[number]) {
  const directory = path.join(assetsRoot, folder.folder);
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const icons: Array<{
    fileName: string;
    relativePath: string;
    resPath: string;
    folder: string;
    folderLabel: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const relativePath = `${folder.folder}/${entry.name}`;
    icons.push({
      fileName: entry.name,
      relativePath,
      resPath: `res://assets/${relativePath}`,
      folder: folder.folder,
      folderLabel: folder.label,
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

  const data = (await Promise.all(ICON_FOLDERS.map((folder) => collectImageFiles(localSource.assetsRootPath!, folder))))
    .flat()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json(
    {
      ok: true,
      data,
      message: data.length ? "" : "No ability icons were found in assets/abilities or assets/status_effects.",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
