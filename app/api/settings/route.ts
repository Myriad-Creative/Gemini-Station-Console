import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig } from "@lib/config";
import { getStore, loadAll, warmupLoadIfNeeded } from "@lib/datastore";
import { parseLooseJson } from "@lib/json";
import { getUploadedAssetsState } from "@lib/uploaded-assets";
import { getUploadedDataState } from "@lib/uploaded-data";

export const runtime = "nodejs";

function buildResponse() {
  const cfg = getConfig();
  const store = getStore();
  return {
    manifestUrl: store.manifestUrl ?? cfg.manifest_url ?? null,
    lastLoaded: store.lastLoaded,
    errors: store.errors,
    modsOverrideJson: cfg.mods_override_json ?? "",
    modsOverrideActive: !!cfg.mods_override_json?.trim(),
    uploadedAssets: getUploadedAssetsState(),
    uploadedData: getUploadedDataState(),
  };
}

export async function GET() {
  await warmupLoadIfNeeded();
  return NextResponse.json(buildResponse());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawOverride = typeof body?.modsOverrideJson === "string" ? body.modsOverrideJson : "";
    const trimmedOverride = rawOverride.trim();

    if (trimmedOverride) {
      const parsed = parseLooseJson(trimmedOverride);
      if (parsed === null || typeof parsed !== "object") {
        throw new Error("Mods.json override must be a JSON object or array.");
      }
    }

    saveConfig({ mods_override_json: trimmedOverride || null });
    await loadAll();

    return NextResponse.json({ ok: true, ...buildResponse() });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || e),
      },
      { status: 400 },
    );
  }
}
