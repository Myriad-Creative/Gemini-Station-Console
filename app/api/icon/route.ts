import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPreferredAssetsRepoRoot } from "@lib/shared-source";

const FALLBACK_ICON = "icon_lootbox.png";
const ICONS_ASSET_DIR = "icons";
const RETIRED_ICON_ASSET_FOLDERS = new Set(["abilities", "status_effects"]);

function canonicalizeCleanedPath(cleaned: string) {
  const normalized = cleaned.replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  const retiredFolder = parts[0] === "assets" ? parts[1] : parts[0];
  if (RETIRED_ICON_ASSET_FOLDERS.has(retiredFolder)) {
    return `assets/${ICONS_ASSET_DIR}/${path.basename(normalized)}`;
  }
  return normalized;
}

function searchRecursive(dir: string, name: string): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const r = searchRecursive(full, name); if (r) return r;
      } else if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) {
        return full;
      }
    }
  } catch {}
  return null;
}

function resolveFromRoot(root: string, cleaned: string): string | null {
  const canonicalCleaned = canonicalizeCleanedPath(cleaned);
  const direct = path.join(root, canonicalCleaned);
  if (fs.existsSync(direct)) return direct;

  const base = path.basename(canonicalCleaned);
  const assetRelative = canonicalCleaned.toLowerCase().startsWith("assets/") ? canonicalCleaned.slice("assets/".length) : canonicalCleaned;
  const isExplicitAssetSubdirectory = canonicalCleaned.startsWith("assets/") && assetRelative.includes("/");
  const tries = [
    ...(!isExplicitAssetSubdirectory ? [path.join(root, "assets", ICONS_ASSET_DIR, base)] : []),
    path.join(root, "assets", assetRelative),
    path.join(root, "assets", base),
    path.join(root, "assets", ICONS_ASSET_DIR, base),
    path.join(root, "assets", "mods", base),
    path.join(root, "assets", "items", base),
    path.join(root, "assets", "comms", base),
    path.join(root, "assets", "missions", base),
    path.join(root, "assets", "ships", base),
    path.join(root, "assets", "mods", assetRelative),
    path.join(root, "assets", "items", assetRelative),
    path.join(root, "assets", "comms", assetRelative),
    path.join(root, "assets", "missions", assetRelative),
    path.join(root, "assets", "ships", assetRelative),
  ];

  for (const candidate of tries) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const scopedSearchDirs = [
    path.join(root, "assets", ICONS_ASSET_DIR),
    path.join(root, "assets", "mods"),
    path.join(root, "assets", "items"),
    path.join(root, "assets", "comms"),
    path.join(root, "assets", "missions"),
    path.join(root, "assets", "ships"),
  ];

  for (const dir of scopedSearchDirs) {
    const match = searchRecursive(dir, base);
    if (match) return match;
  }

  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const resParam = url.searchParams.get("res") || FALLBACK_ICON;

  let p = resParam;
  if (p.startsWith("res://")) p = p.slice("res://".length);
  const cleaned = p.replace(/^\/+/, "");
  const preferredAssetsRoot = getPreferredAssetsRepoRoot();
  let abs: string | null = preferredAssetsRoot ? resolveFromRoot(preferredAssetsRoot, cleaned) : null;
  if (!abs && preferredAssetsRoot) {
    abs = resolveFromRoot(preferredAssetsRoot, FALLBACK_ICON);
  }

  if (abs && fs.existsSync(abs)) {
    const ext = path.extname(abs).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream";
    const buf = fs.readFileSync(abs);
    return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "no-store, max-age=0" } });
  }

  return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store, max-age=0" } });
}
