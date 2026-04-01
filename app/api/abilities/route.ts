import { NextResponse } from "next/server";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";

export const runtime = "nodejs";

export async function GET() {
  await warmupLoadIfNeeded();
  const store = getStore();
  const data = store.abilities
    .slice()
    .sort((left, right) => {
      const leftLabel = (left.name || String(left.id)).toLowerCase();
      const rightLabel = (right.name || String(right.id)).toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

  return NextResponse.json({ data });
}
