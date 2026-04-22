"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  copySinglePoiWithRoot,
  copySingleRegionWithRoot,
  createBlankMapWorkspace,
  createBlankPoi,
  createBlankRegion,
  clonePoi,
  cloneRegion,
  importMapWorkspace,
  stringifyPoiFile,
  stringifyRegionsFile,
} from "@lib/data-tools/map";
import { duplicateIdMap, insertAfterIndex, removeAtIndex, setAtIndex } from "@lib/data-tools/common";
import type { MapPoiDraft, MapRegionDraft, MapWorkspace } from "@lib/data-tools/types";
import { copyToClipboard, downloadTextFile, JsonTextArea, Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";
type MapTab = "pois" | "regions";

function loadSharedText(kind: string) {
  return fetch(`/api/settings/data/source?kind=${kind}`).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.text) return null;
    return payload.text as string;
  });
}

export default function MapDataManager() {
  const [workspace, setWorkspace] = useState<MapWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<MapTab>("pois");
  const [selectedPoiKey, setSelectedPoiKey] = useState<string | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading map data from the local game root…",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [poiText, regionsText] = await Promise.all([loadSharedText("poi"), loadSharedText("regions")]);
        if (cancelled) return;
        const nextWorkspace = poiText || regionsText ? importMapWorkspace(poiText, regionsText, "Local game source") : createBlankMapWorkspace();
        setWorkspace(nextWorkspace);
        setSelectedPoiKey(nextWorkspace.pois[0]?.key ?? null);
        setSelectedRegionKey(nextWorkspace.regions[0]?.key ?? null);
        setStatus({
          tone: poiText || regionsText ? "success" : "neutral",
          message:
            poiText || regionsText
              ? "Loaded map data from the local game root."
              : "No map data was found under the active local game root. This editor started with blank POI and region workspaces.",
        });
      } catch (error) {
        if (cancelled) return;
        setWorkspace(createBlankMapWorkspace());
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const poiDuplicates = useMemo(() => duplicateIdMap(workspace?.pois ?? []), [workspace]);
  const regionDuplicates = useMemo(() => duplicateIdMap(workspace?.regions ?? []), [workspace]);
  const filteredPois = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (workspace?.pois ?? []).filter((poi) =>
      query ? [poi.id, poi.name, poi.type].join(" ").toLowerCase().includes(query) : true,
    );
  }, [search, workspace]);
  const filteredRegions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (workspace?.regions ?? []).filter((region) =>
      query ? [region.id, region.name].join(" ").toLowerCase().includes(query) : true,
    );
  }, [search, workspace]);

  useEffect(() => {
    if (!workspace?.pois.length) return;
    if (!selectedPoiKey || !workspace.pois.some((poi) => poi.key === selectedPoiKey)) setSelectedPoiKey(workspace.pois[0].key);
  }, [selectedPoiKey, workspace]);

  useEffect(() => {
    if (!workspace?.regions.length) return;
    if (!selectedRegionKey || !workspace.regions.some((region) => region.key === selectedRegionKey)) setSelectedRegionKey(workspace.regions[0].key);
  }, [selectedRegionKey, workspace]);

  const selectedPoi = workspace?.pois.find((poi) => poi.key === selectedPoiKey) ?? filteredPois[0] ?? null;
  const selectedRegion = workspace?.regions.find((region) => region.key === selectedRegionKey) ?? filteredRegions[0] ?? null;

  function updatePoi(nextPoi: MapPoiDraft) {
    if (!workspace || !selectedPoi) return;
    const index = workspace.pois.findIndex((poi) => poi.key === selectedPoi.key);
    if (index < 0) return;
    setWorkspace({ ...workspace, pois: setAtIndex(workspace.pois, index, nextPoi) });
  }

  function updateRegion(nextRegion: MapRegionDraft) {
    if (!workspace || !selectedRegion) return;
    const index = workspace.regions.findIndex((region) => region.key === selectedRegion.key);
    if (index < 0) return;
    setWorkspace({ ...workspace, regions: setAtIndex(workspace.regions, index, nextRegion) });
  }

  async function handleCopy(kind: "pois" | "regions" | "current") {
    if (!workspace) return;
    const value =
      kind === "pois"
        ? stringifyPoiFile(workspace)
        : kind === "regions"
          ? stringifyRegionsFile(workspace)
          : activeTab === "pois"
            ? selectedPoi
              ? copySinglePoiWithRoot(selectedPoi)
              : ""
            : selectedRegion
              ? copySingleRegionWithRoot(selectedRegion)
              : "";
    if (!value) return;
    await copyToClipboard(value);
    setStatus({
      tone: "success",
      message: kind === "current" ? "Copied the current map record JSON." : `Copied ${kind === "pois" ? "poi.json" : "regions.json"} to the clipboard.`,
    });
  }

  function handleDownload(kind: "pois" | "regions") {
    if (!workspace) return;
    const filename = kind === "pois" ? "poi.json" : "regions.json";
    const contents = kind === "pois" ? stringifyPoiFile(workspace) : stringifyRegionsFile(workspace);
    downloadTextFile(filename, contents);
    setStatus({ tone: "success", message: `Downloaded ${filename}.` });
  }

  function addCurrent() {
    if (!workspace) return;
    if (activeTab === "pois") {
      const next = createBlankPoi(workspace.pois.map((poi) => poi.id));
      const index = selectedPoi ? workspace.pois.findIndex((poi) => poi.key === selectedPoi.key) : null;
      setWorkspace({ ...workspace, pois: insertAfterIndex(workspace.pois, index, next) });
      setSelectedPoiKey(next.key);
      return;
    }

    const next = createBlankRegion(workspace.regions.map((region) => region.id));
    const index = selectedRegion ? workspace.regions.findIndex((region) => region.key === selectedRegion.key) : null;
    setWorkspace({ ...workspace, regions: insertAfterIndex(workspace.regions, index, next) });
    setSelectedRegionKey(next.key);
  }

  function cloneCurrent() {
    if (!workspace) return;
    if (activeTab === "pois" && selectedPoi) {
      const next = clonePoi(selectedPoi, workspace.pois.map((poi) => poi.id));
      const index = workspace.pois.findIndex((poi) => poi.key === selectedPoi.key);
      setWorkspace({ ...workspace, pois: insertAfterIndex(workspace.pois, index, next) });
      setSelectedPoiKey(next.key);
      return;
    }

    if (activeTab === "regions" && selectedRegion) {
      const next = cloneRegion(selectedRegion, workspace.regions.map((region) => region.id));
      const index = workspace.regions.findIndex((region) => region.key === selectedRegion.key);
      setWorkspace({ ...workspace, regions: insertAfterIndex(workspace.regions, index, next) });
      setSelectedRegionKey(next.key);
    }
  }

  function deleteCurrent() {
    if (!workspace) return;
    if (activeTab === "pois" && selectedPoi) {
      const index = workspace.pois.findIndex((poi) => poi.key === selectedPoi.key);
      if (index < 0) return;
      const nextPois = removeAtIndex(workspace.pois, index);
      setWorkspace({ ...workspace, pois: nextPois.length ? nextPois : [createBlankPoi()] });
      setSelectedPoiKey(nextPois[0]?.key ?? null);
      return;
    }

    if (activeTab === "regions" && selectedRegion) {
      const index = workspace.regions.findIndex((region) => region.key === selectedRegion.key);
      if (index < 0) return;
      const nextRegions = removeAtIndex(workspace.regions, index);
      setWorkspace({ ...workspace, regions: nextRegions.length ? nextRegions : [createBlankRegion()] });
      setSelectedRegionKey(nextRegions[0]?.key ?? null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-2">Map</h1>
          <p className="max-w-4xl text-white/65">
            Edit the map POIs and region rectangles used by the Godot map systems. This tool reads from the active local game root and exports back to the
            original runtime JSON shapes.
          </p>
        </div>
        <Link href="/data/system-map" target="_blank" rel="noreferrer" className="btn">
          Open Fullscreen System Map
        </Link>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="POIs" value={workspace?.pois.length ?? 0} />
        <SummaryCard label="Regions" value={workspace?.regions.length ?? 0} />
        <SummaryCard label="POI Duplicates" value={poiDuplicates.size} />
        <SummaryCard label="Region Duplicates" value={regionDuplicates.size} />
      </div>

      <div className="flex flex-wrap gap-3">
        {(["pois", "regions"] as MapTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${activeTab === tab ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "pois" ? "POIs" : "Regions"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Section title={activeTab === "pois" ? "POI Library" : "Region Library"} description="Create, clone, delete, and select records from the shared workspace.">
          <div className="space-y-2">
            <div className="label">Search</div>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "pois" ? "Search by id, name, or type" : "Search by id or name"} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn justify-center" onClick={addCurrent}>
              New
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={cloneCurrent}>
              Clone
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("current")}>
              Copy Current
            </button>
            <button type="button" className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20" onClick={deleteCurrent}>
              Delete
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy(activeTab)}>
              Copy {activeTab === "pois" ? "poi.json" : "regions.json"}
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => handleDownload(activeTab)}>
              Download {activeTab === "pois" ? "poi.json" : "regions.json"}
            </button>
          </div>

          <div className="space-y-2">
            {(activeTab === "pois" ? filteredPois : filteredRegions).map((entry) => {
              const isActive = activeTab === "pois" ? entry.key === selectedPoiKey : entry.key === selectedRegionKey;
              const duplicateMap = activeTab === "pois" ? poiDuplicates : regionDuplicates;
              const hasDuplicate = duplicateMap.has(entry.id.trim());
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left ${isActive ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                  onClick={() => (activeTab === "pois" ? setSelectedPoiKey(entry.key) : setSelectedRegionKey(entry.key))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{entry.id || "Untitled"}</div>
                      <div className="text-sm text-white/55">{entry.name || "No name yet"}</div>
                    </div>
                    {hasDuplicate ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-100">Duplicate ID</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {activeTab === "pois" && selectedPoi ? (
          <Section title="POI Editor" description="Edit map POI records used by the map service and related world markers.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label">POI ID</div>
                <input className="input" value={selectedPoi.id} onChange={(event) => updatePoi({ ...selectedPoi, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Display Name</div>
                <input className="input" value={selectedPoi.name} onChange={(event) => updatePoi({ ...selectedPoi, name: event.target.value })} />
              </div>
              <div>
                <div className="label">Type</div>
                <input className="input" value={selectedPoi.type} onChange={(event) => updatePoi({ ...selectedPoi, type: event.target.value })} />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Visible On Map</span>
                <input type="checkbox" checked={selectedPoi.map} onChange={(event) => updatePoi({ ...selectedPoi, map: event.target.checked })} />
              </label>
              <div>
                <div className="label">Sector X</div>
                <input className="input" value={selectedPoi.sectorX} onChange={(event) => updatePoi({ ...selectedPoi, sectorX: event.target.value })} />
              </div>
              <div>
                <div className="label">Sector Y</div>
                <input className="input" value={selectedPoi.sectorY} onChange={(event) => updatePoi({ ...selectedPoi, sectorY: event.target.value })} />
              </div>
              <div>
                <div className="label">Position X</div>
                <input className="input" value={selectedPoi.posX} onChange={(event) => updatePoi({ ...selectedPoi, posX: event.target.value })} />
              </div>
              <div>
                <div className="label">Position Y</div>
                <input className="input" value={selectedPoi.posY} onChange={(event) => updatePoi({ ...selectedPoi, posY: event.target.value })} />
              </div>
            </div>

            {poiDuplicates.has(selectedPoi.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This POI ID is duplicated in the current workspace.</div>
            ) : null}

            <JsonTextArea label="Extra JSON" value={selectedPoi.extraJson} onChange={(nextValue) => updatePoi({ ...selectedPoi, extraJson: nextValue })} />
          </Section>
        ) : null}

        {activeTab === "regions" && selectedRegion ? (
          <Section title="Region Editor" description="Edit rectangular region definitions used for map exploration and discovery logic.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label">Region ID</div>
                <input className="input" value={selectedRegion.id} onChange={(event) => updateRegion({ ...selectedRegion, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Display Name</div>
                <input className="input" value={selectedRegion.name} onChange={(event) => updateRegion({ ...selectedRegion, name: event.target.value })} />
              </div>
              <div>
                <div className="label">Rect X</div>
                <input className="input" value={selectedRegion.rectX} onChange={(event) => updateRegion({ ...selectedRegion, rectX: event.target.value })} />
              </div>
              <div>
                <div className="label">Rect Y</div>
                <input className="input" value={selectedRegion.rectY} onChange={(event) => updateRegion({ ...selectedRegion, rectY: event.target.value })} />
              </div>
              <div>
                <div className="label">Rect Width</div>
                <input className="input" value={selectedRegion.rectW} onChange={(event) => updateRegion({ ...selectedRegion, rectW: event.target.value })} />
              </div>
              <div>
                <div className="label">Rect Height</div>
                <input className="input" value={selectedRegion.rectH} onChange={(event) => updateRegion({ ...selectedRegion, rectH: event.target.value })} />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Discovered By Default</span>
                <input type="checkbox" checked={selectedRegion.discovered} onChange={(event) => updateRegion({ ...selectedRegion, discovered: event.target.checked })} />
              </label>
            </div>

            {regionDuplicates.has(selectedRegion.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This region ID is duplicated in the current workspace.</div>
            ) : null}

            <JsonTextArea label="Extra JSON" value={selectedRegion.extraJson} onChange={(nextValue) => updateRegion({ ...selectedRegion, extraJson: nextValue })} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
