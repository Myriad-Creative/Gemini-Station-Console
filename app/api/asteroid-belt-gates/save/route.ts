import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateGateFile(value: unknown) {
  if (!isRecord(value)) return "AsteroidBeltGates.json must be a JSON object.";
  if (!Array.isArray(value.gates)) return "AsteroidBeltGates.json must contain a gates array.";

  for (const [index, rawGate] of value.gates.entries()) {
    if (!isRecord(rawGate)) return `Gate ${index + 1} must be an object.`;
    const id = typeof rawGate.id === "string" ? rawGate.id.trim() : "";
    if (!id) return `Gate ${index + 1} is missing an id.`;
    const width = Number(rawGate.width_px ?? 0);
    if (!Number.isFinite(width) || width < 0) return `Gate "${id}" must have a valid non-negative width_px.`;
    if (rawGate.angle_degrees !== undefined) {
      const angle = Number(rawGate.angle_degrees);
      if (!Number.isFinite(angle)) return `Gate "${id}" must have a valid angle_degrees value.`;
    }
    if (rawGate.enabled !== undefined && typeof rawGate.enabled !== "boolean") return `Gate "${id}" enabled must be true or false.`;
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
    const asteroidBeltGates = body?.asteroidBeltGates;
    const validationError = validateGateFile(asteroidBeltGates);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const gatesPath = path.join(localGameSource.gameRootPath, "data", "database", "environment", "AsteroidBeltGates.json");
    await fsp.mkdir(path.dirname(gatesPath), { recursive: true });
    await fsp.writeFile(gatesPath, `${JSON.stringify(asteroidBeltGates, null, 2)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: gatesPath,
      savedCount: (asteroidBeltGates as { gates: unknown[] }).gates.length,
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
