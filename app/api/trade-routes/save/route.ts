import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateTradeRoutes(value: unknown) {
  if (!isRecord(value)) return "A trade route JSON object is required.";
  if (!Array.isArray(value.routes)) return "Trade route JSON must contain a routes array.";

  for (const [index, routeValue] of value.routes.entries()) {
    if (!isRecord(routeValue)) return `Route ${index + 1} must be an object.`;
    const id = typeof routeValue.id === "string" ? routeValue.id.trim() : "";
    if (!id) return `Route ${index + 1} is missing an id.`;
    const endpoints = isRecord(routeValue.endpoints) ? routeValue.endpoints : null;
    if (!endpoints || !isRecord(endpoints.a) || !isRecord(endpoints.b)) {
      return `Route "${id}" must include endpoints.a and endpoints.b.`;
    }
  }

  return "";
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tradeRoutes = body?.tradeRoutes;
    const validationError = validateTradeRoutes(tradeRoutes);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const routesPath = path.join(localGameSource.gameRootPath, "data", "routes", "trade_routes.json");
    await fsp.mkdir(path.dirname(routesPath), { recursive: true });
    await fsp.writeFile(routesPath, `${JSON.stringify(tradeRoutes, null, 2)}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: routesPath,
      savedCount: (tradeRoutes as { routes: unknown[] }).routes.length,
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
