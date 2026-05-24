import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { loadShipProfiles } from "@lib/ship-lab/load";
import { fileNameForShipId, validateShipProfile } from "@lib/ship-lab/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPS_DIRECTORY = path.join("data", "ships");

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeSafeJsonFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().endsWith(".json")) return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return null;
  return path.basename(trimmed) === trimmed ? trimmed : null;
}

function resolveShipPath(shipsDirectory: string, fileName: string) {
  const resolvedDirectory = path.resolve(shipsDirectory);
  const resolvedPath = path.resolve(shipsDirectory, fileName);
  if (resolvedPath !== resolvedDirectory && !resolvedPath.startsWith(`${resolvedDirectory}${path.sep}`)) {
    throw new Error("Ship file path must stay inside data/ships.");
  }
  return resolvedPath;
}

async function pathExists(filePath: string) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "delete" ? "delete" : "save";
    const shipsDirectory = path.join(localGameSource.gameRootPath, SHIPS_DIRECTORY);

    if (action === "delete") {
      const fileName = normalizeSafeJsonFileName(body?.fileName);
      if (!fileName) {
        return NextResponse.json({ ok: false, error: "A safe ship JSON file name is required." }, { status: 400 });
      }

      const targetPath = resolveShipPath(shipsDirectory, fileName);
      if (!(await pathExists(targetPath))) {
        return NextResponse.json({ ok: false, error: `${fileName} does not exist in data/ships.` }, { status: 404 });
      }

      await fsp.rm(targetPath, { force: true });
      return NextResponse.json({
        ok: true,
        deletedPath: targetPath,
        fileName,
      });
    }

    const profile = isRecord(body?.profile) ? body.profile : null;
    if (!profile) {
      return NextResponse.json({ ok: false, error: "A ship profile object is required." }, { status: 400 });
    }

    const validationError = validateShipProfile(profile);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const requestedFileName = normalizeSafeJsonFileName(body?.fileName);
    const fileName = requestedFileName ?? fileNameForShipId(String(profile.id ?? ""));
    const safeFileName = normalizeSafeJsonFileName(fileName);
    if (!safeFileName) {
      return NextResponse.json({ ok: false, error: "A safe ship JSON file name is required." }, { status: 400 });
    }

    const sourceFileName = normalizeSafeJsonFileName(body?.sourceFileName);
    const profileIndex = Number.isInteger(body?.profileIndex) ? Number(body.profileIndex) : null;
    const targetPath = resolveShipPath(shipsDirectory, safeFileName);
    const sourcePath = sourceFileName ? resolveShipPath(shipsDirectory, sourceFileName) : null;
    const sourceMatchesTarget = sourcePath ? sourcePath === targetPath : false;
    const targetAlreadyExists = await pathExists(targetPath);

    if (targetAlreadyExists && !sourceMatchesTarget) {
      return NextResponse.json({ ok: false, error: `${safeFileName} already exists in data/ships. Select that file before updating it.` }, { status: 409 });
    }

    const loadedProfiles = await loadShipProfiles();
    const nextId = String(profile.id ?? "").trim();
    const idConflicts = loadedProfiles.profiles.filter((existing) => {
      if (!existing.data || existing.id.trim() !== nextId) return false;
      if (sourceFileName && existing.fileName === sourceFileName && existing.profileIndex === profileIndex) return false;
      return true;
    });
    if (idConflicts.length) {
      return NextResponse.json({ ok: false, error: `Another player ship already uses id "${nextId}".` }, { status: 409 });
    }

    await fsp.mkdir(shipsDirectory, { recursive: true });
    await fsp.writeFile(targetPath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");
    if (sourcePath && sourcePath !== targetPath) {
      await fsp.rm(sourcePath, { force: true });
    }

    return NextResponse.json({
      ok: true,
      savedPath: targetPath,
      fileName: safeFileName,
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
