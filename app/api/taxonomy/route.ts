import { NextRequest, NextResponse } from "next/server";
import { readTaxonomyCatalog, saveTaxonomyCatalog } from "@lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await readTaxonomyCatalog();
    return NextResponse.json({ ok: true, ...catalog });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const catalog = await saveTaxonomyCatalog({
      factions: Array.isArray(body?.factions) ? body.factions : undefined,
      classes: Array.isArray(body?.classes) ? body.classes : undefined,
    });
    return NextResponse.json({ ok: true, ...catalog });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
