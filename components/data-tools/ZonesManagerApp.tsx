"use client";

import { useEffect, useMemo, useState } from "react";
import {
  copyToClipboard,
  DismissibleStatusBanner,
  downloadTextFile,
  EMPTY_TIMED_STATUS,
  Section,
  StatusBanner,
  SummaryCard,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { buildIconSrc } from "@lib/icon-src";
import { duplicateIdMap, insertAfterIndex, removeAtIndex, setAtIndex } from "@lib/data-tools/common";
import { importStagesWorkspace } from "@lib/data-tools/systems";
import type { StageDraft } from "@lib/data-tools/types";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { MobDraft } from "@lib/mob-lab/types";
import { importMobWorkspace } from "@lib/mob-lab/utils";
import type {
  ZoneDraft,
  ZoneMobSpawnDraft,
  ZonesManagerWorkspace,
  ZoneStagePlacementDraft,
  ZoneValidationIssue,
} from "@lib/zones-manager/types";
import {
  cloneZone,
  createBlankZone,
  createBlankZoneMobSpawn,
  createBlankZonesWorkspace,
  createBlankZoneStagePlacement,
  importZonesManagerWorkspace,
  stringifySingleZone,
  stringifyZonesManagerWorkspace,
  summarizeZonesManagerWorkspace,
  validateZoneDrafts,
} from "@lib/zones-manager/utils";

type QuickFilter = "all" | "active" | "poi" | "warning" | "error";
type ReferenceStatus = {
  mobs: string | null;
  stages: string | null;
};
type MobReference = {
  id: string;
  displayName: string;
  sprite: string;
  level: string;
  faction: string;
  aiType: string;
};

function labelize(value: string) {
  if (!value) return "Unknown";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function loadSharedText(kind: "zones" | "stages" | "mobs") {
  try {
    const response = await fetch(`/api/settings/data/source?kind=${kind}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.text) {
      return {
        text: null as string | null,
        sourceLabel: null as string | null,
        error: payload?.error ? String(payload.error) : `Could not load ${kind}.`,
      };
    }

    return {
      text: String(payload.text),
      sourceLabel: payload?.sourceLabel ? String(payload.sourceLabel) : null,
      error: null as string | null,
    };
  } catch (error) {
    return {
      text: null as string | null,
      sourceLabel: null as string | null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
      />
    </label>
  );
}

function ToggleCard({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex h-full cursor-pointer gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="space-y-1">
        <span className="text-sm font-medium text-white">{label}</span>
        {description ? <span className="block text-xs leading-5 text-white/55">{description}</span> : null}
      </span>
    </label>
  );
}

function JsonArea({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <textarea
        className="input min-h-[120px] font-mono text-sm"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function zoneHasLevel(issues: ZoneValidationIssue[], zoneKey: string, level: "error" | "warning") {
  return issues.some((issue) => issue.zoneKey === zoneKey && issue.level === level);
}

function buildZonePreviewExtent(zone: ZoneDraft) {
  const halfWidth = Math.max(1, Number(zone.boundsWidth || 0) / 2);
  const halfHeight = Math.max(1, Number(zone.boundsHeight || 0) / 2);
  let extent = Math.max(halfWidth, halfHeight, 1000);

  for (const stage of zone.stages) {
    const x = Math.abs(Number(stage.posX || 0));
    const y = Math.abs(Number(stage.posY || 0));
    extent = Math.max(extent, x, y);
  }

  for (const mob of zone.mobs) {
    const x = Math.abs(Number(mob.posX || 0));
    const y = Math.abs(Number(mob.posY || 0));
    const radius = Math.max(0, Number(mob.radius || 0));
    extent = Math.max(extent, x + radius, y + radius);
  }

  return Math.max(2000, extent * 1.15);
}

function ZoneLayoutPreview({
  zone,
  stageLookup,
  mobLookup,
}: {
  zone: ZoneDraft;
  stageLookup: Map<string, StageDraft>;
  mobLookup: Map<string, MobReference>;
}) {
  const width = Math.max(1, Number(zone.boundsWidth || 0));
  const height = Math.max(1, Number(zone.boundsHeight || 0));
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const previewExtent = buildZonePreviewExtent(zone);
  const gridStep = Math.max(1000, Math.round(previewExtent / 4 / 500) * 500);
  const boundsShape = zone.boundsShape.trim().toLowerCase();
  const gridLines: number[] = [];

  for (let position = -previewExtent; position <= previewExtent; position += gridStep) {
    gridLines.push(position);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 text-xs text-white/55 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-white/40">Sector</div>
          <div className="mt-1 text-sm text-white">
            [{zone.sectorX || "0"}, {zone.sectorY || "0"}]
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-white/40">World Position</div>
          <div className="mt-1 text-sm text-white">
            {zone.posX || "0"}, {zone.posY || "0"}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#07111d]">
        <svg viewBox={`${-previewExtent} ${-previewExtent} ${previewExtent * 2} ${previewExtent * 2}`} className="h-[420px] w-full">
          <rect x={-previewExtent} y={-previewExtent} width={previewExtent * 2} height={previewExtent * 2} fill="#07111d" />

          {gridLines.map((line) => (
            <g key={`grid-${line}`} opacity={line === 0 ? 0.4 : 0.18}>
              <line x1={line} y1={-previewExtent} x2={line} y2={previewExtent} stroke="#94a3b8" strokeWidth={line === 0 ? 120 : 40} />
              <line x1={-previewExtent} y1={line} x2={previewExtent} y2={line} stroke="#94a3b8" strokeWidth={line === 0 ? 120 : 40} />
            </g>
          ))}

          {boundsShape === "ellipse" ? (
            <ellipse cx={0} cy={0} rx={halfWidth} ry={halfHeight} fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.9)" strokeWidth={220} />
          ) : (
            <rect x={-halfWidth} y={-halfHeight} width={width} height={height} fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.9)" strokeWidth={220} />
          )}

          {zone.stages.map((stage) => {
            const x = Number(stage.posX || 0);
            const y = -Number(stage.posY || 0);
            const stageRef = stageLookup.get(stage.stageId.trim());
            return (
              <g key={stage.key} transform={`translate(${x}, ${y})`}>
                <rect x={-420} y={-420} width={840} height={840} rx={120} fill="rgba(251,191,36,0.25)" stroke="rgba(251,191,36,0.95)" strokeWidth={140} transform="rotate(45)" />
                <text x={560} y={-120} fill="#fde68a" fontSize="860" fontWeight="700">
                  {stageRef?.id || stage.stageId || "stage"}
                </text>
              </g>
            );
          })}

          {zone.mobs.map((mob) => {
            const x = Number(mob.posX || 0);
            const y = -Number(mob.posY || 0);
            const radius = Math.max(0, Number(mob.radius || 0));
            const label = mobLookup.get(mob.mobId.trim())?.displayName || mob.mobId || "mob";
            return (
              <g key={mob.key} transform={`translate(${x}, ${y})`}>
                {radius > 0 ? <circle cx={0} cy={0} r={radius} fill="rgba(168,85,247,0.08)" stroke="rgba(168,85,247,0.55)" strokeWidth={140} /> : null}
                <circle cx={0} cy={0} r={380} fill="rgba(244,114,182,0.92)" stroke="rgba(253,242,248,0.92)" strokeWidth={120} />
                <text x={560} y={-140} fill="#fce7f3" fontSize="820" fontWeight="700">
                  {label}
                </text>
                <text x={560} y={700} fill="#f9a8d4" fontSize="640">
                  x{mob.count || "0"} · r {mob.radius || "0"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-2 text-xs text-white/55 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Shape: {labelize(zone.boundsShape || "ellipse")}</div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          Bounds: {zone.boundsWidth || "0"} × {zone.boundsHeight || "0"}
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">Activation Radius: {zone.activationRadius || "0"}</div>
      </div>
    </div>
  );
}

export default function ZonesManagerApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<ZonesManagerWorkspace | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [stagesWorkspace, setStagesWorkspace] = useState<StageDraft[]>([]);
  const [mobsWorkspace, setMobsWorkspace] = useState<MobDraft[]>([]);
  const [referenceStatus, setReferenceStatus] = useState<ReferenceStatus>({ mobs: null, stages: null });
  const [status, setStatus] = useState<TimedStatusState>({
    ...EMPTY_TIMED_STATUS,
    tone: "neutral",
    message: "Zones Manager reads Zones.json directly from the active local game root in Settings.",
  });
  const clearStatus = () =>
    setStatus({
      ...EMPTY_TIMED_STATUS,
      tone: "neutral",
      message: "Zones Manager reads Zones.json directly from the active local game root in Settings.",
    });
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const [zonesResult, stagesResult, mobsResult] = await Promise.all([loadSharedText("zones"), loadSharedText("stages"), loadSharedText("mobs")]);
      if (cancelled) return;

      try {
        const nextWorkspace = zonesResult.text
          ? importZonesManagerWorkspace(zonesResult.text, zonesResult.sourceLabel || "Local game source")
          : createBlankZonesWorkspace();
        setWorkspace(nextWorkspace);
        setSelectedZoneKey(nextWorkspace.zones[0]?.key ?? null);
        setStatus({
          ...EMPTY_TIMED_STATUS,
          tone: "neutral",
          message: zonesResult.text
            ? "Zones Manager reads Zones.json directly from the active local game root in Settings."
            : "No Zones.json was found under the active local game root. The manager started with a blank workspace.",
        });
      } catch (error) {
        setWorkspace(createBlankZonesWorkspace());
        setSelectedZoneKey(null);
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
          dismissAfterMs: null,
        });
      }

      try {
        const nextStages = stagesResult.text ? importStagesWorkspace(stagesResult.text, stagesResult.sourceLabel || "Local game source") : null;
        setStagesWorkspace(nextStages?.stages ?? []);
        setReferenceStatus((current) => ({
          ...current,
          stages: stagesResult.text ? null : stagesResult.error || "Stages.json is unavailable, so stage references cannot be resolved.",
        }));
      } catch (error) {
        setStagesWorkspace([]);
        setReferenceStatus((current) => ({
          ...current,
          stages: error instanceof Error ? error.message : String(error),
        }));
      }

      try {
        const nextMobs = mobsResult.text ? importMobWorkspace(mobsResult.text, mobsResult.sourceLabel || "Local game source", "uploaded") : null;
        setMobsWorkspace(nextMobs?.workspace.mobs ?? []);
        setReferenceStatus((current) => ({
          ...current,
          mobs: mobsResult.text ? null : mobsResult.error || "mobs.json is unavailable, so mob references cannot be resolved.",
        }));
      } catch (error) {
        setMobsWorkspace([]);
        setReferenceStatus((current) => ({
          ...current,
          mobs: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const stageLookup = useMemo(() => new Map(stagesWorkspace.map((stage) => [stage.id.trim(), stage])), [stagesWorkspace]);
  const mobLookup = useMemo(() => {
    return new Map(
      mobsWorkspace.map((mob) => [
        mob.id.trim(),
        {
          id: mob.id.trim(),
          displayName: mob.display_name.trim() || mob.id.trim(),
          sprite: mob.sprite.trim(),
          level: mob.level.trim(),
          faction: mob.faction.trim(),
          aiType: mob.ai_type.trim(),
        } satisfies MobReference,
      ]),
    );
  }, [mobsWorkspace]);
  const validation = useMemo(
    () =>
      validateZoneDrafts(workspace?.zones ?? [], {
        stageIds: new Set(stageLookup.keys()),
        mobIds: new Set(mobLookup.keys()),
      }),
    [mobLookup, stageLookup, workspace],
  );
  const summary = useMemo(() => summarizeZonesManagerWorkspace(workspace, validation), [workspace, validation]);
  const validationByZoneKey = useMemo(() => {
    const next = new Map<string, ZoneValidationIssue[]>();
    for (const issue of validation) {
      next.set(issue.zoneKey, [...(next.get(issue.zoneKey) ?? []), issue]);
    }
    return next;
  }, [validation]);
  const duplicateIds = useMemo(() => duplicateIdMap(workspace?.zones ?? []), [workspace]);

  const filteredZones = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = (workspace?.zones ?? [])
      .filter((zone) => {
        if (!query) return true;
        const stageIds = zone.stages.map((entry) => entry.stageId).join(" ");
        const mobIds = zone.mobs.map((entry) => entry.mobId).join(" ");
        const resolvedMobNames = zone.mobs
          .map((entry) => mobLookup.get(entry.mobId.trim())?.displayName ?? "")
          .join(" ");
        const haystack = [zone.id, zone.name, zone.poiLabel, zone.boundsShape, stageIds, mobIds, resolvedMobNames].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .filter((zone) => {
        if (quickFilter === "all") return true;
        if (quickFilter === "active") return zone.active;
        if (quickFilter === "poi") return zone.poiMap;
        if (quickFilter === "warning") return zoneHasLevel(validation, zone.key, "warning");
        if (quickFilter === "error") return zoneHasLevel(validation, zone.key, "error");
        return true;
      });

    filtered.sort((left, right) => {
      const leftLabel = (left.name.trim() || left.id.trim()).toLowerCase();
      const rightLabel = (right.name.trim() || right.id.trim()).toLowerCase();
      const labelCompare = leftLabel.localeCompare(rightLabel);
      if (labelCompare !== 0) return labelCompare;
      return left.id.trim().toLowerCase().localeCompare(right.id.trim().toLowerCase());
    });

    return filtered;
  }, [mobLookup, quickFilter, search, validation, workspace]);

  useEffect(() => {
    const zones = workspace?.zones ?? [];
    if (!zones.length) {
      if (selectedZoneKey !== null) setSelectedZoneKey(null);
      return;
    }

    if (!selectedZoneKey || !zones.some((zone) => zone.key === selectedZoneKey)) {
      setSelectedZoneKey(filteredZones[0]?.key ?? zones[0]?.key ?? null);
      return;
    }

    if (filteredZones.length && !filteredZones.some((zone) => zone.key === selectedZoneKey)) {
      setSelectedZoneKey(filteredZones[0]?.key ?? zones[0]?.key ?? null);
    }
  }, [filteredZones, selectedZoneKey, workspace]);

  const selectedZone = useMemo(() => {
    const zones = workspace?.zones ?? [];
    return zones.find((zone) => zone.key === selectedZoneKey) ?? filteredZones[0] ?? zones[0] ?? null;
  }, [filteredZones, selectedZoneKey, workspace]);
  const selectedIssues = selectedZone ? validationByZoneKey.get(selectedZone.key) ?? [] : [];
  const hasWorkspaceErrors = validation.some((issue) => issue.level === "error");
  const hasActiveFilters = quickFilter !== "all" || Boolean(search.trim());

  function updateSelectedZone(updater: (current: ZoneDraft) => ZoneDraft) {
    if (!workspace || !selectedZone) return;
    const index = workspace.zones.findIndex((zone) => zone.key === selectedZone.key);
    if (index < 0) return;
    setWorkspace({
      ...workspace,
      zones: setAtIndex(workspace.zones, index, updater(selectedZone)),
    });
  }

  function addBlankZoneDraft() {
    const currentWorkspace = workspace ?? createBlankZonesWorkspace();
    const nextZone = createBlankZone(currentWorkspace.zones.map((zone) => zone.id));
    const selectedIndex = currentWorkspace.zones.findIndex((zone) => zone.key === selectedZone?.key);
    const nextZones = insertAfterIndex(currentWorkspace.zones, selectedIndex, nextZone);
    setWorkspace({ ...currentWorkspace, zones: nextZones });
    setSelectedZoneKey(nextZone.key);
    setStatus({
      tone: "success",
      message: `Created new zone draft "${nextZone.id}".`,
      dismissAfterMs: 5000,
    });
  }

  function cloneSelectedZone() {
    if (!workspace || !selectedZone) return;
    const nextZone = cloneZone(selectedZone, workspace.zones.map((zone) => zone.id));
    const selectedIndex = workspace.zones.findIndex((zone) => zone.key === selectedZone.key);
    const nextZones = insertAfterIndex(workspace.zones, selectedIndex, nextZone);
    setWorkspace({ ...workspace, zones: nextZones });
    setSelectedZoneKey(nextZone.key);
    setStatus({
      tone: "success",
      message: `Cloned "${selectedZone.id}" into "${nextZone.id}".`,
      dismissAfterMs: 5000,
    });
  }

  function deleteSelectedZone() {
    if (!workspace || !selectedZone) return;
    if (!window.confirm(`Delete zone "${selectedZone.name || selectedZone.id || "untitled"}"?`)) return;
    const selectedIndex = workspace.zones.findIndex((zone) => zone.key === selectedZone.key);
    const nextZones = removeAtIndex(workspace.zones, selectedIndex);
    setWorkspace({
      ...workspace,
      zones: nextZones,
    });
    setSelectedZoneKey(nextZones[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: `Deleted "${selectedZone.name || selectedZone.id || "untitled"}".`,
      dismissAfterMs: 5000,
    });
  }

  function resetFilters() {
    setSearch("");
    setQuickFilter("all");
  }

  function addStagePlacement(afterKey?: string | null) {
    updateSelectedZone((zone) => {
      const afterIndex = afterKey ? zone.stages.findIndex((entry) => entry.key === afterKey) : zone.stages.length - 1;
      return {
        ...zone,
        stages: insertAfterIndex(zone.stages, afterIndex, createBlankZoneStagePlacement()),
      };
    });
  }

  function cloneStagePlacement(stageKey: string) {
    updateSelectedZone((zone) => {
      const index = zone.stages.findIndex((entry) => entry.key === stageKey);
      if (index < 0) return zone;
      const source = zone.stages[index];
      const clone: ZoneStagePlacementDraft = {
        ...source,
        key: `zone-stage-clone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      return {
        ...zone,
        stages: insertAfterIndex(zone.stages, index, clone),
      };
    });
  }

  function removeStagePlacement(stageKey: string) {
    updateSelectedZone((zone) => ({
      ...zone,
      stages: zone.stages.filter((entry) => entry.key !== stageKey),
    }));
  }

  function addMobSpawn(afterKey?: string | null) {
    updateSelectedZone((zone) => {
      const afterIndex = afterKey ? zone.mobs.findIndex((entry) => entry.key === afterKey) : zone.mobs.length - 1;
      return {
        ...zone,
        mobs: insertAfterIndex(zone.mobs, afterIndex, createBlankZoneMobSpawn()),
      };
    });
  }

  function cloneMobSpawn(mobKey: string) {
    updateSelectedZone((zone) => {
      const index = zone.mobs.findIndex((entry) => entry.key === mobKey);
      if (index < 0) return zone;
      const source = zone.mobs[index];
      const clone: ZoneMobSpawnDraft = {
        ...source,
        key: `zone-mob-clone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      return {
        ...zone,
        mobs: insertAfterIndex(zone.mobs, index, clone),
      };
    });
  }

  function removeMobSpawn(mobKey: string) {
    updateSelectedZone((zone) => ({
      ...zone,
      mobs: zone.mobs.filter((entry) => entry.key !== mobKey),
    }));
  }

  async function handleCopyCurrentZone() {
    if (!selectedZone) return;
    try {
      await copyToClipboard(stringifySingleZone(selectedZone));
      setStatus({
        tone: "success",
        message: `Copied ${selectedZone.id || "current zone"} JSON to the clipboard.`,
        dismissAfterMs: 5000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleCopyUpdatedJson() {
    if (!workspace) return;
    try {
      await copyToClipboard(stringifyZonesManagerWorkspace(workspace));
      setStatus({
        tone: "success",
        message: "Copied updated Zones.json to the clipboard.",
        dismissAfterMs: 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function handleDownloadUpdatedJson() {
    if (!workspace) return;
    try {
      downloadTextFile("Zones.json", stringifyZonesManagerWorkspace(workspace));
      setStatus({
        tone: "success",
        message: "Downloaded updated Zones.json.",
        dismissAfterMs: 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleSaveAllZonesToBuild() {
    if (!workspace) return;
    if (hasWorkspaceErrors) {
      setStatus({
        tone: "error",
        message: "Fix zone validation errors before saving Zones.json into the configured game build.",
        dismissAfterMs: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/zones/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save Zones.json into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setStatus({
        tone: "success",
        message: `Saved all ${workspace.zones.length} zones into the live Zones.json file.`,
        dismissAfterMs: 10000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl">
          <h1 className="page-title mb-1">Zones Manager</h1>
          <p className="text-sm leading-6 text-white/65">
            Manage runtime zones from the active local game root, create new encounter spaces, edit stage and mob placements, and preview zone
            contents on a live layout map before saving back into the game build.
          </p>
        </div>

        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => void handleSaveAllZonesToBuild()}>
          Save All Zones To Build
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!workspace} onClick={handleDownloadUpdatedJson}>
          Download Updated Zones.json
        </button>
        <button className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={!workspace} onClick={() => void handleCopyUpdatedJson()}>
          Copy Updated JSON
        </button>
      </div>

      {status.tone === "neutral" ? (
        <StatusBanner tone={status.tone} message={status.message} />
      ) : (
        <DismissibleStatusBanner tone={status.tone} message={status.message} onDismiss={clearStatus} countdownSeconds={statusCountdown} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Zones" value={summary.totalZones} active={quickFilter === "all"} onClick={() => setQuickFilter("all")} />
        <SummaryCard label="Active" value={summary.activeZones} active={quickFilter === "active"} onClick={() => setQuickFilter("active")} />
        <SummaryCard label="POI Zones" value={summary.poiZones} active={quickFilter === "poi"} onClick={() => setQuickFilter("poi")} />
        <SummaryCard
          label="Warnings"
          value={summary.warningCount}
          accent={summary.warningCount ? "text-yellow-200" : undefined}
          active={quickFilter === "warning"}
          onClick={() => setQuickFilter("warning")}
        />
        <SummaryCard
          label="Errors"
          value={summary.errorCount}
          accent={summary.errorCount ? "text-red-200" : undefined}
          active={quickFilter === "error"}
          onClick={() => setQuickFilter("error")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px,minmax(0,1fr),380px]">
        <Section title="Zone Library" description={`${filteredZones.length} filtered of ${workspace?.zones.length ?? 0} zone(s).`}>
          <div className="flex flex-wrap gap-2">
            <button className="btn shrink-0" onClick={addBlankZoneDraft}>
              New Zone
            </button>
            <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={!selectedZone} onClick={cloneSelectedZone}>
              Duplicate
            </button>
            <button className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10 disabled:cursor-default disabled:opacity-40" disabled={!selectedZone} onClick={deleteSelectedZone}>
              Delete
            </button>
          </div>

          <div className="space-y-3">
            <label className="space-y-2">
              <div className="label">Search</div>
              <input className="input" value={search} placeholder="Search zones, mobs, or stages…" onChange={(event) => setSearch(event.target.value)} />
            </label>

            <button
              type="button"
              className="w-full rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={resetFilters}
            >
              Reset Filter
            </button>
          </div>

          <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
            {filteredZones.length ? (
              filteredZones.map((zone) => {
                const issues = validationByZoneKey.get(zone.key) ?? [];
                const hasErrors = issues.some((issue) => issue.level === "error");
                const hasWarnings = issues.some((issue) => issue.level === "warning");
                const isActive = selectedZone?.key === zone.key;
                return (
                  <button
                    key={zone.key}
                    type="button"
                    onClick={() => setSelectedZoneKey(zone.key)}
                    className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                        : "border-white/10 bg-black/20 hover:border-cyan-300/30 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-white">{zone.name || zone.id || "Untitled Zone"}</div>
                        <div className="truncate text-sm text-white/55">{zone.id || "No zone ID"}</div>
                      </div>
                      <div className="shrink-0 rounded-lg border border-white/10 px-3 py-1 text-sm text-white/80">
                        [{zone.sectorX || "0"}, {zone.sectorY || "0"}]
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {zone.active ? <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-emerald-100">Active</span> : <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/60">Inactive</span>}
                      {zone.poiMap ? <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-cyan-100">POI</span> : null}
                      {hasWarnings ? <span className="rounded-full border border-yellow-300/30 bg-yellow-400/10 px-2 py-1 text-yellow-100">Warnings</span> : null}
                      {hasErrors ? <span className="rounded-full border border-red-300/30 bg-red-400/10 px-2 py-1 text-red-100">Errors</span> : null}
                    </div>

                    <div className="mt-3 text-sm text-white/55">
                      {zone.mobs.length} mob spawn{zone.mobs.length === 1 ? "" : "s"} · {zone.stages.length} stage placement{zone.stages.length === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No zones match the current filter.</div>
            )}
          </div>
        </Section>

        <div className="space-y-6">
          <Section
            title="Zone Editor"
            description={
              selectedZone
                ? `Editing ${selectedZone.name || selectedZone.id}. Duplicate IDs: ${duplicateIds.get(selectedZone.id.trim())?.length ?? 0 ? "yes" : "no"}.`
                : "Select a zone to edit it."
            }
          >
            {selectedZone ? (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => void handleCopyCurrentZone()}>
                    Copy JSON
                  </button>
                  <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={cloneSelectedZone}>
                    Duplicate
                  </button>
                  <button className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={deleteSelectedZone}>
                    Delete
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Zone Name" value={selectedZone.name} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, name: next }))} />
                  <Field label="Zone ID" value={selectedZone.id} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, id: next }))} />
                  <Field label="Sector X" type="number" value={selectedZone.sectorX} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, sectorX: next }))} />
                  <Field label="Sector Y" type="number" value={selectedZone.sectorY} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, sectorY: next }))} />
                  <Field label="World Position X" type="number" value={selectedZone.posX} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, posX: next }))} />
                  <Field label="World Position Y" type="number" value={selectedZone.posY} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, posY: next }))} />
                  <Field label="Activation Radius" type="number" value={selectedZone.activationRadius} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, activationRadius: next }))} />
                  <Field
                    label="POI Label"
                    value={selectedZone.poiLabel}
                    placeholder="Optional map label"
                    onChange={(next) => updateSelectedZone((zone) => ({ ...zone, poiLabel: next }))}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <ToggleCard label="Active" description="Enable this zone in the live world." checked={selectedZone.active} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, active: next }))} />
                  <ToggleCard
                    label="Show HUD On Enter"
                    description="Show the zone HUD banner when the player enters."
                    checked={selectedZone.showHudOnEnter}
                    onChange={(next) => updateSelectedZone((zone) => ({ ...zone, showHudOnEnter: next }))}
                  />
                  <ToggleCard label="Activation Radius Border" description="Show the border ring for the activation radius." checked={selectedZone.activationRadiusBorder} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, activationRadiusBorder: next }))} />
                  <ToggleCard label="POI Map" description="Expose this zone as a point of interest on the map." checked={selectedZone.poiMap} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, poiMap: next }))} />
                  <ToggleCard label="POI Hidden" description="Keep the POI hidden until discovered." checked={selectedZone.poiHidden} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, poiHidden: next }))} />
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-4">
                    <div className="text-base font-semibold text-white">Bounds</div>
                    <div className="mt-1 text-sm text-white/55">Define the playable footprint for the zone preview and runtime bounds data.</div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <div className="label">Shape</div>
                      <select className="input" value={selectedZone.boundsShape} onChange={(event) => updateSelectedZone((zone) => ({ ...zone, boundsShape: event.target.value }))}>
                        <option value="ellipse">Ellipse</option>
                        <option value="rectangle">Rectangle</option>
                        <option value="rect">Rect</option>
                      </select>
                    </label>
                    <Field label="Width" type="number" value={selectedZone.boundsWidth} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, boundsWidth: next }))} />
                    <Field label="Height" type="number" value={selectedZone.boundsHeight} onChange={(next) => updateSelectedZone((zone) => ({ ...zone, boundsHeight: next }))} />
                  </div>

                  <div className="mt-4">
                    <JsonArea
                      label="Bounds Extra JSON"
                      value={selectedZone.boundsExtraJson}
                      placeholder='Example: { "rotation_deg": 15 }'
                      onChange={(next) => updateSelectedZone((zone) => ({ ...zone, boundsExtraJson: next }))}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">Stage Placements</div>
                      <div className="mt-1 text-sm text-white/55">Place stage profiles relative to the zone center.</div>
                    </div>
                    <button className="btn" onClick={() => addStagePlacement()}>
                      Add Stage
                    </button>
                  </div>

                  <div className="space-y-4">
                    {selectedZone.stages.length ? (
                      selectedZone.stages.map((stage, index) => {
                        const stageRef = stageLookup.get(stage.stageId.trim());
                        return (
                          <div key={stage.key} className="rounded-xl border border-white/10 bg-[#07111d] p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">{stageRef?.id || stage.stageId || `Stage #${index + 1}`}</div>
                                <div className="mt-1 text-xs text-white/45">{stageRef ? `${labelize(stageRef.shape)} · ${stageRef.width} × ${stageRef.height}` : "Unresolved stage reference"}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/5" onClick={() => cloneStagePlacement(stage.key)}>
                                  Duplicate
                                </button>
                                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/5" onClick={() => addStagePlacement(stage.key)}>
                                  Add After
                                </button>
                                <button className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={() => removeStagePlacement(stage.key)}>
                                  Remove
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                              <Field
                                label="Stage ID"
                                value={stage.stageId}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    stages: zone.stages.map((entry) => (entry.key === stage.key ? { ...entry, stageId: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Position X"
                                type="number"
                                value={stage.posX}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    stages: zone.stages.map((entry) => (entry.key === stage.key ? { ...entry, posX: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Position Y"
                                type="number"
                                value={stage.posY}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    stages: zone.stages.map((entry) => (entry.key === stage.key ? { ...entry, posY: next } : entry)),
                                  }))
                                }
                              />
                            </div>

                            <div className="mt-4">
                              <JsonArea
                                label="Stage Extra JSON"
                                value={stage.extraJson}
                                placeholder='Example: { "blend_mode": "add" }'
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    stages: zone.stages.map((entry) => (entry.key === stage.key ? { ...entry, extraJson: next } : entry)),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No stages are placed in this zone yet.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">Mob Spawns</div>
                      <div className="mt-1 text-sm text-white/55">Define which mobs appear in the zone, where they spawn, and their encounter rules.</div>
                    </div>
                    <button className="btn" onClick={() => addMobSpawn()}>
                      Add Mob Spawn
                    </button>
                  </div>

                  <div className="space-y-4">
                    {selectedZone.mobs.length ? (
                      selectedZone.mobs.map((mob, index) => {
                        const mobRef = mobLookup.get(mob.mobId.trim());
                        const spriteSrc = mobRef?.sprite ? buildIconSrc(mobRef.sprite, mobRef.id, mobRef.displayName, sharedDataVersion) : null;
                        return (
                          <div key={mob.key} className="rounded-xl border border-white/10 bg-[#07111d] p-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                {spriteSrc ? (
                                  <img src={spriteSrc} alt={mobRef?.displayName || mob.mobId || "Mob"} className="h-14 w-14 rounded-lg border border-white/10 bg-black/20 object-cover" />
                                ) : (
                                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.2em] text-white/35">
                                    No Sprite
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white">{mobRef?.displayName || mob.mobId || `Mob #${index + 1}`}</div>
                                  <div className="mt-1 text-xs text-white/45">
                                    {mobRef ? `${mobRef.id} · Lvl ${mobRef.level || "?"} · ${mobRef.faction || "Unknown Faction"}` : "Unresolved mob reference"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/5" onClick={() => cloneMobSpawn(mob.key)}>
                                  Duplicate
                                </button>
                                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/5" onClick={() => addMobSpawn(mob.key)}>
                                  Add After
                                </button>
                                <button className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={() => removeMobSpawn(mob.key)}>
                                  Remove
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                              <Field
                                label="Mob ID"
                                value={mob.mobId}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, mobId: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Count"
                                type="number"
                                value={mob.count}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, count: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Radius"
                                type="number"
                                value={mob.radius}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, radius: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Respawn Delay"
                                type="number"
                                value={mob.respawnDelay}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, respawnDelay: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Position X"
                                type="number"
                                value={mob.posX}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, posX: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Position Y"
                                type="number"
                                value={mob.posY}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, posY: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Angle"
                                type="number"
                                value={mob.angleDeg}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, angleDeg: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Rank"
                                value={mob.rank}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, rank: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Level Min"
                                type="number"
                                value={mob.levelMin}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, levelMin: next } : entry)),
                                  }))
                                }
                              />
                              <Field
                                label="Level Max"
                                type="number"
                                value={mob.levelMax}
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, levelMax: next } : entry)),
                                  }))
                                }
                              />
                            </div>

                            <div className="mt-4">
                              <JsonArea
                                label="Mob Extra JSON"
                                value={mob.extraJson}
                                placeholder='Example: { "formation": "ring" }'
                                onChange={(next) =>
                                  updateSelectedZone((zone) => ({
                                    ...zone,
                                    mobs: zone.mobs.map((entry) => (entry.key === mob.key ? { ...entry, extraJson: next } : entry)),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No mob spawns are placed in this zone yet.</div>
                    )}
                  </div>
                </div>

                <JsonArea
                  label="Zone Extra JSON"
                  value={selectedZone.extraJson}
                  rows={8}
                  placeholder='Example: { "music": "threat_01", "weather": "dust" }'
                  onChange={(next) => updateSelectedZone((zone) => ({ ...zone, extraJson: next }))}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">Select a zone from the library to edit it.</div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Zone Layout" description="Visualize stage placements and mob spawns relative to the zone center.">
            {selectedZone ? <ZoneLayoutPreview zone={selectedZone} stageLookup={stageLookup} mobLookup={mobLookup} /> : <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">Select a zone to see its layout preview.</div>}
          </Section>

          <Section title="Resolved Mob Placements" description="See which mobs are used in this zone and where each spawn cluster is placed.">
            {referenceStatus.mobs ? <StatusBanner tone="neutral" message={referenceStatus.mobs} /> : null}
            {selectedZone?.mobs.length ? (
              <div className="space-y-3">
                {selectedZone.mobs.map((mob) => {
                  const mobRef = mobLookup.get(mob.mobId.trim());
                  const spriteSrc = mobRef?.sprite ? buildIconSrc(mobRef.sprite, mobRef.id, mobRef.displayName, sharedDataVersion) : null;
                  return (
                    <div key={`resolved-${mob.key}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start gap-3">
                        {spriteSrc ? (
                          <img src={spriteSrc} alt={mobRef?.displayName || mob.mobId || "Mob"} className="h-14 w-14 rounded-lg border border-white/10 bg-black/20 object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.2em] text-white/35">
                            No Sprite
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold text-white">{mobRef?.displayName || mob.mobId || "Unknown Mob"}</div>
                          <div className="mt-1 text-sm text-white/55">
                            {mob.mobId || "No mob ID"} · Count {mob.count || "0"} · Radius {mob.radius || "0"}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            Pos {mob.posX || "0"}, {mob.posY || "0"} · Respawn {mob.respawnDelay || "0"}s · Angle {mob.angleDeg || "0"}
                          </div>
                          {mob.levelMin || mob.levelMax || mob.rank ? (
                            <div className="mt-1 text-sm text-white/45">
                              Rank {mob.rank || "normal"} · Levels {mob.levelMin || "?"} to {mob.levelMax || "?"}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">This zone has no mob spawns configured.</div>
            )}
          </Section>

          <Section title="Resolved Stage Placements" description="Check the referenced stages and where each one is positioned inside the zone.">
            {referenceStatus.stages ? <StatusBanner tone="neutral" message={referenceStatus.stages} /> : null}
            {selectedZone?.stages.length ? (
              <div className="space-y-3">
                {selectedZone.stages.map((stage) => {
                  const stageRef = stageLookup.get(stage.stageId.trim());
                  return (
                    <div key={`stage-${stage.key}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-base font-semibold text-white">{stageRef?.id || stage.stageId || "Unknown Stage"}</div>
                      <div className="mt-1 text-sm text-white/55">
                        Pos {stage.posX || "0"}, {stage.posY || "0"}
                      </div>
                      <div className="mt-1 text-sm text-white/45">
                        {stageRef ? `${labelize(stageRef.shape)} · ${stageRef.width} × ${stageRef.height}` : "Unresolved stage reference"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">This zone has no stage placements configured.</div>
            )}
          </Section>

          <Section title="Validation" description="Warnings and errors for the selected zone.">
            {selectedZone ? (
              selectedIssues.length ? (
                <div className="space-y-3">
                  {selectedIssues.map((issue, index) => (
                    <div
                      key={`${issue.field}-${index}`}
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        issue.level === "error" ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
                      }`}
                    >
                      {issue.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">No validation issues for this zone.</div>
              )
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">Select a zone to review its validation.</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
