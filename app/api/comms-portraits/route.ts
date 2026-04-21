import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function listImageFiles(root: string, current = root): Promise<string[]> {
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) return listImageFiles(root, absolutePath);
      if (!entry.isFile()) return [];
      if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [];
      return [path.relative(root, absolutePath).split(path.sep).join("/")];
    }),
  );

  return files.flat();
}

export async function GET() {
  const localSource = getLocalGameSourceState();
  if (!localSource.available.assets || !localSource.assetsRootPath) {
    return NextResponse.json(
      {
        data: [],
        message: "Comms portrait catalog is unavailable until the local game assets folder is connected.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const commsDirectory = path.join(localSource.assetsRootPath, "comms");
  if (!fs.existsSync(commsDirectory)) {
    return NextResponse.json(
      {
        data: [],
        message: "The local game source does not include an assets/comms directory.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const imagePaths = await listImageFiles(commsDirectory);
  const data = imagePaths
    .map((relativePath) => ({
      fileName: path.basename(relativePath),
      relativePath,
      resPath: `res://assets/comms/${relativePath}`,
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json(
    {
      data,
      message: data.length ? "" : "No comms portraits were found in assets/comms.",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
