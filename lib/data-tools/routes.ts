import {
  createDraftKey,
  createUniqueId,
  objectWithoutKeys,
  parseExtraJsonObject,
  stringifyJson,
} from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type { NpcTrafficWorkspace, TradeRouteDraft, TradeRoutesWorkspace } from "@lib/data-tools/types";

function createTradeRouteDraft(record?: Record<string, unknown>): TradeRouteDraft {
  const sector = record?.sector && typeof record.sector === "object" ? (record.sector as Record<string, unknown>) : {};
  const endpoints = record?.endpoints && typeof record.endpoints === "object" ? (record.endpoints as Record<string, unknown>) : {};
  const endpointA = endpoints.a && typeof endpoints.a === "object" ? (endpoints.a as Record<string, unknown>) : {};
  const endpointB = endpoints.b && typeof endpoints.b === "object" ? (endpoints.b as Record<string, unknown>) : {};

  return {
    key: createDraftKey("route"),
    id: String(record?.id ?? ""),
    name: String(record?.name ?? ""),
    sectorX: String(sector.x ?? ""),
    sectorY: String(sector.y ?? ""),
    width: String(record?.width ?? ""),
    speedMultiplier: String(record?.speed_multiplier ?? ""),
    color: String(record?.color ?? ""),
    borderColor: String(record?.border_color ?? ""),
    opacity: String(record?.opacity ?? ""),
    borderPx: String(record?.border_px ?? ""),
    endpointAX: String(endpointA.x ?? ""),
    endpointAY: String(endpointA.y ?? ""),
    endpointAName: String(endpointA.name ?? ""),
    endpointBX: String(endpointB.x ?? ""),
    endpointBY: String(endpointB.y ?? ""),
    endpointBName: String(endpointB.name ?? ""),
    pointsJson: stringifyJson(Array.isArray(record?.points) ? record.points : []),
    smoothingJson: stringifyJson(record?.smoothing ?? {}),
    sCurveJson: stringifyJson(record?.s_curve ?? {}),
    extraJson: stringifyJson(
      objectWithoutKeys(record ?? {}, [
        "id",
        "name",
        "sector",
        "width",
        "speed_multiplier",
        "color",
        "border_color",
        "opacity",
        "border_px",
        "endpoints",
        "points",
        "smoothing",
        "s_curve",
      ]),
    ),
  };
}

function exportTradeRouteDraft(draft: TradeRouteDraft) {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    sector: {
      x: Number(draft.sectorX || 0),
      y: Number(draft.sectorY || 0),
    },
    width: Number(draft.width || 0),
    speed_multiplier: Number(draft.speedMultiplier || 0),
    color: draft.color.trim(),
    border_color: draft.borderColor.trim(),
    opacity: Number(draft.opacity || 0),
    border_px: Number(draft.borderPx || 0),
    endpoints: {
      a: {
        x: Number(draft.endpointAX || 0),
        y: Number(draft.endpointAY || 0),
        name: draft.endpointAName.trim(),
      },
      b: {
        x: Number(draft.endpointBX || 0),
        y: Number(draft.endpointBY || 0),
        name: draft.endpointBName.trim(),
      },
    },
    points: JSON.parse(draft.pointsJson || "[]") as unknown[],
    smoothing: JSON.parse(draft.smoothingJson || "{}") as Record<string, unknown>,
    s_curve: JSON.parse(draft.sCurveJson || "{}") as Record<string, unknown>,
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for trade route "${draft.id || draft.name || "untitled"}"`),
  };
}

export function createBlankTradeRoutesWorkspace(): TradeRoutesWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    version: "1",
    routes: [createBlankTradeRoute()],
  };
}

export function createBlankTradeRoute(existingIds: string[] = []): TradeRouteDraft {
  return createTradeRouteDraft({
    id: createUniqueId("new_route", existingIds),
    name: "New Trade Route",
    sector: { x: 0, y: 0 },
    width: 2500,
    speed_multiplier: 1.5,
    color: "#2F4558",
    border_color: "#B0ECFE",
    opacity: 0.05,
    border_px: 0,
    endpoints: {
      a: { x: 0, y: 0, name: "A" },
      b: { x: 1000, y: 1000, name: "B" },
    },
    points: [],
    smoothing: { tension: 0.2 },
    s_curve: {},
  });
}

export function cloneTradeRoute(draft: TradeRouteDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("route"),
    id: createUniqueId(`${draft.id || "route"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importTradeRoutesWorkspace(text: string | null, sourceLabel: string | null): TradeRoutesWorkspace {
  if (!text) return createBlankTradeRoutesWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || !Array.isArray(root.routes)) {
    throw new Error("trade_routes.json must contain a top-level { version, routes: [] } object.");
  }
  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    version: String(root.version ?? "1"),
    routes: root.routes
      .filter((route): route is Record<string, unknown> => !!route && typeof route === "object" && !Array.isArray(route))
      .map((route) => createTradeRouteDraft(route)),
  };
}

export function stringifyTradeRoutesFile(workspace: TradeRoutesWorkspace) {
  return JSON.stringify(
    {
      version: Number(workspace.version || 1),
      routes: workspace.routes.map(exportTradeRouteDraft),
    },
    null,
    2,
  );
}

export function stringifySingleTradeRoute(draft: TradeRouteDraft) {
  return JSON.stringify(exportTradeRouteDraft(draft), null, 2);
}

export function createBlankNpcTrafficWorkspace(): NpcTrafficWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    enabled: true,
    maxActive: "100",
    spawnIntervalSec: "1",
    minSpawnDistance: "1000",
    maxSpawnDistance: "5000",
    despawnDistance: "10000",
    defaultLevelMin: "1",
    defaultLevelMax: "10",
    defaultRouteMaxShips: "5",
    defaultTemplateWeightsJson: "{}",
    templatesJson: "{}",
    routeLevelRangesJson: "{}",
    routeMaxShipsJson: "{}",
    routeTemplateWeightsJson: "{}",
    sectorLevelRangesJson: "{}",
    patrolsJson: "[]",
    extraJson: "{}",
  };
}

export function importNpcTrafficWorkspace(text: string | null, sourceLabel: string | null): NpcTrafficWorkspace {
  if (!text) return createBlankNpcTrafficWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("npc_traffic.json must contain a top-level object.");
  }
  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    enabled: Boolean(root.enabled),
    maxActive: String(root.max_active ?? ""),
    spawnIntervalSec: String(root.spawn_interval_sec ?? ""),
    minSpawnDistance: String(root.min_spawn_distance ?? ""),
    maxSpawnDistance: String(root.max_spawn_distance ?? ""),
    despawnDistance: String(root.despawn_distance ?? ""),
    defaultLevelMin: String(root.default_level_min ?? ""),
    defaultLevelMax: String(root.default_level_max ?? ""),
    defaultRouteMaxShips: String(root.default_route_max_ships ?? ""),
    defaultTemplateWeightsJson: stringifyJson(root.default_template_weights ?? {}),
    templatesJson: stringifyJson(root.templates ?? {}),
    routeLevelRangesJson: stringifyJson(root.route_level_ranges ?? {}),
    routeMaxShipsJson: stringifyJson(root.route_max_ships ?? {}),
    routeTemplateWeightsJson: stringifyJson(root.route_template_weights ?? {}),
    sectorLevelRangesJson: stringifyJson(root.sector_level_ranges ?? {}),
    patrolsJson: stringifyJson(root.patrols ?? []),
    extraJson: stringifyJson(
      objectWithoutKeys(root, [
        "enabled",
        "max_active",
        "spawn_interval_sec",
        "min_spawn_distance",
        "max_spawn_distance",
        "despawn_distance",
        "default_level_min",
        "default_level_max",
        "default_route_max_ships",
        "default_template_weights",
        "templates",
        "route_level_ranges",
        "route_max_ships",
        "route_template_weights",
        "sector_level_ranges",
        "patrols",
      ]),
    ),
  };
}

export function stringifyNpcTrafficFile(workspace: NpcTrafficWorkspace) {
  return JSON.stringify(
    {
      enabled: workspace.enabled,
      max_active: Number(workspace.maxActive || 0),
      spawn_interval_sec: Number(workspace.spawnIntervalSec || 0),
      min_spawn_distance: Number(workspace.minSpawnDistance || 0),
      max_spawn_distance: Number(workspace.maxSpawnDistance || 0),
      despawn_distance: Number(workspace.despawnDistance || 0),
      default_level_min: Number(workspace.defaultLevelMin || 0),
      default_level_max: Number(workspace.defaultLevelMax || 0),
      default_route_max_ships: Number(workspace.defaultRouteMaxShips || 0),
      default_template_weights: JSON.parse(workspace.defaultTemplateWeightsJson || "{}") as Record<string, unknown>,
      templates: JSON.parse(workspace.templatesJson || "{}") as Record<string, unknown>,
      route_level_ranges: JSON.parse(workspace.routeLevelRangesJson || "{}") as Record<string, unknown>,
      route_max_ships: JSON.parse(workspace.routeMaxShipsJson || "{}") as Record<string, unknown>,
      route_template_weights: JSON.parse(workspace.routeTemplateWeightsJson || "{}") as Record<string, unknown>,
      sector_level_ranges: JSON.parse(workspace.sectorLevelRangesJson || "{}") as Record<string, unknown>,
      patrols: JSON.parse(workspace.patrolsJson || "[]") as unknown[],
      ...parseExtraJsonObject(workspace.extraJson, "Extra JSON for npc_traffic.json"),
    },
    null,
    2,
  );
}
