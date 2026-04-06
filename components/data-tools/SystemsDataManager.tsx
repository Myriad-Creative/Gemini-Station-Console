"use client";

import { useEffect, useMemo, useState } from "react";
import { duplicateIdMap, insertAfterIndex, removeAtIndex, setAtIndex } from "@lib/data-tools/common";
import {
  cloneHazardBarrierProfile,
  cloneShipStat,
  cloneStage,
  cloneZone,
  copySingleHazardBarrierProfile,
  copySingleShipStat,
  copySingleStage,
  copySingleZone,
  createBlankHazardBarrierProfile,
  createBlankHazardBarrierProfilesWorkspace,
  createBlankShipStat,
  createBlankShipStatsWorkspace,
  createBlankStage,
  createBlankStagesWorkspace,
  createBlankZone,
  createBlankZonesWorkspace,
  importHazardBarrierProfilesWorkspace,
  importShipStatsWorkspace,
  importStagesWorkspace,
  importZonesWorkspace,
  stringifyHazardBarrierProfilesFile,
  stringifyShipStatsFile,
  stringifyStagesFile,
  stringifyZonesFile,
} from "@lib/data-tools/systems";
import type {
  HazardBarrierProfileDraft,
  HazardBarrierProfilesWorkspace,
  ShipStatDescriptionDraft,
  ShipStatDescriptionsWorkspace,
  StageDraft,
  StagesWorkspace,
  ZoneDraft,
  ZonesWorkspace,
} from "@lib/data-tools/types";
import { copyToClipboard, downloadTextFile, JsonTextArea, Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";
type SystemsTab = "shipStats" | "zones" | "stages" | "hazards";

function loadSharedText(kind: string) {
  return fetch(`/api/settings/data/source?kind=${kind}`).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.text) return null;
    return payload.text as string;
  });
}

export default function SystemsDataManager() {
  const [shipStatsWorkspace, setShipStatsWorkspace] = useState<ShipStatDescriptionsWorkspace | null>(null);
  const [zonesWorkspace, setZonesWorkspace] = useState<ZonesWorkspace | null>(null);
  const [stagesWorkspace, setStagesWorkspace] = useState<StagesWorkspace | null>(null);
  const [hazardsWorkspace, setHazardsWorkspace] = useState<HazardBarrierProfilesWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<SystemsTab>("shipStats");
  const [search, setSearch] = useState("");
  const [selectedShipStatKey, setSelectedShipStatKey] = useState<string | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);
  const [selectedHazardKey, setSelectedHazardKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading systems data from the local game root…",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [shipStatsText, zonesText, stagesText, hazardsText] = await Promise.all([
          loadSharedText("shipStatDescriptions"),
          loadSharedText("zones"),
          loadSharedText("stages"),
          loadSharedText("hazardBarrierProfiles"),
        ]);
        if (cancelled) return;
        const nextShipStats = shipStatsText ? importShipStatsWorkspace(shipStatsText, "Local game source") : createBlankShipStatsWorkspace();
        const nextZones = zonesText ? importZonesWorkspace(zonesText, "Local game source") : createBlankZonesWorkspace();
        const nextStages = stagesText ? importStagesWorkspace(stagesText, "Local game source") : createBlankStagesWorkspace();
        const nextHazards = hazardsText ? importHazardBarrierProfilesWorkspace(hazardsText, "Local game source") : createBlankHazardBarrierProfilesWorkspace();
        setShipStatsWorkspace(nextShipStats);
        setZonesWorkspace(nextZones);
        setStagesWorkspace(nextStages);
        setHazardsWorkspace(nextHazards);
        setSelectedShipStatKey(nextShipStats.stats[0]?.key ?? null);
        setSelectedZoneKey(nextZones.zones[0]?.key ?? null);
        setSelectedStageKey(nextStages.stages[0]?.key ?? null);
        setSelectedHazardKey(nextHazards.profiles[0]?.key ?? null);
        setStatus({
          tone: shipStatsText || zonesText || stagesText || hazardsText ? "success" : "neutral",
          message:
            shipStatsText || zonesText || stagesText || hazardsText
              ? "Loaded systems data from the local game root."
              : "No systems data was found under the active local game root. This editor started with blank workspaces.",
        });
      } catch (error) {
        if (cancelled) return;
        setShipStatsWorkspace(createBlankShipStatsWorkspace());
        setZonesWorkspace(createBlankZonesWorkspace());
        setStagesWorkspace(createBlankStagesWorkspace());
        setHazardsWorkspace(createBlankHazardBarrierProfilesWorkspace());
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const shipStatDuplicates = useMemo(() => duplicateIdMap(shipStatsWorkspace?.stats ?? []), [shipStatsWorkspace]);
  const zoneDuplicates = useMemo(() => duplicateIdMap(zonesWorkspace?.zones ?? []), [zonesWorkspace]);
  const stageDuplicates = useMemo(() => duplicateIdMap(stagesWorkspace?.stages ?? []), [stagesWorkspace]);
  const hazardDuplicates = useMemo(() => duplicateIdMap(hazardsWorkspace?.profiles ?? []), [hazardsWorkspace]);

  const filteredShipStats = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (shipStatsWorkspace?.stats ?? []).filter((entry) =>
      query ? [entry.id, entry.label, entry.title].join(" ").toLowerCase().includes(query) : true,
    );
  }, [search, shipStatsWorkspace]);
  const filteredZones = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (zonesWorkspace?.zones ?? []).filter((entry) => (query ? [entry.id, entry.name].join(" ").toLowerCase().includes(query) : true));
  }, [search, zonesWorkspace]);
  const filteredStages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (stagesWorkspace?.stages ?? []).filter((entry) => (query ? [entry.id, entry.shape].join(" ").toLowerCase().includes(query) : true));
  }, [search, stagesWorkspace]);
  const filteredHazards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (hazardsWorkspace?.profiles ?? []).filter((entry) =>
      query ? [entry.id, entry.baseStageProfile].join(" ").toLowerCase().includes(query) : true,
    );
  }, [hazardsWorkspace, search]);

  useEffect(() => {
    if (shipStatsWorkspace?.stats.length && (!selectedShipStatKey || !shipStatsWorkspace.stats.some((entry) => entry.key === selectedShipStatKey))) {
      setSelectedShipStatKey(shipStatsWorkspace.stats[0].key);
    }
    if (zonesWorkspace?.zones.length && (!selectedZoneKey || !zonesWorkspace.zones.some((entry) => entry.key === selectedZoneKey))) {
      setSelectedZoneKey(zonesWorkspace.zones[0].key);
    }
    if (stagesWorkspace?.stages.length && (!selectedStageKey || !stagesWorkspace.stages.some((entry) => entry.key === selectedStageKey))) {
      setSelectedStageKey(stagesWorkspace.stages[0].key);
    }
    if (hazardsWorkspace?.profiles.length && (!selectedHazardKey || !hazardsWorkspace.profiles.some((entry) => entry.key === selectedHazardKey))) {
      setSelectedHazardKey(hazardsWorkspace.profiles[0].key);
    }
  }, [hazardsWorkspace, selectedHazardKey, selectedShipStatKey, selectedStageKey, selectedZoneKey, shipStatsWorkspace, stagesWorkspace, zonesWorkspace]);

  const selectedShipStat = shipStatsWorkspace?.stats.find((entry) => entry.key === selectedShipStatKey) ?? filteredShipStats[0] ?? null;
  const selectedZone = zonesWorkspace?.zones.find((entry) => entry.key === selectedZoneKey) ?? filteredZones[0] ?? null;
  const selectedStage = stagesWorkspace?.stages.find((entry) => entry.key === selectedStageKey) ?? filteredStages[0] ?? null;
  const selectedHazard = hazardsWorkspace?.profiles.find((entry) => entry.key === selectedHazardKey) ?? filteredHazards[0] ?? null;

  function updateShipStat(nextValue: ShipStatDescriptionDraft) {
    if (!shipStatsWorkspace || !selectedShipStat) return;
    const index = shipStatsWorkspace.stats.findIndex((entry) => entry.key === selectedShipStat.key);
    if (index < 0) return;
    setShipStatsWorkspace({ ...shipStatsWorkspace, stats: setAtIndex(shipStatsWorkspace.stats, index, nextValue) });
  }

  function updateZone(nextValue: ZoneDraft) {
    if (!zonesWorkspace || !selectedZone) return;
    const index = zonesWorkspace.zones.findIndex((entry) => entry.key === selectedZone.key);
    if (index < 0) return;
    setZonesWorkspace({ ...zonesWorkspace, zones: setAtIndex(zonesWorkspace.zones, index, nextValue) });
  }

  function updateStage(nextValue: StageDraft) {
    if (!stagesWorkspace || !selectedStage) return;
    const index = stagesWorkspace.stages.findIndex((entry) => entry.key === selectedStage.key);
    if (index < 0) return;
    setStagesWorkspace({ ...stagesWorkspace, stages: setAtIndex(stagesWorkspace.stages, index, nextValue) });
  }

  function updateHazard(nextValue: HazardBarrierProfileDraft) {
    if (!hazardsWorkspace || !selectedHazard) return;
    const index = hazardsWorkspace.profiles.findIndex((entry) => entry.key === selectedHazard.key);
    if (index < 0) return;
    setHazardsWorkspace({ ...hazardsWorkspace, profiles: setAtIndex(hazardsWorkspace.profiles, index, nextValue) });
  }

  async function handleCopy(kind: "full" | "current") {
    let value = "";
    if (kind === "full") {
      value =
        activeTab === "shipStats"
          ? shipStatsWorkspace
            ? stringifyShipStatsFile(shipStatsWorkspace)
            : ""
          : activeTab === "zones"
            ? zonesWorkspace
              ? stringifyZonesFile(zonesWorkspace)
              : ""
            : activeTab === "stages"
              ? stagesWorkspace
                ? stringifyStagesFile(stagesWorkspace)
                : ""
              : hazardsWorkspace
                ? stringifyHazardBarrierProfilesFile(hazardsWorkspace)
                : "";
    } else {
      value =
        activeTab === "shipStats"
          ? selectedShipStat
            ? copySingleShipStat(selectedShipStat)
            : ""
          : activeTab === "zones"
            ? selectedZone
              ? copySingleZone(selectedZone)
              : ""
            : activeTab === "stages"
              ? selectedStage
                ? copySingleStage(selectedStage)
                : ""
              : selectedHazard
                ? copySingleHazardBarrierProfile(selectedHazard)
                : "";
    }
    if (!value) return;
    await copyToClipboard(value);
    setStatus({
      tone: "success",
      message:
        kind === "current"
          ? "Copied the current systems record JSON."
          : `Copied ${
              activeTab === "shipStats"
                ? "ShipStatDescriptions.json"
                : activeTab === "zones"
                  ? "Zones.json"
                  : activeTab === "stages"
                    ? "Stages.json"
                    : "HazardBarrierProfiles.json"
            } to the clipboard.`,
    });
  }

  function handleDownload() {
    const filename =
      activeTab === "shipStats"
        ? "ShipStatDescriptions.json"
        : activeTab === "zones"
          ? "Zones.json"
          : activeTab === "stages"
            ? "Stages.json"
            : "HazardBarrierProfiles.json";
    const contents =
      activeTab === "shipStats"
        ? shipStatsWorkspace
          ? stringifyShipStatsFile(shipStatsWorkspace)
          : ""
        : activeTab === "zones"
          ? zonesWorkspace
            ? stringifyZonesFile(zonesWorkspace)
            : ""
          : activeTab === "stages"
            ? stagesWorkspace
              ? stringifyStagesFile(stagesWorkspace)
              : ""
            : hazardsWorkspace
              ? stringifyHazardBarrierProfilesFile(hazardsWorkspace)
              : "";
    if (!contents) return;
    downloadTextFile(filename, contents);
    setStatus({ tone: "success", message: `Downloaded ${filename}.` });
  }

  function addCurrent() {
    if (activeTab === "shipStats" && shipStatsWorkspace) {
      const next = createBlankShipStat(shipStatsWorkspace.stats.map((entry) => entry.id));
      const index = selectedShipStat ? shipStatsWorkspace.stats.findIndex((entry) => entry.key === selectedShipStat.key) : null;
      setShipStatsWorkspace({ ...shipStatsWorkspace, stats: insertAfterIndex(shipStatsWorkspace.stats, index, next) });
      setSelectedShipStatKey(next.key);
      return;
    }
    if (activeTab === "zones" && zonesWorkspace) {
      const next = createBlankZone(zonesWorkspace.zones.map((entry) => entry.id));
      const index = selectedZone ? zonesWorkspace.zones.findIndex((entry) => entry.key === selectedZone.key) : null;
      setZonesWorkspace({ ...zonesWorkspace, zones: insertAfterIndex(zonesWorkspace.zones, index, next) });
      setSelectedZoneKey(next.key);
      return;
    }
    if (activeTab === "stages" && stagesWorkspace) {
      const next = createBlankStage(stagesWorkspace.stages.map((entry) => entry.id));
      const index = selectedStage ? stagesWorkspace.stages.findIndex((entry) => entry.key === selectedStage.key) : null;
      setStagesWorkspace({ ...stagesWorkspace, stages: insertAfterIndex(stagesWorkspace.stages, index, next) });
      setSelectedStageKey(next.key);
      return;
    }
    if (activeTab === "hazards" && hazardsWorkspace) {
      const next = createBlankHazardBarrierProfile(hazardsWorkspace.profiles.map((entry) => entry.id));
      const index = selectedHazard ? hazardsWorkspace.profiles.findIndex((entry) => entry.key === selectedHazard.key) : null;
      setHazardsWorkspace({ ...hazardsWorkspace, profiles: insertAfterIndex(hazardsWorkspace.profiles, index, next) });
      setSelectedHazardKey(next.key);
    }
  }

  function cloneCurrent() {
    if (activeTab === "shipStats" && shipStatsWorkspace && selectedShipStat) {
      const next = cloneShipStat(selectedShipStat, shipStatsWorkspace.stats.map((entry) => entry.id));
      const index = shipStatsWorkspace.stats.findIndex((entry) => entry.key === selectedShipStat.key);
      setShipStatsWorkspace({ ...shipStatsWorkspace, stats: insertAfterIndex(shipStatsWorkspace.stats, index, next) });
      setSelectedShipStatKey(next.key);
      return;
    }
    if (activeTab === "zones" && zonesWorkspace && selectedZone) {
      const next = cloneZone(selectedZone, zonesWorkspace.zones.map((entry) => entry.id));
      const index = zonesWorkspace.zones.findIndex((entry) => entry.key === selectedZone.key);
      setZonesWorkspace({ ...zonesWorkspace, zones: insertAfterIndex(zonesWorkspace.zones, index, next) });
      setSelectedZoneKey(next.key);
      return;
    }
    if (activeTab === "stages" && stagesWorkspace && selectedStage) {
      const next = cloneStage(selectedStage, stagesWorkspace.stages.map((entry) => entry.id));
      const index = stagesWorkspace.stages.findIndex((entry) => entry.key === selectedStage.key);
      setStagesWorkspace({ ...stagesWorkspace, stages: insertAfterIndex(stagesWorkspace.stages, index, next) });
      setSelectedStageKey(next.key);
      return;
    }
    if (activeTab === "hazards" && hazardsWorkspace && selectedHazard) {
      const next = cloneHazardBarrierProfile(selectedHazard, hazardsWorkspace.profiles.map((entry) => entry.id));
      const index = hazardsWorkspace.profiles.findIndex((entry) => entry.key === selectedHazard.key);
      setHazardsWorkspace({ ...hazardsWorkspace, profiles: insertAfterIndex(hazardsWorkspace.profiles, index, next) });
      setSelectedHazardKey(next.key);
    }
  }

  function deleteCurrent() {
    if (activeTab === "shipStats" && shipStatsWorkspace && selectedShipStat) {
      const index = shipStatsWorkspace.stats.findIndex((entry) => entry.key === selectedShipStat.key);
      const next = removeAtIndex(shipStatsWorkspace.stats, index);
      const fallback = next.length ? next : [createBlankShipStat()];
      setShipStatsWorkspace({ ...shipStatsWorkspace, stats: fallback });
      setSelectedShipStatKey(fallback[0]?.key ?? null);
      return;
    }
    if (activeTab === "zones" && zonesWorkspace && selectedZone) {
      const index = zonesWorkspace.zones.findIndex((entry) => entry.key === selectedZone.key);
      const next = removeAtIndex(zonesWorkspace.zones, index);
      const fallback = next.length ? next : [createBlankZone()];
      setZonesWorkspace({ ...zonesWorkspace, zones: fallback });
      setSelectedZoneKey(fallback[0]?.key ?? null);
      return;
    }
    if (activeTab === "stages" && stagesWorkspace && selectedStage) {
      const index = stagesWorkspace.stages.findIndex((entry) => entry.key === selectedStage.key);
      const next = removeAtIndex(stagesWorkspace.stages, index);
      const fallback = next.length ? next : [createBlankStage()];
      setStagesWorkspace({ ...stagesWorkspace, stages: fallback });
      setSelectedStageKey(fallback[0]?.key ?? null);
      return;
    }
    if (activeTab === "hazards" && hazardsWorkspace && selectedHazard) {
      const index = hazardsWorkspace.profiles.findIndex((entry) => entry.key === selectedHazard.key);
      const next = removeAtIndex(hazardsWorkspace.profiles, index);
      const fallback = next.length ? next : [createBlankHazardBarrierProfile()];
      setHazardsWorkspace({ ...hazardsWorkspace, profiles: fallback });
      setSelectedHazardKey(fallback[0]?.key ?? null);
    }
  }

  const list = activeTab === "shipStats" ? filteredShipStats : activeTab === "zones" ? filteredZones : activeTab === "stages" ? filteredStages : filteredHazards;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Systems</h1>
        <p className="max-w-4xl text-white/65">
          Edit shared runtime systems data including ship stat descriptions, zones, stages, and hazard barrier profiles.
        </p>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Ship Stats" value={shipStatsWorkspace?.stats.length ?? 0} />
        <SummaryCard label="Zones" value={zonesWorkspace?.zones.length ?? 0} />
        <SummaryCard label="Stages" value={stagesWorkspace?.stages.length ?? 0} />
        <SummaryCard label="Hazard Profiles" value={hazardsWorkspace?.profiles.length ?? 0} />
      </div>

      <div className="flex flex-wrap gap-3">
        {([
          ["shipStats", "Ship Stat Descriptions"],
          ["zones", "Zones"],
          ["stages", "Stages"],
          ["hazards", "Hazard Barriers"],
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

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Section title="Record Library" description="Search, create, clone, delete, and export records for the active systems dataset.">
          <div className="space-y-2">
            <div className="label">Search</div>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the active dataset" />
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
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("full")}>
              Copy Full JSON
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={handleDownload}>
              Download JSON
            </button>
          </div>

          <div className="space-y-2">
            {list.map((entry) => {
              const key = entry.key;
              const active =
                activeTab === "shipStats"
                  ? key === selectedShipStatKey
                  : activeTab === "zones"
                    ? key === selectedZoneKey
                    : activeTab === "stages"
                      ? key === selectedStageKey
                      : key === selectedHazardKey;
              const duplicateMap =
                activeTab === "shipStats"
                  ? shipStatDuplicates
                  : activeTab === "zones"
                    ? zoneDuplicates
                    : activeTab === "stages"
                      ? stageDuplicates
                      : hazardDuplicates;
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left ${active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                  onClick={() =>
                    activeTab === "shipStats"
                      ? setSelectedShipStatKey(key)
                      : activeTab === "zones"
                        ? setSelectedZoneKey(key)
                        : activeTab === "stages"
                          ? setSelectedStageKey(key)
                          : setSelectedHazardKey(key)
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{entry.id || "Untitled"}</div>
                      <div className="text-sm text-white/55">
                        {"title" in entry
                          ? entry.title || entry.label || "No title yet"
                          : "name" in entry
                            ? entry.name || "No name yet"
                            : "shape" in entry
                              ? entry.shape || "No shape yet"
                              : entry.baseStageProfile || "No base stage profile"}
                      </div>
                    </div>
                    {duplicateMap.has(entry.id.trim()) ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-100">Duplicate ID</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {activeTab === "shipStats" && selectedShipStat ? (
          <Section title="Ship Stat Description Editor" description="Edit the UI-facing stat description records consumed by the ship stats popup.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label">Stat ID</div>
                <input className="input" value={selectedShipStat.id} onChange={(event) => updateShipStat({ ...selectedShipStat, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Label</div>
                <input className="input" value={selectedShipStat.label} onChange={(event) => updateShipStat({ ...selectedShipStat, label: event.target.value })} />
              </div>
              <div>
                <div className="label">Title</div>
                <input className="input" value={selectedShipStat.title} onChange={(event) => updateShipStat({ ...selectedShipStat, title: event.target.value })} />
              </div>
              <div>
                <div className="label">Decimals</div>
                <input className="input" value={selectedShipStat.decimals} onChange={(event) => updateShipStat({ ...selectedShipStat, decimals: event.target.value })} />
              </div>
            </div>
            {shipStatDuplicates.has(selectedShipStat.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This stat ID is duplicated in the current workspace.</div>
            ) : null}
            <div className="space-y-2">
              <div className="label">Description</div>
              <textarea className="input min-h-[200px]" value={selectedShipStat.description} onChange={(event) => updateShipStat({ ...selectedShipStat, description: event.target.value })} />
            </div>
            <JsonTextArea label="Extra JSON" value={selectedShipStat.extraJson} onChange={(nextValue) => updateShipStat({ ...selectedShipStat, extraJson: nextValue })} />
          </Section>
        ) : null}

        {activeTab === "zones" && selectedZone ? (
          <Section title="Zone Editor" description="Edit zone activation, bounds, stage placement, and mob spawn definitions.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <div className="label">Zone ID</div>
                <input className="input" value={selectedZone.id} onChange={(event) => updateZone({ ...selectedZone, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Name</div>
                <input className="input" value={selectedZone.name} onChange={(event) => updateZone({ ...selectedZone, name: event.target.value })} />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Active</span>
                <input type="checkbox" checked={selectedZone.active} onChange={(event) => updateZone({ ...selectedZone, active: event.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Show HUD On Enter</span>
                <input type="checkbox" checked={selectedZone.showHudOnEnter} onChange={(event) => updateZone({ ...selectedZone, showHudOnEnter: event.target.checked })} />
              </label>
              <div>
                <div className="label">Sector X</div>
                <input className="input" value={selectedZone.sectorX} onChange={(event) => updateZone({ ...selectedZone, sectorX: event.target.value })} />
              </div>
              <div>
                <div className="label">Sector Y</div>
                <input className="input" value={selectedZone.sectorY} onChange={(event) => updateZone({ ...selectedZone, sectorY: event.target.value })} />
              </div>
              <div>
                <div className="label">Activation Radius</div>
                <input className="input" value={selectedZone.activationRadius} onChange={(event) => updateZone({ ...selectedZone, activationRadius: event.target.value })} />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Activation Radius Border</span>
                <input type="checkbox" checked={selectedZone.activationRadiusBorder} onChange={(event) => updateZone({ ...selectedZone, activationRadiusBorder: event.target.checked })} />
              </label>
              <div>
                <div className="label">Position X</div>
                <input className="input" value={selectedZone.posX} onChange={(event) => updateZone({ ...selectedZone, posX: event.target.value })} />
              </div>
              <div>
                <div className="label">Position Y</div>
                <input className="input" value={selectedZone.posY} onChange={(event) => updateZone({ ...selectedZone, posY: event.target.value })} />
              </div>
            </div>
            {zoneDuplicates.has(selectedZone.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This zone ID is duplicated in the current workspace.</div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-3">
              <JsonTextArea label="Bounds JSON" value={selectedZone.boundsJson} onChange={(nextValue) => updateZone({ ...selectedZone, boundsJson: nextValue })} />
              <JsonTextArea label="Stages JSON" value={selectedZone.stagesJson} onChange={(nextValue) => updateZone({ ...selectedZone, stagesJson: nextValue })} />
              <JsonTextArea label="Mobs JSON" value={selectedZone.mobsJson} onChange={(nextValue) => updateZone({ ...selectedZone, mobsJson: nextValue })} />
            </div>
            <JsonTextArea label="Extra JSON" value={selectedZone.extraJson} onChange={(nextValue) => updateZone({ ...selectedZone, extraJson: nextValue })} />
          </Section>
        ) : null}

        {activeTab === "stages" && selectedStage ? (
          <Section title="Stage Editor" description="Edit stage geometry, material pools, and extra rendering properties.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <div className="label">Stage ID</div>
                <input className="input" value={selectedStage.id} onChange={(event) => updateStage({ ...selectedStage, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Shape</div>
                <input className="input" value={selectedStage.shape} onChange={(event) => updateStage({ ...selectedStage, shape: event.target.value })} />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                <span>Collision</span>
                <input type="checkbox" checked={selectedStage.collision} onChange={(event) => updateStage({ ...selectedStage, collision: event.target.checked })} />
              </label>
              <div>
                <div className="label">Width</div>
                <input className="input" value={selectedStage.width} onChange={(event) => updateStage({ ...selectedStage, width: event.target.value })} />
              </div>
              <div>
                <div className="label">Height</div>
                <input className="input" value={selectedStage.height} onChange={(event) => updateStage({ ...selectedStage, height: event.target.value })} />
              </div>
              <div>
                <div className="label">Edge Falloff</div>
                <input className="input" value={selectedStage.edgeFalloff} onChange={(event) => updateStage({ ...selectedStage, edgeFalloff: event.target.value })} />
              </div>
              <div>
                <div className="label">Z Index</div>
                <input className="input" value={selectedStage.zindex} onChange={(event) => updateStage({ ...selectedStage, zindex: event.target.value })} />
              </div>
              <div>
                <div className="label">Scale Min</div>
                <input className="input" value={selectedStage.scaleMin} onChange={(event) => updateStage({ ...selectedStage, scaleMin: event.target.value })} />
              </div>
              <div>
                <div className="label">Scale Max</div>
                <input className="input" value={selectedStage.scaleMax} onChange={(event) => updateStage({ ...selectedStage, scaleMax: event.target.value })} />
              </div>
              <div>
                <div className="label">Grid Step</div>
                <input className="input" value={selectedStage.gridStep} onChange={(event) => updateStage({ ...selectedStage, gridStep: event.target.value })} />
              </div>
              <div>
                <div className="label">Jitter</div>
                <input className="input" value={selectedStage.jitter} onChange={(event) => updateStage({ ...selectedStage, jitter: event.target.value })} />
              </div>
            </div>
            {stageDuplicates.has(selectedStage.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This stage ID is duplicated in the current workspace.</div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <JsonTextArea label="Materials JSON" value={selectedStage.materialsJson} onChange={(nextValue) => updateStage({ ...selectedStage, materialsJson: nextValue })} />
              <JsonTextArea label="Extra JSON" value={selectedStage.extraJson} onChange={(nextValue) => updateStage({ ...selectedStage, extraJson: nextValue })} />
            </div>
          </Section>
        ) : null}

        {activeTab === "hazards" && selectedHazard ? (
          <Section title="Hazard Barrier Profile Editor" description="Edit hazard barrier tuning linked to a base stage profile and status effect.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <div className="label">Profile ID</div>
                <input className="input" value={selectedHazard.id} onChange={(event) => updateHazard({ ...selectedHazard, id: event.target.value })} />
              </div>
              <div>
                <div className="label">Base Stage Profile</div>
                <input className="input" value={selectedHazard.baseStageProfile} onChange={(event) => updateHazard({ ...selectedHazard, baseStageProfile: event.target.value })} />
              </div>
              <div>
                <div className="label">Status Effect ID</div>
                <input className="input" value={selectedHazard.statusEffectId} onChange={(event) => updateHazard({ ...selectedHazard, statusEffectId: event.target.value })} />
              </div>
              <div>
                <div className="label">Blocker Width Ratio</div>
                <input className="input" value={selectedHazard.blockerWidthRatio} onChange={(event) => updateHazard({ ...selectedHazard, blockerWidthRatio: event.target.value })} />
              </div>
              <div>
                <div className="label">Visual Width Multiplier</div>
                <input className="input" value={selectedHazard.visualWidthMultiplier} onChange={(event) => updateHazard({ ...selectedHazard, visualWidthMultiplier: event.target.value })} />
              </div>
              <div>
                <div className="label">Visual Density Multiplier</div>
                <input className="input" value={selectedHazard.visualDensityMultiplier} onChange={(event) => updateHazard({ ...selectedHazard, visualDensityMultiplier: event.target.value })} />
              </div>
              <div>
                <div className="label">Visual Scale Multiplier</div>
                <input className="input" value={selectedHazard.visualScaleMultiplier} onChange={(event) => updateHazard({ ...selectedHazard, visualScaleMultiplier: event.target.value })} />
              </div>
              <div>
                <div className="label">Visual Alpha Multiplier</div>
                <input className="input" value={selectedHazard.visualAlphaMultiplier} onChange={(event) => updateHazard({ ...selectedHazard, visualAlphaMultiplier: event.target.value })} />
              </div>
              <div>
                <div className="label">Z Index</div>
                <input className="input" value={selectedHazard.zindex} onChange={(event) => updateHazard({ ...selectedHazard, zindex: event.target.value })} />
              </div>
            </div>
            {hazardDuplicates.has(selectedHazard.id.trim()) ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This hazard barrier profile ID is duplicated in the current workspace.</div>
            ) : null}
            <JsonTextArea label="Extra JSON" value={selectedHazard.extraJson} onChange={(nextValue) => updateHazard({ ...selectedHazard, extraJson: nextValue })} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
