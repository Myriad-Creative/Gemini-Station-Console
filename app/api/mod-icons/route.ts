import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SLOT_TOKEN_TO_LABEL: Record<string, string> = {
  armor: "Armor",
  armors: "Armor",
  engine: "Engine",
  engines: "Engine",
  sensor: "Sensor",
  sensors: "Sensor",
  shield: "Shield",
  shields: "Shield",
  utility: "Utility",
  utilities: "Utility",
  weapon: "Weapon",
  weapons: "Weapon",
};

function inferSlotFromFileName(fileName: string) {
  const match = fileName.toLowerCase().match(/^mod_([^_]+)/);
  if (!match) {
    return {
      slot: null,
      slotKey: null,
    };
  }

  const slotKey = match[1] ?? "";
  const slot = SLOT_TOKEN_TO_LABEL[slotKey] ?? null;
  return {
    slot,
    slotKey: slot ? slot.toLowerCase() : null,
  };
}

export async function GET() {
  const localSource = getLocalGameSourceState();
  if (!localSource.available.assets || !localSource.assetsRootPath) {
    return NextResponse.json(
      {
        data: [],
        message: "Mod icon catalog is unavailable until the local game assets folder is connected.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const modsAssetDirectory = path.join(localSource.assetsRootPath, "mods");
  if (!fs.existsSync(modsAssetDirectory)) {
    return NextResponse.json(
      {
        data: [],
        message: "The local game source does not include an assets/mods directory.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const entries = await fs.promises.readdir(modsAssetDirectory, { withFileTypes: true });
  const data = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .map((fileName) => ({
      fileName,
      resPath: `res://assets/mods/${fileName}`,
      ...inferSlotFromFileName(fileName),
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: "base" }));

  return NextResponse.json(
    {
      data,
      message: data.length ? "" : "No mod icons were found in assets/mods.",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
