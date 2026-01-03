import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getStore } from "@lib/datastore";

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

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const resParam = url.searchParams.get("res");
  if (!resParam) return new NextResponse("Missing res", { status: 400 });
  const store = getStore();
  const repo = (store as any).repoRoot as string | undefined;
  if (!repo) return new NextResponse("No local repo configured for icon lookup", { status: 404 });

  let p = resParam;
  if (p.startsWith("res://")) p = p.slice("res://".length);
  let abs = path.join(repo, p);
  if (!fs.existsSync(abs)) {
    const base = path.basename(p);
    const tries = [
      path.join(repo, 'assets', 'mods', base),
      path.join(repo, 'assets', 'items', base),
      path.join(repo, 'assets', p),
      path.join(repo, 'assets', 'mods', p),
      path.join(repo, 'assets', 'items', p)
    ];
    for (const t of tries) { if (fs.existsSync(t)) { abs = t; break; } }
    if (!fs.existsSync(abs)) {
      const m = searchRecursive(path.join(repo, 'assets', 'mods'), base) || searchRecursive(path.join(repo, 'assets', 'items'), base);
      if (m) abs = m;
    }
    if (!fs.existsSync(abs)) {
      const id = url.searchParams.get("id") || "";
      const name = url.searchParams.get("name") || "";
      const bases = Array.from(new Set([base, slugify(id)+'.png', slugify(name)+'.png', slugify(id)+'.webp', slugify(name)+'.webp'])).filter(Boolean);
      for (const b of bases) {
        const found = searchRecursive(path.join(repo, 'assets'), b);
        if (found) { abs = found; break; }
      }
    }
  }
  if (!fs.existsSync(abs)) return new NextResponse("Not found", { status: 404 });

  const ext = path.extname(abs).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream";
  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
}
