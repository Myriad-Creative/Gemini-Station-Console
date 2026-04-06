"use client";

import { useEffect, useMemo, useState } from "react";
import { duplicateIdMap, insertAfterIndex, removeAtIndex, setAtIndex } from "@lib/data-tools/common";
import {
  cloneTradeRoute,
  createBlankNpcTrafficWorkspace,
  createBlankTradeRoute,
  createBlankTradeRoutesWorkspace,
  importNpcTrafficWorkspace,
  importTradeRoutesWorkspace,
  stringifyNpcTrafficFile,
  stringifySingleTradeRoute,
  stringifyTradeRoutesFile,
} from "@lib/data-tools/routes";
import type { NpcTrafficWorkspace, TradeRouteDraft, TradeRoutesWorkspace } from "@lib/data-tools/types";
import { copyToClipboard, downloadTextFile, JsonTextArea, Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";
type RoutesTab = "tradeRoutes" | "npcTraffic";

function loadSharedText(kind: string) {
  return fetch(`/api/settings/data/source?kind=${kind}`).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.text) return null;
    return payload.text as string;
  });
}

export default function RoutesDataManager() {
  const [routesWorkspace, setRoutesWorkspace] = useState<TradeRoutesWorkspace | null>(null);
  const [trafficWorkspace, setTrafficWorkspace] = useState<NpcTrafficWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<RoutesTab>("tradeRoutes");
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading routes data from the local game root…",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [routesText, trafficText] = await Promise.all([loadSharedText("tradeRoutes"), loadSharedText("npcTraffic")]);
        if (cancelled) return;
        const nextRoutes = routesText ? importTradeRoutesWorkspace(routesText, "Local game source") : createBlankTradeRoutesWorkspace();
        const nextTraffic = trafficText ? importNpcTrafficWorkspace(trafficText, "Local game source") : createBlankNpcTrafficWorkspace();
        setRoutesWorkspace(nextRoutes);
        setTrafficWorkspace(nextTraffic);
        setSelectedRouteKey(nextRoutes.routes[0]?.key ?? null);
        setStatus({
          tone: routesText || trafficText ? "success" : "neutral",
          message:
            routesText || trafficText
              ? "Loaded trade_routes.json and npc_traffic.json from the local game root."
              : "No routes data was found under the active local game root. This editor started with blank route and traffic workspaces.",
        });
      } catch (error) {
        if (cancelled) return;
        setRoutesWorkspace(createBlankTradeRoutesWorkspace());
        setTrafficWorkspace(createBlankNpcTrafficWorkspace());
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const routeDuplicates = useMemo(() => duplicateIdMap(routesWorkspace?.routes ?? []), [routesWorkspace]);
  const filteredRoutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (routesWorkspace?.routes ?? []).filter((route) =>
      query ? [route.id, route.name, route.endpointAName, route.endpointBName].join(" ").toLowerCase().includes(query) : true,
    );
  }, [routesWorkspace, search]);

  useEffect(() => {
    if (!routesWorkspace?.routes.length) return;
    if (!selectedRouteKey || !routesWorkspace.routes.some((route) => route.key === selectedRouteKey)) setSelectedRouteKey(routesWorkspace.routes[0].key);
  }, [routesWorkspace, selectedRouteKey]);

  const selectedRoute = routesWorkspace?.routes.find((route) => route.key === selectedRouteKey) ?? filteredRoutes[0] ?? null;

  function updateRoute(nextRoute: TradeRouteDraft) {
    if (!routesWorkspace || !selectedRoute) return;
    const index = routesWorkspace.routes.findIndex((route) => route.key === selectedRoute.key);
    if (index < 0) return;
    setRoutesWorkspace({ ...routesWorkspace, routes: setAtIndex(routesWorkspace.routes, index, nextRoute) });
  }

  async function handleCopy(kind: "routes" | "traffic" | "currentRoute") {
    const value =
      kind === "routes"
        ? routesWorkspace
          ? stringifyTradeRoutesFile(routesWorkspace)
          : ""
        : kind === "traffic"
          ? trafficWorkspace
            ? stringifyNpcTrafficFile(trafficWorkspace)
            : ""
          : selectedRoute
            ? stringifySingleTradeRoute(selectedRoute)
            : "";
    if (!value) return;
    await copyToClipboard(value);
    setStatus({
      tone: "success",
      message:
        kind === "currentRoute"
          ? "Copied the current trade route JSON."
          : `Copied ${kind === "routes" ? "trade_routes.json" : "npc_traffic.json"} to the clipboard.`,
    });
  }

  function handleDownload(kind: "routes" | "traffic") {
    const filename = kind === "routes" ? "trade_routes.json" : "npc_traffic.json";
    const contents =
      kind === "routes" ? (routesWorkspace ? stringifyTradeRoutesFile(routesWorkspace) : "") : trafficWorkspace ? stringifyNpcTrafficFile(trafficWorkspace) : "";
    if (!contents) return;
    downloadTextFile(filename, contents);
    setStatus({ tone: "success", message: `Downloaded ${filename}.` });
  }

  function addRoute() {
    if (!routesWorkspace) return;
    const next = createBlankTradeRoute(routesWorkspace.routes.map((route) => route.id));
    const index = selectedRoute ? routesWorkspace.routes.findIndex((route) => route.key === selectedRoute.key) : null;
    setRoutesWorkspace({ ...routesWorkspace, routes: insertAfterIndex(routesWorkspace.routes, index, next) });
    setSelectedRouteKey(next.key);
  }

  function cloneSelectedRoute() {
    if (!routesWorkspace || !selectedRoute) return;
    const next = cloneTradeRoute(selectedRoute, routesWorkspace.routes.map((route) => route.id));
    const index = routesWorkspace.routes.findIndex((route) => route.key === selectedRoute.key);
    setRoutesWorkspace({ ...routesWorkspace, routes: insertAfterIndex(routesWorkspace.routes, index, next) });
    setSelectedRouteKey(next.key);
  }

  function deleteSelectedRoute() {
    if (!routesWorkspace || !selectedRoute) return;
    const index = routesWorkspace.routes.findIndex((route) => route.key === selectedRoute.key);
    if (index < 0) return;
    const nextRoutes = removeAtIndex(routesWorkspace.routes, index);
    const fallback = nextRoutes.length ? nextRoutes : [createBlankTradeRoute()];
    setRoutesWorkspace({ ...routesWorkspace, routes: fallback });
    setSelectedRouteKey(fallback[0]?.key ?? null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Routes</h1>
        <p className="max-w-4xl text-white/65">
          Edit trade route geometry and NPC traffic configuration loaded from the active local game root in Settings.
        </p>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Trade Routes" value={routesWorkspace?.routes.length ?? 0} />
        <SummaryCard label="Route Duplicates" value={routeDuplicates.size} />
        <SummaryCard label="Traffic Enabled" value={trafficWorkspace?.enabled ? "Yes" : "No"} />
        <SummaryCard label="Traffic Templates" value={trafficWorkspace ? Object.keys(JSON.parse(trafficWorkspace.templatesJson || "{}")).length : 0} />
      </div>

      <div className="flex flex-wrap gap-3">
        {([
          ["tradeRoutes", "Trade Routes"],
          ["npcTraffic", "NPC Traffic"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${activeTab === tab ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "tradeRoutes" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Section title="Route Library" description="Search, create, clone, delete, and export trade route records.">
            <div className="space-y-2">
              <div className="label">Search</div>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by id, name, or endpoint" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn justify-center" onClick={addRoute}>
                New
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={cloneSelectedRoute}>
                Clone
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("currentRoute")}>
                Copy Current
              </button>
              <button type="button" className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20" onClick={deleteSelectedRoute}>
                Delete
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("routes")}>
                Copy trade_routes.json
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => handleDownload("routes")}>
                Download trade_routes.json
              </button>
            </div>

            <div className="space-y-2">
              {filteredRoutes.map((route) => (
                <button
                  key={route.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left ${route.key === selectedRouteKey ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                  onClick={() => setSelectedRouteKey(route.key)}
                >
                  <div className="font-medium text-white">{route.id || "Untitled"}</div>
                  <div className="text-sm text-white/55">{route.name || "No name yet"}</div>
                  <div className="mt-1 text-xs text-white/45">
                    {route.endpointAName || "A"} → {route.endpointBName || "B"}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {selectedRoute ? (
            <Section title="Trade Route Editor" description="Edit route geometry, colors, endpoints, and spline control settings.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="label">Route ID</div>
                  <input className="input" value={selectedRoute.id} onChange={(event) => updateRoute({ ...selectedRoute, id: event.target.value })} />
                </div>
                <div>
                  <div className="label">Name</div>
                  <input className="input" value={selectedRoute.name} onChange={(event) => updateRoute({ ...selectedRoute, name: event.target.value })} />
                </div>
                <div>
                  <div className="label">Sector X</div>
                  <input className="input" value={selectedRoute.sectorX} onChange={(event) => updateRoute({ ...selectedRoute, sectorX: event.target.value })} />
                </div>
                <div>
                  <div className="label">Sector Y</div>
                  <input className="input" value={selectedRoute.sectorY} onChange={(event) => updateRoute({ ...selectedRoute, sectorY: event.target.value })} />
                </div>
                <div>
                  <div className="label">Width</div>
                  <input className="input" value={selectedRoute.width} onChange={(event) => updateRoute({ ...selectedRoute, width: event.target.value })} />
                </div>
                <div>
                  <div className="label">Speed Multiplier</div>
                  <input className="input" value={selectedRoute.speedMultiplier} onChange={(event) => updateRoute({ ...selectedRoute, speedMultiplier: event.target.value })} />
                </div>
                <div>
                  <div className="label">Color</div>
                  <input className="input" value={selectedRoute.color} onChange={(event) => updateRoute({ ...selectedRoute, color: event.target.value })} />
                </div>
                <div>
                  <div className="label">Border Color</div>
                  <input className="input" value={selectedRoute.borderColor} onChange={(event) => updateRoute({ ...selectedRoute, borderColor: event.target.value })} />
                </div>
                <div>
                  <div className="label">Opacity</div>
                  <input className="input" value={selectedRoute.opacity} onChange={(event) => updateRoute({ ...selectedRoute, opacity: event.target.value })} />
                </div>
                <div>
                  <div className="label">Border Px</div>
                  <input className="input" value={selectedRoute.borderPx} onChange={(event) => updateRoute({ ...selectedRoute, borderPx: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint A Name</div>
                  <input className="input" value={selectedRoute.endpointAName} onChange={(event) => updateRoute({ ...selectedRoute, endpointAName: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint B Name</div>
                  <input className="input" value={selectedRoute.endpointBName} onChange={(event) => updateRoute({ ...selectedRoute, endpointBName: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint A X</div>
                  <input className="input" value={selectedRoute.endpointAX} onChange={(event) => updateRoute({ ...selectedRoute, endpointAX: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint A Y</div>
                  <input className="input" value={selectedRoute.endpointAY} onChange={(event) => updateRoute({ ...selectedRoute, endpointAY: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint B X</div>
                  <input className="input" value={selectedRoute.endpointBX} onChange={(event) => updateRoute({ ...selectedRoute, endpointBX: event.target.value })} />
                </div>
                <div>
                  <div className="label">Endpoint B Y</div>
                  <input className="input" value={selectedRoute.endpointBY} onChange={(event) => updateRoute({ ...selectedRoute, endpointBY: event.target.value })} />
                </div>
              </div>

              {routeDuplicates.has(selectedRoute.id.trim()) ? (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This trade route ID is duplicated in the current workspace.</div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <JsonTextArea label="Points JSON" value={selectedRoute.pointsJson} onChange={(nextValue) => updateRoute({ ...selectedRoute, pointsJson: nextValue })} />
                <JsonTextArea label="Smoothing JSON" value={selectedRoute.smoothingJson} onChange={(nextValue) => updateRoute({ ...selectedRoute, smoothingJson: nextValue })} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <JsonTextArea label="S-Curve JSON" value={selectedRoute.sCurveJson} onChange={(nextValue) => updateRoute({ ...selectedRoute, sCurveJson: nextValue })} />
                <JsonTextArea label="Extra JSON" value={selectedRoute.extraJson} onChange={(nextValue) => updateRoute({ ...selectedRoute, extraJson: nextValue })} />
              </div>
            </Section>
          ) : null}
        </div>
      ) : trafficWorkspace ? (
        <Section title="NPC Traffic Editor" description="Edit the shared npc_traffic.json runtime configuration.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
              <span>Enabled</span>
              <input type="checkbox" checked={trafficWorkspace.enabled} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, enabled: event.target.checked })} />
            </label>
            <div>
              <div className="label">Max Active</div>
              <input className="input" value={trafficWorkspace.maxActive} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, maxActive: event.target.value })} />
            </div>
            <div>
              <div className="label">Spawn Interval Seconds</div>
              <input className="input" value={trafficWorkspace.spawnIntervalSec} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, spawnIntervalSec: event.target.value })} />
            </div>
            <div>
              <div className="label">Default Route Max Ships</div>
              <input className="input" value={trafficWorkspace.defaultRouteMaxShips} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, defaultRouteMaxShips: event.target.value })} />
            </div>
            <div>
              <div className="label">Min Spawn Distance</div>
              <input className="input" value={trafficWorkspace.minSpawnDistance} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, minSpawnDistance: event.target.value })} />
            </div>
            <div>
              <div className="label">Max Spawn Distance</div>
              <input className="input" value={trafficWorkspace.maxSpawnDistance} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, maxSpawnDistance: event.target.value })} />
            </div>
            <div>
              <div className="label">Despawn Distance</div>
              <input className="input" value={trafficWorkspace.despawnDistance} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, despawnDistance: event.target.value })} />
            </div>
            <div>
              <div className="label">Default Level Range</div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input className="input" value={trafficWorkspace.defaultLevelMin} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, defaultLevelMin: event.target.value })} />
                <span className="text-white/50">to</span>
                <input className="input" value={trafficWorkspace.defaultLevelMax} onChange={(event) => setTrafficWorkspace({ ...trafficWorkspace, defaultLevelMax: event.target.value })} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <JsonTextArea label="Default Template Weights JSON" value={trafficWorkspace.defaultTemplateWeightsJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, defaultTemplateWeightsJson: nextValue })} />
            <JsonTextArea label="Templates JSON" value={trafficWorkspace.templatesJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, templatesJson: nextValue })} />
            <JsonTextArea label="Route Level Ranges JSON" value={trafficWorkspace.routeLevelRangesJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, routeLevelRangesJson: nextValue })} />
            <JsonTextArea label="Route Max Ships JSON" value={trafficWorkspace.routeMaxShipsJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, routeMaxShipsJson: nextValue })} />
            <JsonTextArea label="Route Template Weights JSON" value={trafficWorkspace.routeTemplateWeightsJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, routeTemplateWeightsJson: nextValue })} />
            <JsonTextArea label="Sector Level Ranges JSON" value={trafficWorkspace.sectorLevelRangesJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, sectorLevelRangesJson: nextValue })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <JsonTextArea label="Patrols JSON" value={trafficWorkspace.patrolsJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, patrolsJson: nextValue })} />
            <JsonTextArea label="Extra JSON" value={trafficWorkspace.extraJson} onChange={(nextValue) => setTrafficWorkspace({ ...trafficWorkspace, extraJson: nextValue })} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void handleCopy("traffic")}>
              Copy npc_traffic.json
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => handleDownload("traffic")}>
              Download npc_traffic.json
            </button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
