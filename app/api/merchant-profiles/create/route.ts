import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { MerchantProfileDraft } from "@lib/merchant-lab/types";
import {
  importMerchantWorkspace,
  insertMerchantProfileAfter,
  stringifyMerchantWorkspace,
  validateMerchantProfiles,
} from "@lib/merchant-lab/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "merchant_profile_001";
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return `${trimmed}_001`;
  const [, prefix, digits] = match;
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
}

function nextAvailableId(baseId: string, existingIds: string[]) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = baseId.trim() || "merchant_profile_001";
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mobId = String(body?.mobId ?? "").trim();
    const displayName = String(body?.displayName ?? "").trim();
    const requestedId = String(body?.id ?? "").trim();
    const merchantProfilesPath = path.join(localGameSource.gameRootPath, "data", "database", "vendor", "merchant_profiles.json");
    const existingText = await fsp.readFile(merchantProfilesPath, "utf-8").catch(() => "[]");
    const result = importMerchantWorkspace(existingText, "Local game source", "uploaded");
    const baseId = requestedId || slugify(`merchant_${mobId || displayName || "profile"}`);
    const id = nextAvailableId(baseId, result.workspace.profiles.map((profile) => profile.id));
    const profile: MerchantProfileDraft = {
      key: `merchant-profile-created-${Date.now()}`,
      sourceIndex: -1,
      id,
      name: displayName ? `${displayName} Merchant` : id,
      description: mobId ? `Created from Mob Lab for ${mobId}.` : "Created from Mob Lab.",
      items: [],
      mods: [],
      extra_json: "",
    };
    const workspace = insertMerchantProfileAfter(result.workspace, null, profile);
    const errors = validateMerchantProfiles(workspace.profiles).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.map((issue) => issue.message).join(" ") }, { status: 400 });
    }

    await fsp.mkdir(path.dirname(merchantProfilesPath), { recursive: true });
    await fsp.writeFile(merchantProfilesPath, `${stringifyMerchantWorkspace(workspace)}\n`, "utf-8");
    await loadAll();

    return NextResponse.json({
      ok: true,
      profile,
      savedPath: merchantProfilesPath,
      savedCount: workspace.profiles.length,
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
