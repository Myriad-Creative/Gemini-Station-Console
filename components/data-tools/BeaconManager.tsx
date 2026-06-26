"use client";

import { useEffect, useMemo, useState } from "react";
import { createDraftKey } from "@lib/data-tools/common";
import type { BeaconDraft, BeaconScanTierDraft, BeaconWorkspace } from "@lib/beacon-manager/types";
import {
  createBlankBeacon,
  createBlankBeaconWorkspace,
  duplicateBeaconDraft,
  importBeaconWorkspace,
  stringifyBeaconWorkspace,
  validateBeaconDrafts,
  workspaceToBeaconFile,
} from "@lib/beacon-manager/utils";
import { Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";

function linesFromArray(values: string[]) {
  return values.join("\n");
}

function arrayFromLines(value: string) {
  return Array.from(new Set(value.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean)));
}

function updateAt<T>(items: T[], index: number, updater: (item: T) => T) {
  return items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="label mb-1 block">{children}</span>;
}

function LinesField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <textarea className="input min-h-[96px] font-mono text-sm" value={linesFromArray(value)} placeholder={placeholder} onChange={(event) => onChange(arrayFromLines(event.target.value))} />
    </label>
  );
}

function beaconSearchText(beacon: BeaconDraft) {
  return [
    beacon.id,
    beacon.title,
    beacon.displayName,
    beacon.faction,
    beacon.beaconClass,
    beacon.tags.join(" "),
    beacon.missionsAvailable.join(" "),
    beacon.grantMissionIdsOnScan.join(" "),
    beacon.scanNotes,
    beacon.scanTiers.map((tier) => `${tier.level} ${tier.text}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export default function BeaconManager() {
  const [workspace, setWorkspace] = useState<BeaconWorkspace | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading beacons.json from the local game root...",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/settings/data/source?kind=beacons", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !payload?.ok || typeof payload.text !== "string") {
          const blank = createBlankBeaconWorkspace();
          setWorkspace(blank);
          setSelectedKey(null);
          setStatus({ tone: "neutral", message: payload?.error || "No beacons.json was found. This page started with a blank beacon workspace." });
          return;
        }
        const nextWorkspace = importBeaconWorkspace(payload.text, payload.sourceLabel || "Local game source");
        setWorkspace(nextWorkspace);
        setSelectedKey(nextWorkspace.beacons[0]?.key ?? null);
        const parseSuffix = nextWorkspace.parseWarnings.length ? ` ${nextWorkspace.parseWarnings.length} parse warning${nextWorkspace.parseWarnings.length === 1 ? "" : "s"} were preserved for review.` : "";
        setStatus({ tone: "success", message: `Loaded ${nextWorkspace.beacons.length} beacon${nextWorkspace.beacons.length === 1 ? "" : "s"} from ${nextWorkspace.sourceLabel}.${parseSuffix}` });
      } catch (error) {
        if (cancelled) return;
        setWorkspace(createBlankBeaconWorkspace());
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBeacons = useMemo(() => {
    const query = search.trim().toLowerCase();
    const beacons = workspace?.beacons ?? [];
    return beacons
      .filter((beacon) => (query ? beaconSearchText(beacon).includes(query) : true))
      .sort((a, b) => (a.displayName || a.title || a.id).localeCompare(b.displayName || b.title || b.id));
  }, [search, workspace]);
  const selectedBeacon = workspace?.beacons.find((beacon) => beacon.key === selectedKey) ?? filteredBeacons[0] ?? null;
  const validationIssues = validateBeaconDrafts(workspace);
  const validationErrors = validationIssues.filter((issue) => issue.level === "error");
  const missionLinkedCount = workspace?.beacons.filter((beacon) => beacon.missionsAvailable.length || beacon.grantMissionIdsOnScan.length).length ?? 0;
  const tierCount = workspace?.beacons.reduce((sum, beacon) => sum + beacon.scanTiers.length, 0) ?? 0;

  function updateWorkspace(updater: (current: BeaconWorkspace) => BeaconWorkspace) {
    setWorkspace((current) => (current ? updater(current) : current));
  }

  function updateSelectedBeacon(updater: (beacon: BeaconDraft) => BeaconDraft) {
    if (!selectedBeacon) return;
    updateWorkspace((current) => ({
      ...current,
      beacons: current.beacons.map((beacon) => (beacon.key === selectedBeacon.key ? updater(beacon) : beacon)),
    }));
  }

  function addBeacon() {
    updateWorkspace((current) => {
      const nextBeacon = createBlankBeacon(current.beacons.map((beacon) => beacon.id));
      setSelectedKey(nextBeacon.key);
      return {
        ...current,
        beacons: [...current.beacons, nextBeacon],
      };
    });
  }

  function duplicateSelectedBeacon() {
    if (!selectedBeacon) return;
    updateWorkspace((current) => {
      const nextBeacon = duplicateBeaconDraft(selectedBeacon, current.beacons.map((beacon) => beacon.id));
      setSelectedKey(nextBeacon.key);
      return {
        ...current,
        beacons: [...current.beacons, nextBeacon],
      };
    });
  }

  function deleteSelectedBeacon() {
    if (!selectedBeacon) return;
    updateWorkspace((current) => {
      const nextBeacons = current.beacons.filter((beacon) => beacon.key !== selectedBeacon.key);
      setSelectedKey(nextBeacons[0]?.key ?? null);
      return {
        ...current,
        beacons: nextBeacons,
      };
    });
  }

  function updateTier(index: number, updater: (tier: BeaconScanTierDraft) => BeaconScanTierDraft) {
    updateSelectedBeacon((beacon) => ({
      ...beacon,
      scanTiers: updateAt(beacon.scanTiers, index, updater),
    }));
  }

  function addTier() {
    updateSelectedBeacon((beacon) => ({
      ...beacon,
      scanTiers: [
        ...beacon.scanTiers,
        {
          key: createDraftKey("beacon-tier"),
          level: "",
          text: "",
        },
      ],
    }));
  }

  function removeTier(index: number) {
    updateSelectedBeacon((beacon) => ({
      ...beacon,
      scanTiers: beacon.scanTiers.filter((_, tierIndex) => tierIndex !== index),
    }));
  }

  async function saveToGameFolder() {
    if (!workspace) return;
    const errors = validateBeaconDrafts(workspace).filter((issue) => issue.level === "error");
    if (errors.length) {
      setStatus({ tone: "error", message: errors.map((issue) => issue.message).join(" ") });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/beacons/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save beacons.json.");
      setStatus({ tone: "success", message: `Saved ${payload.savedCount ?? workspace.beacons.length} beacon${(payload.savedCount ?? workspace.beacons.length) === 1 ? "" : "s"} to the game folder.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  const previewJson = useMemo(() => {
    if (!workspace) return "";
    try {
      return stringifyBeaconWorkspace(workspace);
    } catch (error) {
      return `Preview unavailable until JSON errors are fixed.\n\n${error instanceof Error ? error.message : String(error)}`;
    }
  }, [workspace]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-2">Navigation Beacons</h1>
          <p className="max-w-4xl text-white/65">
            Manage beacon scan lore, mission grants, tags, XP, and scan tier text from the active Gemini Station game root.
          </p>
        </div>
        <button type="button" className="btn-save-build" onClick={saveToGameFolder} disabled={saving || validationErrors.length > 0 || !workspace}>
          {saving ? "Saving..." : "Save Changes to Build"}
        </button>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Beacons" value={workspace?.beacons.length ?? 0} />
        <SummaryCard label="Quest Linked" value={missionLinkedCount} />
        <SummaryCard label="Scan Tiers" value={tierCount} />
        <SummaryCard label="Issues" value={validationIssues.length} />
      </div>

      {validationIssues.length ? (
        <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">
          <div className="font-semibold">Validation</div>
          <ul className="mt-2 space-y-1">
            {validationIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.field}-${issue.message}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Section title="Beacon Browser" description="Search by ID, display name, faction, class, tags, mission IDs, or scan text.">
          <input className="input" value={search} placeholder="Search beacons..." onChange={(event) => setSearch(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={addBeacon}>
              New Beacon
            </button>
            <button type="button" className="btn" onClick={duplicateSelectedBeacon} disabled={!selectedBeacon}>
              Duplicate
            </button>
            <button type="button" className="rounded border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-400/15 disabled:cursor-default disabled:opacity-40" onClick={deleteSelectedBeacon} disabled={!selectedBeacon}>
              Delete
            </button>
          </div>
          <div className="max-h-[calc(100vh-380px)] min-h-[360px] space-y-2 overflow-auto pr-1">
            {filteredBeacons.map((beacon) => {
              const selected = beacon.key === selectedBeacon?.key;
              return (
                <button
                  key={beacon.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/55 bg-cyan-300/12" : "border-white/10 bg-white/[0.03] hover:bg-white/10"}`}
                  onClick={() => setSelectedKey(beacon.key)}
                >
                  <div className="font-semibold text-white">{beacon.displayName || beacon.title || beacon.id}</div>
                  <div className="mt-1 truncate font-mono text-xs text-white/45">{beacon.id}</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    <span className="rounded bg-white/5 px-2 py-0.5 text-white/55">{beacon.faction || "No faction"}</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-white/55">{beacon.beaconClass || "No class"}</span>
                    {beacon.grantMissionIdsOnScan.length ? <span className="rounded bg-emerald-300/10 px-2 py-0.5 text-emerald-100">Quest giver</span> : null}
                  </div>
                </button>
              );
            })}
            {!filteredBeacons.length ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-sm text-white/45">No beacons match the current search.</div> : null}
          </div>
        </Section>

        {selectedBeacon ? (
          <div className="space-y-5">
            <Section title="Identity" description="The ID is what beacon mobs reference through beacon_id and what scan logic uses to resolve lore.">
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <FieldLabel>Beacon ID</FieldLabel>
                  <input className="input font-mono" value={selectedBeacon.id} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, id: event.target.value.trim() }))} />
                </label>
                <label>
                  <FieldLabel>XP</FieldLabel>
                  <input className="input" type="number" min="0" value={selectedBeacon.xp} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, xp: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Title</FieldLabel>
                  <input className="input" value={selectedBeacon.title} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, title: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Display Name</FieldLabel>
                  <input className="input" value={selectedBeacon.displayName} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, displayName: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Faction</FieldLabel>
                  <input className="input" value={selectedBeacon.faction} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, faction: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Class</FieldLabel>
                  <input className="input" value={selectedBeacon.beaconClass} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, beaconClass: event.target.value }))} />
                </label>
              </div>
              <LinesField label="Tags" value={selectedBeacon.tags} placeholder="navigation_beacon&#10;beacon&#10;scannable" onChange={(tags) => updateSelectedBeacon((beacon) => ({ ...beacon, tags }))} />
            </Section>

            <Section title="Quest Hooks" description="Beacons can expose or grant mission IDs when scanned. These fields are saved as arrays in beacons.json.">
              <div className="grid gap-4 md:grid-cols-2">
                <LinesField label="Missions Available" value={selectedBeacon.missionsAvailable} placeholder="mission.some_mission_id" onChange={(missionsAvailable) => updateSelectedBeacon((beacon) => ({ ...beacon, missionsAvailable }))} />
                <LinesField label="Grant Mission IDs On Scan" value={selectedBeacon.grantMissionIdsOnScan} placeholder="mission.some_mission_id" onChange={(grantMissionIdsOnScan) => updateSelectedBeacon((beacon) => ({ ...beacon, grantMissionIdsOnScan }))} />
              </div>
            </Section>

            <Section title="Scan Results" description="These fields feed the scanner panel and tiered lore text after the player scans the beacon.">
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <FieldLabel>Scan Faction</FieldLabel>
                  <input className="input" value={selectedBeacon.scanFaction} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, scanFaction: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Scan Class</FieldLabel>
                  <input className="input" value={selectedBeacon.scanClass} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, scanClass: event.target.value }))} />
                </label>
              </div>
              <label>
                <FieldLabel>Scan Notes</FieldLabel>
                <textarea className="input min-h-[180px]" value={selectedBeacon.scanNotes} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, scanNotes: event.target.value }))} />
              </label>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">Tier Text</div>
                    <div className="text-sm text-white/50">Use the scan tier key from the game data, such as 4 or 10.</div>
                  </div>
                  <button type="button" className="btn" onClick={addTier}>
                    Add Tier
                  </button>
                </div>
                <div className="space-y-3">
                  {selectedBeacon.scanTiers.map((tier, index) => (
                    <div key={tier.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_auto]">
                        <label>
                          <FieldLabel>Tier</FieldLabel>
                          <input className="input" value={tier.level} onChange={(event) => updateTier(index, (current) => ({ ...current, level: event.target.value }))} />
                        </label>
                        <label>
                          <FieldLabel>Text</FieldLabel>
                          <textarea className="input min-h-[96px]" value={tier.text} onChange={(event) => updateTier(index, (current) => ({ ...current, text: event.target.value }))} />
                        </label>
                        <button type="button" className="self-end rounded border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm text-red-100 hover:bg-red-400/15" onClick={() => removeTier(index)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!selectedBeacon.scanTiers.length ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No tier text yet.</div> : null}
                </div>
              </div>
            </Section>

            <Section title="Extra JSON" description="Unknown beacon and scan fields are preserved here so saves do not strip future game data.">
              <div className="grid gap-4 lg:grid-cols-2">
                <label>
                  <FieldLabel>Beacon Extra JSON</FieldLabel>
                  <textarea className="input min-h-[180px] font-mono text-sm" value={selectedBeacon.extraJson} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, extraJson: event.target.value }))} />
                </label>
                <label>
                  <FieldLabel>Scan Extra JSON</FieldLabel>
                  <textarea className="input min-h-[180px] font-mono text-sm" value={selectedBeacon.scanExtraJson} onChange={(event) => updateSelectedBeacon((beacon) => ({ ...beacon, scanExtraJson: event.target.value }))} />
                </label>
              </div>
            </Section>
          </div>
        ) : (
          <Section title="No Beacon Selected">
            <div className="text-white/60">Create or select a beacon to edit its scan results.</div>
          </Section>
        )}
      </div>

      <Section title="Top-Level File Data" description="Any unknown root-level fields in beacons.json are preserved here.">
        <textarea className="input min-h-[120px] font-mono text-sm" value={workspace?.extraJson ?? ""} onChange={(event) => updateWorkspace((current) => ({ ...current, extraJson: event.target.value }))} />
      </Section>

      <Section title="JSON Preview">
        <textarea className="input min-h-[260px] font-mono text-xs" readOnly value={previewJson || JSON.stringify(workspaceToBeaconFile(createBlankBeaconWorkspace()), null, 2)} />
      </Section>
    </div>
  );
}
