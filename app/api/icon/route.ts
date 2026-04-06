import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPreferredAssetsRepoRoot } from "@lib/shared-source";

function slugify(s:string){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
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

function resolveFromRoot(root: string, cleaned: string, id: string, name: string): string | null {
  const direct = path.join(root, cleaned);
  if (fs.existsSync(direct)) return direct;

  const base = path.basename(cleaned);
  const assetRelative = cleaned.toLowerCase().startsWith("assets/") ? cleaned.slice("assets/".length) : cleaned;
  const tries = [
    path.join(root, "assets", assetRelative),
    path.join(root, "assets", base),
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

  const bases = Array.from(
    new Set([
      base,
      slugify(id) + ".png",
      slugify(name) + ".png",
      slugify(id) + ".webp",
      slugify(name) + ".webp",
      slugify(id) + ".jpg",
      slugify(name) + ".jpg",
    ]),
  ).filter(Boolean);

  const assetsRoot = path.join(root, "assets");
  for (const lookup of bases) {
    const found = searchRecursive(assetsRoot, lookup);
    if (found) return found;
  }

  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const resParam = url.searchParams.get("res");
  if (!resParam) return new NextResponse("Missing res", { status: 400 });
  const id = url.searchParams.get("id") || "";
  const name = url.searchParams.get("name") || "";

  let p = resParam;
  if (p.startsWith("res://")) p = p.slice("res://".length);
  const cleaned = p.replace(/^\/+/, "");
  const preferredAssetsRoot = getPreferredAssetsRepoRoot();
  let abs: string | null = preferredAssetsRoot ? resolveFromRoot(preferredAssetsRoot, cleaned, id, name) : null;

  if (abs && fs.existsSync(abs)) {
    const ext = path.extname(abs).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream";
    const buf = fs.readFileSync(abs);
    return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
  }

  return new NextResponse("Not found", { status: 404 });
}
