import fs from "fs";
import fsp from "fs/promises";
import path from "path";

export type UploadedAssetsState = {
  active: boolean;
  storagePath: string | null;
  fileCount: number;
  imageCount: number;
  totalBytes: number;
  lastImported: string | null;
};

type UploadedAssetsMetadata = {
  fileCount: number;
  imageCount: number;
  totalBytes: number;
  lastImported: string;
};

type UploadedAssetEntry = {
  relativePath: string;
  buffer: Buffer;
};

const UPLOADED_ASSETS_ROOT = path.resolve(process.cwd(), ".gemini-uploaded-assets");
const UPLOADED_ASSETS_DIR = path.join(UPLOADED_ASSETS_ROOT, "assets");
const UPLOADED_ASSETS_METADATA = path.join(UPLOADED_ASSETS_ROOT, "metadata.json");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function normalizeUploadedAssetPath(rawPath: string): string | null {
  const cleaned = rawPath.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!cleaned) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === "." || part === "..")) return null;
  if (parts.includes("__MACOSX")) return null;
  if (parts[parts.length - 1] === ".DS_Store") return null;

  const assetsIndex = parts.findIndex((part) => part.toLowerCase() === "assets");
  const scopedParts = assetsIndex >= 0 ? parts.slice(assetsIndex) : ["assets", ...parts];
  if (scopedParts.length < 2) return null;
  return scopedParts.join("/");
}

function buildState(metadata?: UploadedAssetsMetadata | null): UploadedAssetsState {
  return {
    active: !!metadata,
    storagePath: metadata ? path.relative(process.cwd(), UPLOADED_ASSETS_DIR) || ".gemini-uploaded-assets/assets" : null,
    fileCount: metadata?.fileCount ?? 0,
    imageCount: metadata?.imageCount ?? 0,
    totalBytes: metadata?.totalBytes ?? 0,
    lastImported: metadata?.lastImported ?? null,
  };
}

function summarizeAssetsDir(dir: string): UploadedAssetsMetadata {
  let fileCount = 0;
  let imageCount = 0;
  let totalBytes = 0;

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      fileCount += 1;
      try {
        const stat = fs.statSync(fullPath);
        totalBytes += stat.size;
      } catch {}
      if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        imageCount += 1;
      }
    }
  }

  let lastImported: string;
  try {
    lastImported = fs.statSync(dir).mtime.toISOString();
  } catch {
    lastImported = new Date().toISOString();
  }

  return { fileCount, imageCount, totalBytes, lastImported };
}

function readMetadata(): UploadedAssetsMetadata | null {
  if (!fs.existsSync(UPLOADED_ASSETS_DIR)) return null;

  try {
    if (fs.existsSync(UPLOADED_ASSETS_METADATA)) {
      const parsed = JSON.parse(fs.readFileSync(UPLOADED_ASSETS_METADATA, "utf-8")) as UploadedAssetsMetadata;
      if (
        typeof parsed?.fileCount === "number" &&
        typeof parsed?.imageCount === "number" &&
        typeof parsed?.totalBytes === "number" &&
        typeof parsed?.lastImported === "string"
      ) {
        return parsed;
      }
    }
  } catch {}

  return summarizeAssetsDir(UPLOADED_ASSETS_DIR);
}

export function getUploadedAssetsState(): UploadedAssetsState {
  return buildState(readMetadata());
}

export function getUploadedAssetsRoot(): string | null {
  return fs.existsSync(UPLOADED_ASSETS_DIR) ? UPLOADED_ASSETS_ROOT : null;
}

export async function clearUploadedAssets(): Promise<UploadedAssetsState> {
  await fsp.rm(UPLOADED_ASSETS_ROOT, { recursive: true, force: true });
  return buildState(null);
}

export async function importUploadedAssets(entries: UploadedAssetEntry[]): Promise<UploadedAssetsState> {
  const tempRoot = path.resolve(process.cwd(), ".gemini-uploaded-assets.tmp");
  await fsp.rm(tempRoot, { recursive: true, force: true });

  let fileCount = 0;
  let imageCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const relativePath = normalizeUploadedAssetPath(entry.relativePath);
    if (!relativePath) continue;

    const destination = path.join(tempRoot, relativePath);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, entry.buffer);

    fileCount += 1;
    totalBytes += entry.buffer.length;
    if (IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      imageCount += 1;
    }
  }

  if (!fileCount) {
    await fsp.rm(tempRoot, { recursive: true, force: true });
    throw new Error("No asset files were found. Choose the /assets folder itself so the relative asset paths are preserved.");
  }

  const metadata: UploadedAssetsMetadata = {
    fileCount,
    imageCount,
    totalBytes,
    lastImported: new Date().toISOString(),
  };

  await fsp.writeFile(path.join(tempRoot, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
  await fsp.rm(UPLOADED_ASSETS_ROOT, { recursive: true, force: true });
  await fsp.rename(tempRoot, UPLOADED_ASSETS_ROOT);

  return buildState(metadata);
}
