"use client";

import { useEffect, useMemo, useState } from "react";
import { JsonTextArea, Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";
import type { GeneratedAreaArtifacts, GeneratedAreaEntry, GeneratedAreasWorkspace, JsonObject } from "@lib/generated-areas/types";

type Status = {
  tone: "neutral" | "success" | "error";
  message: string;
};

type RequestForm = {
  id: string;
  name: string;
  archetype: string;
  status: string;
  active: boolean;
  poiMap: boolean;
  sectorX: string;
  sectorY: string;
  x: string;
  y: string;
  levelMin: string;
  levelMax: string;
  width: string;
  height: string;
  boundsShape: string;
  activationRadius: string;
  hubName: string;
  contactName: string;
  eliteName: string;
  npcCount: string;
  asteroidCount: string;
  scanCount: string;
  mineCount: string;
  oreItemId: string;
  oreCount: string;
  stages: StageForm[];
};

type StageForm = {
  key: string;
  stageId: string;
  posX: string;
  posY: string;
  extraJson: string;
};

type ZoneForm = {
  target: "staged" | "core";
  name: string;
  active: boolean;
  poiMap: boolean;
  poiHidden: boolean;
  showHudOnEnter: boolean;
  sectorX: string;
  sectorY: string;
  posX: string;
  posY: string;
  activationRadius: string;
  boundsShape: string;
  boundsWidth: string;
  boundsHeight: string;
  stages: StageForm[];
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function numberText(value: unknown, fallback = "") {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function vectorText(value: unknown, index: number, fallback = "0") {
  const vector = asArray(value);
  return numberText(vector[index], fallback);
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ARCHETYPE_OPTIONS = [
  { value: "friendly_hub_under_siege", label: "Friendly Hub Under Siege" },
  { value: "pirate_stronghold", label: "Pirate Stronghold" },
  { value: "npc_scan_habitat", label: "NPC Scan Habitat" },
  { value: "mining_colony", label: "Mining Colony" },
];

const DEFAULT_REQUEST_STAGE_PLACEMENTS = [
  { stage_id: "ast_btm", pos: [0, 0] },
  { stage_id: "ast_top", pos: [0, 0] },
];

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function stageExtraJson(stage: JsonObject) {
  const { stage_id: _stageId, pos: _pos, ...extra } = stage;
  return Object.keys(extra).length ? formatJson(extra) : "{}";
}

function parseStageExtraJson(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed as JsonObject;
}

function createStageForm(stage: unknown, index: number): StageForm {
  const entry = asObject(stage);
  return {
    key: `${stringValue(entry.stage_id, "stage")}-${index}-${Math.random().toString(36).slice(2)}`,
    stageId: stringValue(entry.stage_id),
    posX: vectorText(entry.pos, 0),
    posY: vectorText(entry.pos, 1),
    extraJson: stageExtraJson(entry),
  };
}

function blankStageForm(): StageForm {
  return {
    key: `stage-${Math.random().toString(36).slice(2)}`,
    stageId: "",
    posX: "0",
    posY: "0",
    extraJson: "{}",
  };
}

function createRequestForm(entry: GeneratedAreaEntry): RequestForm {
  const request = entry.request;
  const sourceZone = asObject(entry.staged.zone ?? entry.core.zone);
  return {
    id: entry.id,
    name: stringValue(request.name, entry.name),
    archetype: stringValue(request.archetype, entry.archetype),
    status: stringValue(request.status, entry.status || "draft"),
    active: boolValue(request.active, true),
    poiMap: boolValue(request.poi_map, boolValue(sourceZone.poi_map, true)),
    sectorX: vectorText(request.sector_id, 0),
    sectorY: vectorText(request.sector_id, 1),
    x: numberText(request.x, vectorText(sourceZone.pos, 0)),
    y: numberText(request.y, vectorText(sourceZone.pos, 1)),
    levelMin: numberText(request.level_min, numberText(sourceZone.level_min, "1")),
    levelMax: numberText(request.level_max, numberText(sourceZone.level_max, "1")),
    width: numberText(request.width, numberText(asObject(sourceZone.bounds).width, "36000")),
    height: numberText(request.height, numberText(asObject(sourceZone.bounds).height, "30000")),
    boundsShape: stringValue(request.bounds_shape, stringValue(asObject(sourceZone.bounds).shape, "ellipse")),
    activationRadius: numberText(request.activation_radius, numberText(sourceZone.activation_radius, "52000")),
    hubName: stringValue(request.hub_name),
    contactName: stringValue(request.contact_name),
    eliteName: stringValue(request.elite_name),
    npcCount: numberText(request.npc_count, "5"),
    asteroidCount: numberText(request.asteroid_count, "8"),
    scanCount: numberText(request.scan_count, "4"),
    mineCount: numberText(request.mine_count, "4"),
    oreItemId: numberText(request.ore_item_id, "85"),
    oreCount: numberText(request.ore_count, "3"),
    stages: asArray(request.stages).length ? asArray(request.stages).map(createStageForm) : DEFAULT_REQUEST_STAGE_PLACEMENTS.map(createStageForm),
  };
}

function createZoneFormForTarget(entry: GeneratedAreaEntry, target: "staged" | "core"): ZoneForm | null {
  const sourceZone = target === "staged" ? entry.staged.zone : entry.core.zone;
  if (!sourceZone) return null;
  const zone = asObject(sourceZone);
  const bounds = asObject(zone.bounds);
  return {
    target,
    name: stringValue(zone.name, entry.name),
    active: boolValue(zone.active, true),
    poiMap: boolValue(zone.poi_map, true),
    poiHidden: boolValue(zone.poi_hidden, false),
    showHudOnEnter: boolValue(zone.show_hud_on_enter, true),
    sectorX: vectorText(zone.sector_id, 0),
    sectorY: vectorText(zone.sector_id, 1),
    posX: vectorText(zone.pos, 0),
    posY: vectorText(zone.pos, 1),
    activationRadius: numberText(zone.activation_radius, "52000"),
    boundsShape: stringValue(bounds.shape, "ellipse"),
    boundsWidth: numberText(bounds.width, "36000"),
    boundsHeight: numberText(bounds.height, "30000"),
    stages: asArray(zone.stages).map(createStageForm),
  };
}

function createZoneForm(entry: GeneratedAreaEntry): ZoneForm | null {
  if (entry.staged.zone) return createZoneFormForTarget(entry, "staged");
  if (entry.core.zone) return createZoneFormForTarget(entry, "core");
  return null;
}

function requestFromForm(form: RequestForm, original: JsonObject): JsonObject {
  const next: JsonObject = {
    ...original,
    id: form.id.trim(),
    name: form.name.trim(),
    archetype: form.archetype.trim(),
    status: form.status.trim() || "draft",
    active: form.active,
    poi_map: form.poiMap,
    sector_id: [parseNumber(form.sectorX), parseNumber(form.sectorY)],
    x: parseNumber(form.x),
    y: parseNumber(form.y),
    level_min: parseNumber(form.levelMin, 1),
    level_max: parseNumber(form.levelMax, parseNumber(form.levelMin, 1)),
    width: parseNumber(form.width, 36000),
    height: parseNumber(form.height, 30000),
    bounds_shape: form.boundsShape.trim() || "ellipse",
    activation_radius: parseNumber(form.activationRadius, 52000),
    stages: form.stages.map((stage, index) => ({
      stage_id: stage.stageId.trim(),
      pos: [parseNumber(stage.posX), parseNumber(stage.posY)],
      ...parseStageExtraJson(stage.extraJson, `Extra JSON for generator stage ${index + 1}`),
    })),
  };
  if (form.hubName.trim()) next.hub_name = form.hubName.trim();
  if (form.contactName.trim()) next.contact_name = form.contactName.trim();
  if (form.eliteName.trim()) next.elite_name = form.eliteName.trim();
  if (form.archetype === "npc_scan_habitat") next.npc_count = parseNumber(form.npcCount, 5);
  if (form.archetype === "mining_colony") {
    next.asteroid_count = parseNumber(form.asteroidCount, 8);
    next.scan_count = parseNumber(form.scanCount, 4);
    next.mine_count = parseNumber(form.mineCount, 4);
    next.ore_item_id = parseNumber(form.oreItemId, 85);
    next.ore_count = parseNumber(form.oreCount, 3);
  }
  return next;
}

function zoneFromForm(form: ZoneForm, original: JsonObject): JsonObject {
  const originalBounds = asObject(original.bounds);
  return {
    ...original,
    name: form.name.trim(),
    active: form.active,
    show_hud_on_enter: form.showHudOnEnter,
    poi_map: form.poiMap,
    poi_hidden: form.poiHidden,
    sector_id: [parseNumber(form.sectorX), parseNumber(form.sectorY)],
    pos: [parseNumber(form.posX), parseNumber(form.posY)],
    activation_radius: parseNumber(form.activationRadius, 52000),
    bounds: {
      ...originalBounds,
      shape: form.boundsShape.trim() || "ellipse",
      width: parseNumber(form.boundsWidth, 36000),
      height: parseNumber(form.boundsHeight, 30000),
    },
    stages: form.stages.map((stage, index) => ({
      stage_id: stage.stageId.trim(),
      pos: [parseNumber(stage.posX), parseNumber(stage.posY)],
      ...parseStageExtraJson(stage.extraJson, `Extra JSON for stage ${index + 1}`),
    })),
  };
}

function artifactsCount(artifacts: GeneratedAreaArtifacts) {
  return {
    zones: artifacts.zone ? 1 : 0,
    contacts: Object.keys(artifacts.contacts).length,
    mobs: artifacts.mobs.length,
    missions: artifacts.missions.length,
  };
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "promoted"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : status === "approved"
        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        : "border-white/10 bg-white/5 text-white/60";
  return <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${tone}`}>{status || "draft"}</span>;
}

function slugifyAreaId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "generated_area"
  );
}

function uniqueAreaId(base: string, entries: GeneratedAreaEntry[]) {
  const root = slugifyAreaId(base);
  const existing = new Set(entries.map((entry) => entry.id));
  if (!existing.has(root)) return root;
  let suffix = 2;
  while (existing.has(`${root}_${suffix}`)) suffix += 1;
  return `${root}_${suffix}`;
}

function ArtifactSummary({ label, artifacts }: { label: string; artifacts: GeneratedAreaArtifacts }) {
  const counts = artifactsCount(artifacts);
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-white/55">
        <div>
          <div className="text-lg font-semibold text-white">{counts.zones}</div>
          zones
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{counts.contacts}</div>
          comms
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{counts.mobs}</div>
          mobs
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{counts.missions}</div>
          missions
        </div>
      </div>
    </div>
  );
}

function ArtifactDetails({ artifacts }: { artifacts: GeneratedAreaArtifacts }) {
  const contacts = Object.entries(artifacts.contacts);
  return (
    <div className="space-y-3">
      {artifacts.zone ? <JsonTextArea label="Zone JSON Preview" value={formatJson(artifacts.zone)} rows={8} onChange={() => {}} /> : null}
      {contacts.length ? <JsonTextArea label="Comms JSON Preview" value={formatJson(artifacts.contacts)} rows={8} onChange={() => {}} /> : null}
      {artifacts.mobs.length ? <JsonTextArea label="Generated Mob JSON Preview" value={formatJson({ mobs: artifacts.mobs })} rows={8} onChange={() => {}} /> : null}
      {artifacts.missions.length ? (
        <div className="space-y-3">
          <div className="label">Mission Files</div>
          {artifacts.missions.map((mission) => (
            <details key={mission.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                {mission.title || mission.id}
                <span className="ml-2 font-mono text-xs text-white/45">{mission.fileName}</span>
              </summary>
              <textarea className="input mt-3 min-h-56 font-mono text-xs" readOnly value={formatJson(mission.data)} />
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function GeneratedAreasManager() {
  const [workspace, setWorkspace] = useState<GeneratedAreasWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [requestForm, setRequestForm] = useState<RequestForm | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneForm | null>(null);
  const [status, setStatus] = useState<Status>({ tone: "neutral", message: "Loading generated area staging files..." });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/generated-areas", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setStatus({ tone: "error", message: payload.error || "Could not load generated areas." });
        setWorkspace(null);
        return;
      }
      const nextWorkspace = payload as GeneratedAreasWorkspace;
      setWorkspace(nextWorkspace);
      setSelectedId((current) => (current && nextWorkspace.entries.some((entry) => entry.id === current) ? current : nextWorkspace.entries[0]?.id ?? ""));
      setStatus({ tone: "success", message: `Loaded ${nextWorkspace.entries.length} generated area request${nextWorkspace.entries.length === 1 ? "" : "s"}.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedEntry = useMemo(() => workspace?.entries.find((entry) => entry.id === selectedId) ?? workspace?.entries[0] ?? null, [selectedId, workspace]);

  useEffect(() => {
    if (!selectedEntry) {
      setRequestForm(null);
      setZoneForm(null);
      return;
    }
    setRequestForm(createRequestForm(selectedEntry));
    setZoneForm(createZoneForm(selectedEntry));
  }, [selectedEntry]);

  const selectedZoneSource = zoneForm?.target === "core" ? selectedEntry?.core.zone : selectedEntry?.staged.zone;

  async function runAction(action: "save" | "approve" | "promote" | "reject" | "generate") {
    if (!selectedEntry && action !== "generate") return;
    if (!requestForm && action !== "generate") return;
    if (action === "promote" && selectedEntry && !selectedEntry.hasStagedContent) {
      setStatus({ tone: "error", message: "This area has no staged generated content to promote." });
      return;
    }
    if (action === "reject" && selectedEntry && !window.confirm(`Reject "${selectedEntry.name}" and delete every staged/core artifact matching "${selectedEntry.id}"?`)) return;
    if (action === "promote" && selectedEntry && !window.confirm(`Promote staged content for "${selectedEntry.name}" into the core generated area files?`)) return;

    setSaving(true);
    try {
      const includeEdits = action === "save" || action === "approve" || action === "promote";
      const request = includeEdits && requestForm && selectedEntry ? requestFromForm(requestForm, selectedEntry.request) : undefined;
      const zone = includeEdits && zoneForm && selectedEntry ? zoneFromForm(zoneForm, asObject(selectedZoneSource)) : undefined;
      const response = await fetch("/api/generated-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          areaId: selectedEntry?.id,
          request,
          zone,
          zoneTarget: zoneForm?.target ?? "staged",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setStatus({ tone: "error", message: payload.error || `Generated area action "${action}" failed.` });
        return;
      }
      setWorkspace(payload.workspace);
      if (action === "reject") setSelectedId(payload.workspace?.entries?.[0]?.id ?? "");
      setStatus({ tone: "success", message: payload.message || "Generated area files updated." });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  async function createGeneratedAreaRequest() {
    if (!workspace || saving) return;
    const areaId = uniqueAreaId("gen_new_area_10_14", workspace.entries);
    const request = {
      id: areaId,
      name: "New Generated Area",
      archetype: "friendly_hub_under_siege",
      status: "draft",
      active: true,
      poi_map: true,
      sector_id: [1, 0],
      x: 0,
      y: 0,
      level_min: 10,
      level_max: 14,
      width: 36000,
      height: 30000,
      bounds_shape: "ellipse",
      activation_radius: 52000,
      stages: DEFAULT_REQUEST_STAGE_PLACEMENTS,
    };
    setSaving(true);
    try {
      const response = await fetch("/api/generated-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", areaId, request }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setStatus({ tone: "error", message: payload.error || "Could not create generated area request." });
        return;
      }
      setWorkspace(payload.workspace);
      setSelectedId(areaId);
      setStatus({ tone: "success", message: `Created generated area request "${areaId}". Edit it, save, then run the generator.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  function updateStage(index: number, patch: Partial<StageForm>) {
    setZoneForm((current) => {
      if (!current) return current;
      return {
        ...current,
        stages: current.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
      };
    });
  }

  function removeStage(index: number) {
    setZoneForm((current) => (current ? { ...current, stages: current.stages.filter((_stage, stageIndex) => stageIndex !== index) } : current));
  }

  function updateRequestStage(index: number, patch: Partial<StageForm>) {
    setRequestForm((current) => {
      if (!current) return current;
      return {
        ...current,
        stages: current.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
      };
    });
  }

  function removeRequestStage(index: number) {
    setRequestForm((current) => (current ? { ...current, stages: current.stages.filter((_stage, stageIndex) => stageIndex !== index) } : current));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Generated Areas</h1>
          <p className="max-w-5xl text-sm leading-6 text-white/70">
            Review procedural area requests, staged generated zones, generated comms, generated mobs, and generated mission files before moving them into the core game data.
          </p>
          {workspace?.sourceRoot ? <div className="mt-2 break-all font-mono text-xs text-white/45">{workspace.sourceRoot}</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={loading || saving} onClick={() => void load()}>
            Refresh
          </button>
          <button className="btn disabled:cursor-default disabled:opacity-40" disabled={loading || saving} onClick={() => void runAction("generate")}>
            Run Generator
          </button>
        </div>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      {workspace ? (
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Requests" value={workspace.summary.requestCount} />
          <SummaryCard label="Draft" value={workspace.summary.draftCount} />
          <SummaryCard label="Approved" value={workspace.summary.approvedCount} />
          <SummaryCard label="Promoted" value={workspace.summary.promotedCount} />
          <SummaryCard label="Staged Areas" value={workspace.summary.stagedAreaCount} />
        </div>
      ) : null}

      {workspace ? (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Section title="Area Queue" description="Select a generated area request or promoted generated area artifact.">
            <button className="btn w-full disabled:cursor-default disabled:opacity-40" disabled={saving} onClick={() => void createGeneratedAreaRequest()}>
              New Generated Area
            </button>
            <div className="space-y-2">
              {workspace.entries.length ? (
                workspace.entries.map((entry) => (
                  <button
                    key={entry.id}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedEntry?.id === entry.id ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:border-cyan-300/30 hover:bg-white/[0.05]"
                    }`}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{entry.name || entry.id}</div>
                        <div className="mt-1 truncate font-mono text-xs text-white/45">{entry.id}</div>
                      </div>
                      <StatusPill status={entry.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55">
                      <span className="rounded-full bg-white/5 px-2 py-1">{entry.archetype || "no archetype"}</span>
                      {entry.hasStagedContent ? <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-cyan-100">staged</span> : null}
                      {entry.hasCoreContent ? <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-emerald-100">core</span> : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No generated area requests or artifacts were found.</div>
              )}
            </div>
          </Section>

          <div className="space-y-6">
            {selectedEntry && requestForm ? (
              <>
                <Section title="Review And Migration" description="Save edits, approve the request, promote staged generated files, or reject and delete generated artifacts.">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <ArtifactSummary label="Staged Content" artifacts={selectedEntry.staged} />
                    <ArtifactSummary label="Core Content" artifacts={selectedEntry.core} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn disabled:cursor-default disabled:opacity-40" disabled={saving} onClick={() => void runAction("save")}>
                      Save Edits
                    </button>
                    <button className="rounded border border-cyan-300/25 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-default disabled:opacity-40" disabled={saving || selectedEntry.status === "promoted"} onClick={() => void runAction("approve")}>
                      Approve For Migration
                    </button>
                    <button className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={saving || !selectedEntry.hasStagedContent} onClick={() => void runAction("promote")}>
                      Promote To Core Data
                    </button>
                    <button className="rounded border border-red-400/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10 disabled:cursor-default disabled:opacity-40" disabled={saving} onClick={() => void runAction("reject")}>
                      Reject And Delete
                    </button>
                  </div>
                </Section>

                <Section title="Area Request" description="These fields drive the procedural generator. Saving edits writes GeneratedAreaRequests.json.">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-white/65">
                      Area ID
                      <input className="input mt-1 font-mono" value={requestForm.id} readOnly />
                    </label>
                    <label className="text-sm text-white/65">
                      Status
                      <select className="select mt-1 w-full" value={requestForm.status} onChange={(event) => setRequestForm({ ...requestForm, status: event.target.value })}>
                        <option value="draft">draft</option>
                        <option value="approved">approved</option>
                        <option value="promoted">promoted</option>
                      </select>
                    </label>
                    <label className="text-sm text-white/65">
                      Name
                      <input className="input mt-1" value={requestForm.name} onChange={(event) => setRequestForm({ ...requestForm, name: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Archetype
                      <select className="select mt-1 w-full" value={requestForm.archetype} onChange={(event) => setRequestForm({ ...requestForm, archetype: event.target.value })}>
                        {ARCHETYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-white/65">
                      Sector X
                      <input className="input mt-1" type="number" value={requestForm.sectorX} onChange={(event) => setRequestForm({ ...requestForm, sectorX: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Sector Y
                      <input className="input mt-1" type="number" value={requestForm.sectorY} onChange={(event) => setRequestForm({ ...requestForm, sectorY: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Position X
                      <input className="input mt-1" type="number" value={requestForm.x} onChange={(event) => setRequestForm({ ...requestForm, x: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Position Y
                      <input className="input mt-1" type="number" value={requestForm.y} onChange={(event) => setRequestForm({ ...requestForm, y: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Level Min
                      <input className="input mt-1" type="number" min="1" value={requestForm.levelMin} onChange={(event) => setRequestForm({ ...requestForm, levelMin: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Level Max
                      <input className="input mt-1" type="number" min="1" value={requestForm.levelMax} onChange={(event) => setRequestForm({ ...requestForm, levelMax: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Bounds Shape
                      <select className="select mt-1 w-full" value={requestForm.boundsShape} onChange={(event) => setRequestForm({ ...requestForm, boundsShape: event.target.value })}>
                        <option value="ellipse">ellipse</option>
                        <option value="rect">rect</option>
                        <option value="polygon">polygon</option>
                      </select>
                    </label>
                    <label className="text-sm text-white/65">
                      Activation Radius
                      <input className="input mt-1" type="number" min="0" value={requestForm.activationRadius} onChange={(event) => setRequestForm({ ...requestForm, activationRadius: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Width
                      <input className="input mt-1" type="number" min="1" value={requestForm.width} onChange={(event) => setRequestForm({ ...requestForm, width: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Height
                      <input className="input mt-1" type="number" min="1" value={requestForm.height} onChange={(event) => setRequestForm({ ...requestForm, height: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Hub Name
                      <input className="input mt-1" value={requestForm.hubName} onChange={(event) => setRequestForm({ ...requestForm, hubName: event.target.value })} />
                    </label>
                    <label className="text-sm text-white/65">
                      Contact Name
                      <input className="input mt-1" value={requestForm.contactName} onChange={(event) => setRequestForm({ ...requestForm, contactName: event.target.value })} />
                    </label>
                    {(requestForm.archetype === "friendly_hub_under_siege" || requestForm.archetype === "pirate_stronghold") ? (
                      <label className="text-sm text-white/65">
                        Elite Name
                        <input className="input mt-1" value={requestForm.eliteName} onChange={(event) => setRequestForm({ ...requestForm, eliteName: event.target.value })} />
                      </label>
                    ) : null}
                    {requestForm.archetype === "npc_scan_habitat" ? (
                      <label className="text-sm text-white/65">
                        NPC Count
                        <input className="input mt-1" type="number" min="3" value={requestForm.npcCount} onChange={(event) => setRequestForm({ ...requestForm, npcCount: event.target.value })} />
                      </label>
                    ) : null}
                    {requestForm.archetype === "mining_colony" ? (
                      <>
                        <label className="text-sm text-white/65">
                          Asteroid Count
                          <input className="input mt-1" type="number" min="4" value={requestForm.asteroidCount} onChange={(event) => setRequestForm({ ...requestForm, asteroidCount: event.target.value })} />
                        </label>
                        <label className="text-sm text-white/65">
                          Scan Count
                          <input className="input mt-1" type="number" min="1" value={requestForm.scanCount} onChange={(event) => setRequestForm({ ...requestForm, scanCount: event.target.value })} />
                        </label>
                        <label className="text-sm text-white/65">
                          Mine Count
                          <input className="input mt-1" type="number" min="1" value={requestForm.mineCount} onChange={(event) => setRequestForm({ ...requestForm, mineCount: event.target.value })} />
                        </label>
                        <label className="text-sm text-white/65">
                          Ore Item ID
                          <input className="input mt-1" type="number" min="1" value={requestForm.oreItemId} onChange={(event) => setRequestForm({ ...requestForm, oreItemId: event.target.value })} />
                        </label>
                        <label className="text-sm text-white/65">
                          Ore Count
                          <input className="input mt-1" type="number" min="1" value={requestForm.oreCount} onChange={(event) => setRequestForm({ ...requestForm, oreCount: event.target.value })} />
                        </label>
                      </>
                    ) : null}
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                      Active
                      <input type="checkbox" checked={requestForm.active} onChange={(event) => setRequestForm({ ...requestForm, active: event.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                      Map POI
                      <input type="checkbox" checked={requestForm.poiMap} onChange={(event) => setRequestForm({ ...requestForm, poiMap: event.target.checked })} />
                    </label>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Generator Stage Placements</div>
                        <div className="mt-1 text-xs text-white/45">These are written into the request and used by the Godot generator when it creates the zone.</div>
                      </div>
                      <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => setRequestForm({ ...requestForm, stages: [...requestForm.stages, blankStageForm()] })}>
                        Add Stage
                      </button>
                    </div>
                    <div className="space-y-3">
                      {requestForm.stages.map((stage, index) => (
                        <div key={stage.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="grid gap-3 md:grid-cols-[1fr_110px_110px_auto]">
                            <label className="text-sm text-white/65">
                              Stage
                              <select className="select mt-1 w-full" value={stage.stageId} onChange={(event) => updateRequestStage(index, { stageId: event.target.value })}>
                                <option value="">Select stage</option>
                                {workspace.stageCatalog.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm text-white/65">
                              X
                              <input className="input mt-1" type="number" value={stage.posX} onChange={(event) => updateRequestStage(index, { posX: event.target.value })} />
                            </label>
                            <label className="text-sm text-white/65">
                              Y
                              <input className="input mt-1" type="number" value={stage.posY} onChange={(event) => updateRequestStage(index, { posY: event.target.value })} />
                            </label>
                            <button className="mt-6 rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={() => removeRequestStage(index)}>
                              Remove
                            </button>
                          </div>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs text-white/50">Extra JSON</summary>
                            <textarea className="input mt-2 min-h-24 font-mono text-xs" value={stage.extraJson} onChange={(event) => updateRequestStage(index, { extraJson: event.target.value })} />
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                {zoneForm ? (
                  <Section title="Generated Zone" description="Edit the generated zone placement and stage placements before promotion, or adjust promoted core generated areas.">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-white/65">
                        Editing File
                        <select
                          className="select mt-1 w-full"
                          value={zoneForm.target}
                          onChange={(event) => {
                            const nextTarget = event.target.value as "staged" | "core";
                            const nextForm = createZoneFormForTarget(selectedEntry, nextTarget);
                            if (nextForm) setZoneForm(nextForm);
                          }}
                          disabled={!selectedEntry.staged.zone || !selectedEntry.core.zone}
                        >
                          {selectedEntry.staged.zone ? <option value="staged">staged generated_areas.json</option> : null}
                          {selectedEntry.core.zone ? <option value="core">core generated_areas.json</option> : null}
                        </select>
                      </label>
                      <label className="text-sm text-white/65">
                        Zone Name
                        <input className="input mt-1" value={zoneForm.name} onChange={(event) => setZoneForm({ ...zoneForm, name: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Sector X
                        <input className="input mt-1" type="number" value={zoneForm.sectorX} onChange={(event) => setZoneForm({ ...zoneForm, sectorX: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Sector Y
                        <input className="input mt-1" type="number" value={zoneForm.sectorY} onChange={(event) => setZoneForm({ ...zoneForm, sectorY: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Zone X
                        <input className="input mt-1" type="number" value={zoneForm.posX} onChange={(event) => setZoneForm({ ...zoneForm, posX: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Zone Y
                        <input className="input mt-1" type="number" value={zoneForm.posY} onChange={(event) => setZoneForm({ ...zoneForm, posY: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Bounds Shape
                        <select className="select mt-1 w-full" value={zoneForm.boundsShape} onChange={(event) => setZoneForm({ ...zoneForm, boundsShape: event.target.value })}>
                          <option value="ellipse">ellipse</option>
                          <option value="rect">rect</option>
                          <option value="polygon">polygon</option>
                        </select>
                      </label>
                      <label className="text-sm text-white/65">
                        Activation Radius
                        <input className="input mt-1" type="number" value={zoneForm.activationRadius} onChange={(event) => setZoneForm({ ...zoneForm, activationRadius: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Bounds Width
                        <input className="input mt-1" type="number" value={zoneForm.boundsWidth} onChange={(event) => setZoneForm({ ...zoneForm, boundsWidth: event.target.value })} />
                      </label>
                      <label className="text-sm text-white/65">
                        Bounds Height
                        <input className="input mt-1" type="number" value={zoneForm.boundsHeight} onChange={(event) => setZoneForm({ ...zoneForm, boundsHeight: event.target.value })} />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                        Active
                        <input type="checkbox" checked={zoneForm.active} onChange={(event) => setZoneForm({ ...zoneForm, active: event.target.checked })} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                        Show HUD
                        <input type="checkbox" checked={zoneForm.showHudOnEnter} onChange={(event) => setZoneForm({ ...zoneForm, showHudOnEnter: event.target.checked })} />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                        Map POI
                        <input type="checkbox" checked={zoneForm.poiMap} onChange={(event) => setZoneForm({ ...zoneForm, poiMap: event.target.checked })} />
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">Stage Placements</div>
                          <div className="mt-1 text-xs text-white/45">These are saved inside the generated zone entry.</div>
                        </div>
                        <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => setZoneForm({ ...zoneForm, stages: [...zoneForm.stages, blankStageForm()] })}>
                          Add Stage
                        </button>
                      </div>
                      <div className="space-y-3">
                        {zoneForm.stages.map((stage, index) => (
                          <div key={stage.key} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="grid gap-3 md:grid-cols-[1fr_110px_110px_auto]">
                              <label className="text-sm text-white/65">
                                Stage
                                <select className="select mt-1 w-full" value={stage.stageId} onChange={(event) => updateStage(index, { stageId: event.target.value })}>
                                  <option value="">Select stage</option>
                                  {workspace.stageCatalog.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                      {entry.id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-sm text-white/65">
                                X
                                <input className="input mt-1" type="number" value={stage.posX} onChange={(event) => updateStage(index, { posX: event.target.value })} />
                              </label>
                              <label className="text-sm text-white/65">
                                Y
                                <input className="input mt-1" type="number" value={stage.posY} onChange={(event) => updateStage(index, { posY: event.target.value })} />
                              </label>
                              <button className="mt-6 rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={() => removeStage(index)}>
                                Remove
                              </button>
                            </div>
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs text-white/50">Extra JSON</summary>
                              <textarea className="input mt-2 min-h-24 font-mono text-xs" value={stage.extraJson} onChange={(event) => updateStage(index, { extraJson: event.target.value })} />
                            </details>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Section>
                ) : (
                  <Section title="Generated Zone" description="No staged or core generated zone exists for this request yet. Run the generator after editing the request.">
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No generated zone artifact is available for this area.</div>
                  </Section>
                )}

                <Section title="Artifact Review" description="Read-only review of staged and promoted generated artifacts associated with this area ID.">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-base font-semibold text-white">Staged</div>
                      <ArtifactDetails artifacts={selectedEntry.staged} />
                    </div>
                    <div className="space-y-3">
                      <div className="text-base font-semibold text-white">Core</div>
                      <ArtifactDetails artifacts={selectedEntry.core} />
                    </div>
                  </div>
                </Section>
              </>
            ) : (
              <Section title="Generated Area" description="Select an area to review.">
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">No generated area is selected.</div>
              </Section>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
