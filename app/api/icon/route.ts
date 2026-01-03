import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getConfig } from "@lib/config";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { fetchWithProxy } from "@parser/fileutils";

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
  await warmupLoadIfNeeded();
  const url = new URL(req.url);
  const resParam = url.searchParams.get("res");
  if (!resParam) return new NextResponse("Missing res", { status: 400 });
  const store = getStore();
  const repo = (store as any).repoRoot as string | undefined;

  let p = resParam;
  if (p.startsWith("res://")) p = p.slice("res://".length);
  const cleaned = p.replace(/^\/+/, "");
  let abs: string | null = repo ? path.join(repo, cleaned) : null;

  if (repo && abs && !fs.existsSync(abs)) {
    const base = path.basename(cleaned);
    const tries = [
      path.join(repo, "assets", "mods", base),
      path.join(repo, "assets", "items", base),
      path.join(repo, "assets", cleaned),
      path.join(repo, "assets", "mods", cleaned),
      path.join(repo, "assets", "items", cleaned)
    ];
    for (const t of tries) { if (fs.existsSync(t)) { abs = t; break; } }
    if (!fs.existsSync(abs)) {
      const m = searchRecursive(path.join(repo, "assets", "mods"), base) || searchRecursive(path.join(repo, "assets", "items"), base);
      if (m) abs = m;
    }
    if (!fs.existsSync(abs)) {
      const id = url.searchParams.get("id") || "";
      const name = url.searchParams.get("name") || "";
      const bases = Array.from(new Set([base, slugify(id)+".png", slugify(name)+".png", slugify(id)+".webp", slugify(name)+".webp"])).filter(Boolean);
      for (const b of bases) {
        const found = searchRecursive(path.join(repo, "assets"), b);
        if (found) { abs = found; break; }
      }
    }
  }

  if (abs && fs.existsSync(abs)) {
    const ext = path.extname(abs).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream";
    const buf = fs.readFileSync(abs);
    return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
  }

  // Remote fallback (manifest host + /assets)
  const cfg = getConfig();
  let manifestOrigin: URL | null = null;
  try { manifestOrigin = new URL(cfg.manifest_url); } catch {}
  const remoteCandidates: string[] = [];
  if (/^https?:\/\//i.test(cleaned)) remoteCandidates.push(cleaned);
  if (manifestOrigin) {
    const base = `${manifestOrigin.protocol}//${manifestOrigin.host}`;
    const baseClean = cleaned.replace(/^\/+/, "");
    remoteCandidates.push(`${base}/${baseClean}`);
    if (!baseClean.toLowerCase().startsWith("assets/")) {
      remoteCandidates.push(`${base}/assets/${baseClean}`);
    }
  }

  for (const candidate of remoteCandidates) {
    try {
      const r = await fetchWithProxy(candidate);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const type = (r as any)?.headers?.get ? (r as any).headers.get("content-type") : (r as any)?.headers?.["content-type"] || "application/octet-stream";
      return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "public, max-age=3600" } });
    } catch {
      continue;
    }
  }

  return new NextResponse("Not found", { status: 404 });
}
