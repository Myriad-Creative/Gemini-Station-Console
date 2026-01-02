import { NextRequest, NextResponse } from "next/server";
import { loadAll, loadFromZip, setRepoRoot } from "@lib/datastore";
import { DataUrls, saveConfig } from "@lib/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("zip");
    if (file && typeof file !== "string" && "arrayBuffer" in file) {
      const buf = Buffer.from(await (file as File).arrayBuffer());
      const { repoRoot } = await loadFromZip(buf);
      saveConfig({ repo_root: repoRoot });
      setRepoRoot(repoRoot);
      return NextResponse.json({ ok: true, repoRoot, via: "zip" });
    }
    return NextResponse.json({ ok: false, error: "Missing 'zip' file" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const repoRoot = typeof body.repoRoot === "string" && body.repoRoot.trim() ? body.repoRoot.trim() : null;
  const dataUrls: DataUrls | null = body.dataUrls && typeof body.dataUrls === "object" ? body.dataUrls : null;

  if (repoRoot || dataUrls) {
    await loadAll({ repoRoot: repoRoot ?? undefined, dataUrls: dataUrls ?? undefined });
    saveConfig({ repo_root: repoRoot, data_urls: dataUrls ?? {} });
    setRepoRoot(repoRoot);
    return NextResponse.json({ ok: true, repoRoot, dataUrls, via: dataUrls ? "urls" : "path" });
  }

  return NextResponse.json({ ok: false, error: "Provide repoRoot or upload zip" }, { status: 400 });
}
