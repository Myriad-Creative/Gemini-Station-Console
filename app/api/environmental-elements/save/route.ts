import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed);
}

function validateVecArray(value: unknown, minCount: number, label: string) {
  if (!Array.isArray(value) || value.length < minCount) return `${label} must contain at least ${minCount} point${minCount === 1 ? "" : "s"}.`;
  for (const [index, entry] of value.entries()) {
    if (!Array.isArray(entry) || entry.length < 2 || !isFiniteNumber(entry[0]) || !isFiniteNumber(entry[1])) {
      return `${label} point ${index + 1} must be a valid [x, y] pair.`;
    }
  }
  return "";
}

function validateEnvironmentalElements(value: unknown) {
  if (!isRecord(value)) return "EnvironmentalElements.json must be a JSON object.";
  if (!Array.isArray(value.elements)) return "EnvironmentalElements.json must contain an elements array.";

  const seenIds = new Set<string>();

  for (const [index, rawElement] of value.elements.entries()) {
    if (!isRecord(rawElement)) return `Element ${index + 1} must be an object.`;
    const id = typeof rawElement.id === "string" ? rawElement.id.trim() : "";
    if (!id) return `Element ${index + 1} is missing an id.`;
    if (seenIds.has(id)) return `Element ID "${id}" is duplicated.`;
    seenIds.add(id);

    const type = typeof rawElement.type === "string" ? rawElement.type.trim() : "";
    if (!type) return `Element "${id}" is missing a type.`;
    if (!["hazard_barrier", "environment_region"].includes(type)) {
      return `Element "${id}" has unsupported type "${type}".`;
    }

    if (!Array.isArray(rawElement.sector_id) || rawElement.sector_id.length < 2 || !isFiniteNumber(rawElement.sector_id[0]) || !isFiniteNumber(rawElement.sector_id[1])) {
      return `Element "${id}" must include a valid sector_id [x, y].`;
    }

    if (rawElement.tags !== undefined && !Array.isArray(rawElement.tags)) {
      return `Element "${id}" tags must be an array when present.`;
    }

    const data = isRecord(rawElement.data) ? rawElement.data : null;
    if (!data) return `Element "${id}" must contain a data object.`;
    const profileId = typeof data.profile_id === "string" ? data.profile_id.trim() : "";
    if (!profileId) return `Element "${id}" is missing data.profile_id.`;

    if (type === "hazard_barrier") {
      if (!isFiniteNumber(data.band_width) || Number(data.band_width) <= 0) {
        return `Hazard barrier "${id}" must have a valid positive band_width.`;
      }
      const pointsError = validateVecArray(data.points, 2, `Hazard barrier "${id}" points`);
      if (pointsError) return pointsError;
    }

    if (type === "environment_region") {
      const shape = typeof data.shape === "string" ? data.shape.trim().toLowerCase() : "";
      if (!["polygon", "ellipse"].includes(shape)) {
        return `Environment region "${id}" must use shape "polygon" or "ellipse".`;
      }
      if (shape === "polygon") {
        const pointsError = validateVecArray(data.points, 3, `Environment region "${id}" polygon points`);
        if (pointsError) return pointsError;
      }
      if (shape === "ellipse") {
        if (!Array.isArray(data.center) || data.center.length < 2 || !isFiniteNumber(data.center[0]) || !isFiniteNumber(data.center[1])) {
          return `Environment region "${id}" must have a valid ellipse center [x, y].`;
        }
        if (!isFiniteNumber(data.width) || Number(data.width) <= 0 || !isFiniteNumber(data.height) || Number(data.height) <= 0) {
          return `Environment region "${id}" ellipse width and height must be valid positive numbers.`;
        }
      }
    }
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
    const environmentalElements = body?.environmentalElements;
    const validationError = validateEnvironmentalElements(environmentalElements);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const targetPath = path.join(localGameSource.gameRootPath, "data", "database", "environment", "EnvironmentalElements.json");
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, `${JSON.stringify(environmentalElements, null, 2)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: targetPath,
      savedCount: Array.isArray((environmentalElements as { elements?: unknown[] }).elements)
        ? (environmentalElements as { elements: unknown[] }).elements.length
        : 0,
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
