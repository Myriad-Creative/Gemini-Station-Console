import JSZip from "jszip";
import { NextResponse } from "next/server";
import { loadAll } from "@lib/datastore";
import { clearUploadedData, getUploadedDataState, importUploadedData } from "@lib/uploaded-data";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, data: getUploadedDataState() });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const archive = formData.get("archive");
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const paths = formData.getAll("paths").map((value) => String(value));

    const entries: Array<{ relativePath: string; buffer: Buffer }> = [];
    let sourceLabel = "Uploaded data folder";

    if (archive instanceof File) {
      sourceLabel = `zip (${archive.name})`;
      const zip = await JSZip.loadAsync(Buffer.from(await archive.arrayBuffer()));
      const zipEntries = Object.values(zip.files).filter((file) => !file.dir);
      for (const file of zipEntries) {
        entries.push({
          relativePath: file.name,
          buffer: await file.async("nodebuffer"),
        });
      }
    } else if (files.length) {
      sourceLabel = "folder upload";
      for (const [index, file] of files.entries()) {
        entries.push({
          relativePath: paths[index] || file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        });
      }
    } else {
      throw new Error("Choose a data zip or the unzipped /data folder before importing.");
    }

    const data = await importUploadedData(entries, sourceLabel);
    await loadAll();
    return NextResponse.json({ ok: true, data });
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
    const data = await clearUploadedData();
    await loadAll();
    return NextResponse.json({ ok: true, data });
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
