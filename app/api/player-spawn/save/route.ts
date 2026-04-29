import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateVector(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 2) return `${label} must be a two-value array.`;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return `${label} must contain valid numbers.`;
  return "";
}

function validatePlayerSpawn(value: unknown) {
  if (!isRecord(value)) return "PlayerSpawn.json must be a JSON object.";
  const activeSpawn = typeof value.active_spawn === "string" ? value.active_spawn.trim() : "";
  if (!activeSpawn) return "PlayerSpawn.json must contain active_spawn.";
  if (!isRecord(value.spawns)) return "PlayerSpawn.json must contain a spawns dictionary.";
  if (!isRecord(value.spawns[activeSpawn])) return `Active spawn "${activeSpawn}" must exist in spawns.`;

  for (const [spawnId, rawSpawn] of Object.entries(value.spawns)) {
    if (!isRecord(rawSpawn)) return `Spawn "${spawnId}" must be an object.`;
    const sectorError = validateVector(rawSpawn.sector_id, `Spawn "${spawnId}" sector_id`);
    if (sectorError) return sectorError;
    const coordinates = rawSpawn.coordinates ?? rawSpawn.local_pos ?? rawSpawn.pos;
    const coordinateError = validateVector(coordinates, `Spawn "${spawnId}" coordinates`);
    if (coordinateError) return coordinateError;
  }

  return "";
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const playerSpawn = body?.playerSpawn;
    const validationError = validatePlayerSpawn(playerSpawn);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const playerSpawnPath = path.join(localGameSource.gameRootPath, "data", "database", "player", "PlayerSpawn.json");
    await fsp.mkdir(path.dirname(playerSpawnPath), { recursive: true });
    await fsp.writeFile(playerSpawnPath, `${JSON.stringify(playerSpawn, null, 2)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: playerSpawnPath,
      activeSpawn: (playerSpawn as { active_spawn: string }).active_spawn,
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
