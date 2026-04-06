import { NextResponse } from "next/server";
import { clearUploadedAssets, getUploadedAssetsState, importUploadedAssets } from "@lib/uploaded-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, assets: getUploadedAssetsState() });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const paths = formData.getAll("paths").map((value) => String(value));
    if (!files.length) {
      throw new Error("Choose the /assets folder before importing.");
    }

    const entries = await Promise.all(
      files.map(async (file, index) => ({
        relativePath: paths[index] || file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    );

    const assets = await importUploadedAssets(entries);
    return NextResponse.json({ ok: true, assets });
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

export async function DELETE() {
  try {
    const assets = await clearUploadedAssets();
    return NextResponse.json({ ok: true, assets });
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
