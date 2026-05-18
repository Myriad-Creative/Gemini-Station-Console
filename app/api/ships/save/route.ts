import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { fileNameForShipId, validateShipProfile } from "@lib/ship-lab/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPS_DIRECTORY = path.join("data", "ships");

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSafeJsonFileName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().endsWith(".json")) return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return false;
  return path.basename(trimmed) === trimmed;
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const profile = isRecord(body?.profile) ? body.profile : null;
    if (!profile) {
      return NextResponse.json({ ok: false, error: "A ship profile object is required." }, { status: 400 });
    }

    const validationError = validateShipProfile(profile);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const requestedFileName = body?.fileName;
    const fileName = isSafeJsonFileName(requestedFileName) ? requestedFileName : fileNameForShipId(String(profile.id ?? ""));
    if (!isSafeJsonFileName(fileName)) {
      return NextResponse.json({ ok: false, error: "A safe ship JSON file name is required." }, { status: 400 });
    }

    const shipsDirectory = path.join(localGameSource.gameRootPath, SHIPS_DIRECTORY);
    const targetPath = path.join(shipsDirectory, fileName);
    await fsp.mkdir(shipsDirectory, { recursive: true });
    await fsp.writeFile(targetPath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: targetPath,
      fileName,
    });
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
