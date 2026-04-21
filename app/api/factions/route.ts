import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FactionOption = {
  name: string;
  defaultPoints: number;
  forcedPoints: number | null;
};

function parseGdStringNumberDictionary(source: string, constantName: string) {
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*:\\s*Dictionary\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return new Map<string, number>();

  const out = new Map<string, number>();
  const body = match[1];
  const entryPattern = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?|MIN_REPUTATION_POINTS|MAX_REPUTATION_POINTS)/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryPattern.exec(body))) {
    const [, name, rawValue] = entry;
    const value = rawValue === "MIN_REPUTATION_POINTS" ? -50000 : rawValue === "MAX_REPUTATION_POINTS" ? 100000 : Number(rawValue);
    if (Number.isFinite(value)) out.set(name, value);
  }

  return out;
}

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const reputationPath = path.join(localGameSource.gameRootPath, "data", "database", "reputation", "PlayerReputation.gd");
    const source = await fsp.readFile(reputationPath, "utf-8");
    const defaults = parseGdStringNumberDictionary(source, "DEFAULT_FACTION_POINTS");
    const forced = parseGdStringNumberDictionary(source, "FORCED_FACTION_POINTS");
    const factions: FactionOption[] = Array.from(defaults.entries())
      .map(([name, defaultPoints]) => ({
        name,
        defaultPoints,
        forcedPoints: forced.get(name) ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game source",
      data: factions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
