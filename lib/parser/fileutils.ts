import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

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

const execFileAsync = promisify(execFile);
const STATUS_MARKER = "\nCURLSTATUS:";
const TYPE_MARKER = "\nCONTENTTYPE:";

type SimpleResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  json(): Promise<any>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export async function fetchWithProxy(input: string): Promise<SimpleResponse> {
  const { stdout } = await execFileAsync("curl", [
    "-sSL",
    "-w", "\\nCURLSTATUS:%{http_code}\\nCONTENTTYPE:%{content_type}\\n",
    "-o", "-",
    input
  ], { encoding: "buffer", maxBuffer: 15 * 1024 * 1024 });

  const statusMarker = Buffer.from(STATUS_MARKER);
  const typeMarker = Buffer.from(TYPE_MARKER);
  const statusIdx = stdout.lastIndexOf(statusMarker);
  const typeIdx = stdout.lastIndexOf(typeMarker);
  if (statusIdx === -1 || typeIdx === -1 || typeIdx < statusIdx) {
    throw new Error("Failed to parse curl response");
  }

  const bodyBuffer = Buffer.from(stdout.slice(0, statusIdx));
  const statusStart = statusIdx + statusMarker.length;
  const statusEnd = stdout.indexOf(0x0a, statusStart);
  const statusStr = stdout.slice(statusStart, statusEnd === -1 ? undefined : statusEnd).toString().trim();
  const status = Number(statusStr) || 0;

  const typeStart = typeIdx + typeMarker.length;
  const typeEnd = stdout.indexOf(0x0a, typeStart);
  const contentType = stdout.slice(typeStart, typeEnd === -1 ? undefined : typeEnd).toString().trim() || "application/octet-stream";

  const headerRecord: Record<string, string> = { "content-type": contentType };
  const headers = { ...headerRecord, get: (name: string) => headerRecord[name.toLowerCase()] } as Record<string, string> & { get?: (name: string) => string | undefined };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async json() { return JSON.parse(bodyBuffer.toString("utf-8")); },
    async arrayBuffer() { return bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength); },
    async text() { return bodyBuffer.toString("utf-8"); }
  };
}

export async function readJsonFromUrl<T>(url: string): Promise<T> {
  const res = await fetchWithProxy(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} while fetching ${url}`);
  }
  return await res.json() as T;
}
