import fs from "fs";
import path from "path";

export function readJson<T>(p: string): T | null {
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function exists(p: string) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function listFilesRecursive(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listFilesRecursive(full, exts));
      else if (exts.some(e => entry.name.toLowerCase().endsWith(e))) out.push(full);
    }
  } catch {}
  return out;
}

export async function readJsonFromUrl<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }
  return await res.json() as T;
}
