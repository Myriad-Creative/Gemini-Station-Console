import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { parseLooseJson } from "@lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

type LootTableEntry = {
  id: string;
  weight: number;
  name: string | null;
};

type LootTableOption = {
  id: string;
  rolls: number;
  entryCount: number;
  totalWeight: number;
  entries: LootTableEntry[];
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function normalizeId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^-?\d+(?:\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

async function readLooseJsonFile(filePath: string) {
  return parseLooseJson(await fsp.readFile(filePath, "utf-8"));
}

function buildCatalogById(root: unknown) {
  const values = Array.isArray(root) ? root : Object.values(asObject(root));
  const catalog = new Map<string, string>();
  for (const value of values) {
    const entry = asObject(value);
    const id = normalizeId(entry.id);
    if (!id) continue;
    catalog.set(id, String(entry.name ?? entry.display_name ?? entry.id ?? id));
  }
  return catalog;
}

function buildModCatalogById(root: unknown) {
  const objectRoot = asObject(root);
  const rawMods = Array.isArray(root) ? root : Array.isArray(objectRoot.mods) ? objectRoot.mods : Object.values(asObject(objectRoot.mods));
  const catalog = new Map<string, string>();
  for (const value of rawMods) {
    const entry = asObject(value);
    const id = normalizeId(entry.id);
    if (!id) continue;
    catalog.set(id, String(entry.name ?? entry.display_name ?? entry.id ?? id));
  }
  return catalog;
}

function parseTables(root: unknown, catalog: Map<string, string>): LootTableOption[] {
  const tableRoot = asObject(asObject(root).tables);
  return Object.entries(tableRoot)
    .map(([id, value]) => {
      const table = asObject(value);
      const entries = Array.isArray(table.entries) ? table.entries : [];
      const normalizedEntries = entries
        .map((entryValue) => {
          const entry = asObject(entryValue);
          const entryId = normalizeId(entry.id);
          const weight = Number(entry.weight ?? 0);
          return {
            id: entryId,
            weight: Number.isFinite(weight) ? weight : 0,
            name: catalog.get(entryId) ?? null,
          };
        })
        .filter((entry) => entry.id && entry.weight > 0);
      const rolls = Number(table.rolls ?? 1);

      return {
        id,
        rolls: Number.isFinite(rolls) ? rolls : 1,
        entryCount: normalizedEntries.length,
        totalWeight: normalizedEntries.reduce((total, entry) => total + entry.weight, 0),
        entries: normalizedEntries,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" }));
}

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const root = localGameSource.gameRootPath;
    const [itemTablesRoot, modTablesRoot, itemsRoot, modsRoot] = await Promise.all([
      readLooseJsonFile(path.join(root, "scripts", "system", "loot", "ItemsLootTables.json")),
      readLooseJsonFile(path.join(root, "scripts", "system", "loot", "ModsLootTables.json")),
      readLooseJsonFile(path.join(root, "data", "database", "items", "items.json")).catch(() => null),
      readLooseJsonFile(path.join(root, "data", "database", "mods", "Mods.json")).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game source",
      data: {
        items: parseTables(itemTablesRoot, buildCatalogById(itemsRoot)),
        mods: parseTables(modTablesRoot, buildModCatalogById(modsRoot)),
      },
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
