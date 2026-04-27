import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_DIRECTORY = path.join("data", "database", "AI");

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSafeAiFileName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().endsWith(".json")) return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return false;
  return path.basename(trimmed) === trimmed;
}

function validateOptionalNumber(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${label} must be a valid number.`;
  return "";
}

function validateAbilityRefs(value: unknown, label: string) {
  if (value === undefined) return "";
  if (!Array.isArray(value)) return `${label} must be an array.`;
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) return `${label} entry ${index + 1} must be an object.`;
    const id = String(entry.id ?? "").trim();
    if (!id) return `${label} entry ${index + 1} is missing an id.`;
    if (entry.weight !== undefined && entry.weight !== null && entry.weight !== "" && !Number.isFinite(Number(entry.weight))) {
      return `${label} entry ${index + 1} weight must be numeric.`;
    }
  }
  return "";
}

function validateAiProfile(value: unknown) {
  if (!isRecord(value)) return "An AI JSON object is required.";
  if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some((entry) => typeof entry !== "string"))) {
    return "tags must be an array of strings.";
  }
  if (value.description !== undefined && typeof value.description !== "string") return "description must be a string.";
  if (value.ai_type !== undefined && typeof value.ai_type !== "string") return "ai_type must be a string.";
  if (value.script !== undefined && typeof value.script !== "string") return "script must be a string.";

  return (
    validateOptionalNumber(value.aggro_range, "aggro_range") ||
    validateOptionalNumber(value.weapon_range, "weapon_range") ||
    validateOptionalNumber(value.ai_tick, "ai_tick") ||
    validateOptionalNumber(value.ai_tick_jitter, "ai_tick_jitter") ||
    validateOptionalNumber(value.idle_ai_tick, "idle_ai_tick") ||
    validateOptionalNumber(value.idle_ai_tick_jitter, "idle_ai_tick_jitter") ||
    validateOptionalNumber(value.fire_cadence, "fire_cadence") ||
    validateOptionalNumber(value.chase_speed_multiplier, "chase_speed_multiplier") ||
    validateOptionalNumber(value.opening_attack_duration, "opening_attack_duration") ||
    validateOptionalNumber(value.opening_evade_duration, "opening_evade_duration") ||
    validateOptionalNumber(value.followup_attack_duration, "followup_attack_duration") ||
    validateOptionalNumber(value.low_armor_evade_threshold, "low_armor_evade_threshold") ||
    validateOptionalNumber(value.low_armor_evade_duration, "low_armor_evade_duration") ||
    validateOptionalNumber(value.evade_speed_multiplier, "evade_speed_multiplier") ||
    validateOptionalNumber(value.intercept_max_lead_time, "intercept_max_lead_time") ||
    validateOptionalNumber(value.intercept_heading_smoothing, "intercept_heading_smoothing") ||
    validateOptionalNumber(value.disengage_start_distance, "disengage_start_distance") ||
    validateOptionalNumber(value.disengage_after, "disengage_after") ||
    validateOptionalNumber(value.leash_distance, "leash_distance") ||
    validateAbilityRefs(value.main_abilities, "main_abilities") ||
    validateAbilityRefs(value.secondary_abilities, "secondary_abilities")
  );
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fileName = body?.fileName;
    const profile = isRecord(body?.profile) ? { ...body.profile } : body?.profile;
    if (isRecord(profile)) {
      delete profile.notes;
    }
    if (!isSafeAiFileName(fileName)) {
      return NextResponse.json({ ok: false, error: "A safe AI JSON file name is required." }, { status: 400 });
    }

    const validationError = validateAiProfile(profile);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const targetPath = path.join(localGameSource.gameRootPath, AI_DIRECTORY, fileName);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
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
