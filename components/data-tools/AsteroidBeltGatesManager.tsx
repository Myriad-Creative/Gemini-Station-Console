"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createDraftKey, createUniqueId } from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import { Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";
type GateDraft = {
  key: string;
  id: string;
  name: string;
  enabled: boolean;
  angleDegrees: string;
  widthPx: string;
  extraJson: string;
};
type GatesWorkspace = {
  defaultsWidthPx: string;
  gates: GateDraft[];
  extraJson: string;
  sourceLabel: string;
};

const BELT_MID_RADIUS = 375000;
const DEFAULT_WIDTH_PX = "2000";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberString(value: unknown, fallback = "") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, "");
}

function normalizeAngleDegrees(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function gatePosition(angleDegrees: string) {
  const angle = Number(angleDegrees);
  if (!Number.isFinite(angle)) return { x: 0, y: 0 };
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(radians) * BELT_MID_RADIUS),
    y: Math.round(Math.sin(radians) * BELT_MID_RADIUS),
  };
}

function angleFromPosition(x: string, y: string, fallback: string) {
  const parsedX = Number(x);
  const parsedY = Number(y);
  if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY) || (Math.abs(parsedX) < 0.001 && Math.abs(parsedY) < 0.001)) return fallback;
  return numberString(normalizeAngleDegrees((Math.atan2(parsedY, parsedX) * 180) / Math.PI), fallback);
}

function gateExtraJson(rawGate: Record<string, unknown>) {
  const extra: Record<string, unknown> = { ...rawGate };
  for (const key of ["id", "name", "enabled", "angle_degrees", "angle_radians", "world_position", "x", "y", "width_px"]) {
    delete extra[key];
  }
  return Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "";
}

function importWorkspace(text: string, sourceLabel: string): GatesWorkspace {
  const parsed = parseTolerantJsonText(text);
  const root = isPlainRecord(parsed.value) ? parsed.value : {};
  const defaults = isPlainRecord(root.defaults) ? root.defaults : {};
  const extraRoot: Record<string, unknown> = { ...root };
  delete extraRoot.defaults;
  delete extraRoot.default_width_px;
  delete extraRoot.gates;
  const defaultWidth = root.default_width_px ?? defaults.width_px ?? DEFAULT_WIDTH_PX;
  const gates = Array.isArray(root.gates) ? root.gates : [];
  return {
    defaultsWidthPx: numberString(defaultWidth, DEFAULT_WIDTH_PX),
    gates: gates.map((entry, index) => {
      const gate = isPlainRecord(entry) ? entry : {};
      let angle = Number(gate.angle_degrees);
      if (!Number.isFinite(angle) && Number.isFinite(Number(gate.angle_radians))) {
        angle = (Number(gate.angle_radians) * 180) / Math.PI;
      }
      if (!Number.isFinite(angle) && isPlainRecord(gate.world_position)) {
        angle = (Math.atan2(Number(gate.world_position.y) || 0, Number(gate.world_position.x) || 0) * 180) / Math.PI;
      }
      if (!Number.isFinite(angle) && (gate.x !== undefined || gate.y !== undefined)) {
        angle = (Math.atan2(Number(gate.y) || 0, Number(gate.x) || 0) * 180) / Math.PI;
      }
      return {
        key: createDraftKey("asteroid-belt-gate"),
        id: stringValue(gate.id, `gate_${index + 1}`),
        name: stringValue(gate.name, stringValue(gate.id, `Gate ${index + 1}`)),
        enabled: typeof gate.enabled === "boolean" ? gate.enabled : true,
        angleDegrees: numberString(normalizeAngleDegrees(Number.isFinite(angle) ? angle : 0), "0"),
        widthPx: numberString(gate.width_px ?? defaultWidth, numberString(defaultWidth, DEFAULT_WIDTH_PX)),
        extraJson: gateExtraJson(gate),
      };
    }),
    extraJson: Object.keys(extraRoot).length ? JSON.stringify(extraRoot, null, 2) : "",
    sourceLabel,
  };
}

function createBlankWorkspace(): GatesWorkspace {
  return {
    defaultsWidthPx: DEFAULT_WIDTH_PX,
    gates: [],
    extraJson: "",
    sourceLabel: "New workspace",
  };
}

function sanitizeGateId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "new_gate"
  );
}

function parseExtraJson(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isPlainRecord(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed;
}

function validateWorkspace(workspace: GatesWorkspace | null) {
  if (!workspace) return ["No gate workspace is loaded."];
  const errors: string[] = [];
  const ids = new Set<string>();
  const defaultWidth = Number(workspace.defaultsWidthPx);
  if (!Number.isFinite(defaultWidth) || defaultWidth < 0) errors.push("Default width must be a non-negative number.");
  for (const gate of workspace.gates) {
    const id = gate.id.trim();
    if (!id) errors.push("Every gate needs an ID.");
    if (ids.has(id)) errors.push(`Gate ID "${id}" is duplicated.`);
    ids.add(id);
    const angle = Number(gate.angleDegrees);
    const width = Number(gate.widthPx);
    if (!Number.isFinite(angle)) errors.push(`Gate "${id || gate.name}" needs a valid angle.`);
    if (!Number.isFinite(width) || width < 0) errors.push(`Gate "${id || gate.name}" needs a non-negative width.`);
    try {
      parseExtraJson(gate.extraJson, `Extra JSON for ${id || gate.name}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    parseExtraJson(workspace.extraJson, "Top-level extra JSON");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function workspaceToJson(workspace: GatesWorkspace) {
  return {
    ...parseExtraJson(workspace.extraJson, "Top-level extra JSON"),
    defaults: {
      width_px: Number(workspace.defaultsWidthPx),
    },
    gates: workspace.gates.map((gate) => ({
      ...parseExtraJson(gate.extraJson, `Extra JSON for ${gate.id || gate.name}`),
      id: gate.id.trim(),
      name: gate.name.trim() || gate.id.trim(),
      enabled: gate.enabled,
      angle_degrees: normalizeAngleDegrees(Number(gate.angleDegrees)),
      width_px: Number(gate.widthPx),
    })),
  };
}

export default function AsteroidBeltGatesManager() {
  const [workspace, setWorkspace] = useState<GatesWorkspace | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading AsteroidBeltGates.json from the local game root...",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/settings/data/source?kind=asteroidBeltGates", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !payload?.ok || typeof payload.text !== "string") {
          const blank = createBlankWorkspace();
          setWorkspace(blank);
          setStatus({ tone: "neutral", message: payload?.error || "No AsteroidBeltGates.json was found. This editor started with a blank gate workspace." });
          return;
        }
        const nextWorkspace = importWorkspace(payload.text, payload.sourceLabel || "Local game source");
        setWorkspace(nextWorkspace);
        setSelectedKey(nextWorkspace.gates[0]?.key ?? null);
        setStatus({ tone: "success", message: `Loaded ${nextWorkspace.gates.length} asteroid belt gate${nextWorkspace.gates.length === 1 ? "" : "s"} from ${nextWorkspace.sourceLabel}.` });
      } catch (error) {
        if (cancelled) return;
        setWorkspace(createBlankWorkspace());
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGates = useMemo(() => {
    const query = search.trim().toLowerCase();
    const gates = workspace?.gates ?? [];
    return gates
      .filter((gate) => (query ? [gate.id, gate.name, gate.angleDegrees, gate.widthPx].join(" ").toLowerCase().includes(query) : true))
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [search, workspace]);
  const selectedGate = workspace?.gates.find((gate) => gate.key === selectedKey) ?? filteredGates[0] ?? null;
  const validationErrors = validateWorkspace(workspace);
  const enabledCount = workspace?.gates.filter((gate) => gate.enabled).length ?? 0;

  function updateSelectedGate(updater: (gate: GateDraft) => GateDraft) {
    if (!workspace || !selectedGate) return;
    setWorkspace({
      ...workspace,
      gates: workspace.gates.map((gate) => (gate.key === selectedGate.key ? updater(gate) : gate)),
    });
  }

  function addGate() {
    if (!workspace) return;
    const id = createUniqueId("new_gate", workspace.gates.map((gate) => gate.id));
    const nextGate: GateDraft = {
      key: createDraftKey("asteroid-belt-gate"),
      id,
      name: "New Gate",
      enabled: true,
      angleDegrees: "0",
      widthPx: workspace.defaultsWidthPx || DEFAULT_WIDTH_PX,
      extraJson: "",
    };
    setWorkspace({ ...workspace, gates: [...workspace.gates, nextGate] });
    setSelectedKey(nextGate.key);
  }

  function duplicateGate() {
    if (!workspace || !selectedGate) return;
    const id = createUniqueId(sanitizeGateId(`${selectedGate.id}_copy`), workspace.gates.map((gate) => gate.id));
    const nextGate = {
      ...selectedGate,
      key: createDraftKey("asteroid-belt-gate"),
      id,
      name: `${selectedGate.name || selectedGate.id} Copy`,
    };
    const selectedIndex = workspace.gates.findIndex((gate) => gate.key === selectedGate.key);
    const nextGates = [...workspace.gates.slice(0, selectedIndex + 1), nextGate, ...workspace.gates.slice(selectedIndex + 1)];
    setWorkspace({ ...workspace, gates: nextGates });
    setSelectedKey(nextGate.key);
  }

  function deleteGate() {
    if (!workspace || !selectedGate) return;
    const nextGates = workspace.gates.filter((gate) => gate.key !== selectedGate.key);
    setWorkspace({ ...workspace, gates: nextGates });
    setSelectedKey(nextGates[0]?.key ?? null);
  }

  async function saveToBuild() {
    if (!workspace || validationErrors.length || saving) return;
    setSaving(true);
    try {
      const asteroidBeltGates = workspaceToJson(workspace);
      const response = await fetch("/api/asteroid-belt-gates/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ asteroidBeltGates }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({ tone: "error", message: payload?.error || "Could not save AsteroidBeltGates.json into the configured game build." });
        return;
      }
      setStatus({ tone: "success", message: `Saved all ${payload.savedCount ?? workspace.gates.length} asteroid belt gates into the live AsteroidBeltGates.json file.` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  const selectedPosition = selectedGate ? gatePosition(selectedGate.angleDegrees) : { x: 0, y: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl">
          <h1 className="page-title mb-1">Asteroid Belt Gates</h1>
          <p className="text-sm text-white/70">
            Manage the gate gaps cut into the procedural asteroid belt. Position is derived from the gate angle at the belt mid-radius used by the game.
          </p>
        </div>
        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!workspace || validationErrors.length > 0 || saving} onClick={() => void saveToBuild()}>
          {saving ? "Saving..." : "Save All Gates To Build"}
        </button>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Gates" value={workspace?.gates.length ?? 0} />
        <SummaryCard label="Enabled" value={enabledCount} />
        <SummaryCard label="Disabled" value={(workspace?.gates.length ?? 0) - enabledCount} />
        <SummaryCard label="Default Width" value={workspace?.defaultsWidthPx ? `${workspace.defaultsWidthPx}px` : "Not set"} />
      </div>

      {validationErrors.length ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{validationErrors.join(" ")}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Section title="Gate Library" description="Search, create, clone, and select asteroid belt gate records.">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={addGate}>
              New Gate
            </button>
            <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-default disabled:opacity-40" disabled={!selectedGate} onClick={duplicateGate}>
              Duplicate
            </button>
            <button type="button" className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-default disabled:opacity-40" disabled={!selectedGate} onClick={deleteGate}>
              Delete
            </button>
            <Link href="/data/system-map" target="_blank" rel="noreferrer" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
              Open Map
            </Link>
          </div>

          <div>
            <div className="label">Search</div>
            <input className="input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gates by ID, name, angle, or width..." />
          </div>

          <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
            {filteredGates.map((gate) => {
              const pos = gatePosition(gate.angleDegrees);
              return (
                <button
                  key={gate.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedGate?.key === gate.key ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"
                  }`}
                  onClick={() => setSelectedKey(gate.key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{gate.name || gate.id}</div>
                      <div className="truncate font-mono text-xs text-white/45">{gate.id}</div>
                    </div>
                    <span className={`rounded px-2 py-1 text-xs ${gate.enabled ? "bg-emerald-300/15 text-emerald-100" : "bg-red-400/15 text-red-100"}`}>
                      {gate.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-white/50">
                    {numberString(gate.angleDegrees, "0")} deg · {gate.widthPx || "0"}px · {pos.x}, {pos.y}
                  </div>
                </button>
              );
            })}
            {!filteredGates.length ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No gates match the current search.</div> : null}
          </div>
        </Section>

        {selectedGate ? (
          <div className="space-y-6">
            <Section title="Gate Editor" description="Edit the game-facing gate fields. Position fields are derived from angle; changing X or Y recalculates the angle.">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <div className="label">Gate Name</div>
                  <input className="input mt-1" value={selectedGate.name} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, name: event.target.value }))} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <label className="block">
                  <div className="label">Gate ID</div>
                  <input className="input mt-1 font-mono" value={selectedGate.id} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, id: sanitizeGateId(event.target.value) }))} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                  <span>Enabled</span>
                  <input type="checkbox" checked={selectedGate.enabled} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, enabled: event.target.checked }))} />
                </label>
                <label className="block">
                  <div className="label">Width</div>
                  <input className="input mt-1" type="number" min="0" value={selectedGate.widthPx} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, widthPx: event.target.value }))} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <label className="block">
                  <div className="label">Angle Degrees</div>
                  <input className="input mt-1" type="number" value={selectedGate.angleDegrees} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, angleDegrees: event.target.value }))} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <label className="block">
                  <div className="label">Position X</div>
                  <input
                    className="input mt-1"
                    type="number"
                    value={selectedPosition.x}
                    onChange={(event) => updateSelectedGate((gate) => ({ ...gate, angleDegrees: angleFromPosition(event.target.value, String(selectedPosition.y), gate.angleDegrees) }))}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <label className="block">
                  <div className="label">Position Y</div>
                  <input
                    className="input mt-1"
                    type="number"
                    value={selectedPosition.y}
                    onChange={(event) => updateSelectedGate((gate) => ({ ...gate, angleDegrees: angleFromPosition(String(selectedPosition.x), event.target.value, gate.angleDegrees) }))}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <label className="block">
                  <div className="label">Default Width</div>
                  <input className="input mt-1" type="number" min="0" value={workspace?.defaultsWidthPx ?? ""} onChange={(event) => workspace && setWorkspace({ ...workspace, defaultsWidthPx: event.target.value })} onFocus={(event) => event.currentTarget.select()} />
                </label>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/55">
                The game turns angle and width into a missing arc in the belt. The displayed position is the midpoint of that gap on the belt centerline.
              </div>
            </Section>

            <Section title="Extra JSON" description="Optional unsupported properties are merged back into the gate or the top-level file on save.">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <div className="label">Gate Extra JSON</div>
                  <textarea className="input mt-1 min-h-[180px] font-mono text-sm" value={selectedGate.extraJson} onChange={(event) => updateSelectedGate((gate) => ({ ...gate, extraJson: event.target.value }))} />
                </label>
                <label className="block">
                  <div className="label">Top-Level Extra JSON</div>
                  <textarea className="input mt-1 min-h-[180px] font-mono text-sm" value={workspace?.extraJson ?? ""} onChange={(event) => workspace && setWorkspace({ ...workspace, extraJson: event.target.value })} />
                </label>
              </div>
            </Section>
          </div>
        ) : (
          <Section title="No Gate Selected" description="Create or select a gate to edit its live build fields.">
            <div className="text-sm text-white/45">No gate is selected.</div>
          </Section>
        )}
      </div>
    </div>
  );
}
