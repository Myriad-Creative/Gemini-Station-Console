"use client";

import type { InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  MissionFilterState,
  MissionGraphEdge,
  MissionGraphNode,
  MissionImportDiagnostics,
  MissionImportSummary,
  MissionSortKey,
  NormalizedMission,
} from "@lib/mission-lab/types";
import { createDefaultMissionFilterState } from "@lib/mission-lab/filters";
import { humanizeToken } from "@lib/mission-lab/utils";
import MissionFlow from "@components/mission-lab/MissionFlow";
import { MissionChainCard } from "@components/mission-lab/MissionCard";
import MissionDetailPanel from "@components/mission-lab/MissionDetailPanel";
import MissionDiagnosticsPanel from "@components/mission-lab/MissionDiagnosticsPanel";

type FilterOptions = {
  folders: string[];
  categories: string[];
  arcs: string[];
  tags: string[];
  factions: string[];
  classes: string[];
  modes: string[];
  objectiveTypes: string[];
  minLevel: number | null;
  maxLevel: number | null;
};

type GraphFocus = {
  nodeIds: string[];
  edgeIds: string[];
  orderedNodeIds: string[];
};

const SESSION_STORAGE_KEY = "gemini.console.mission-lab.session.v1";
const DEFAULT_FILTERS = createDefaultMissionFilterState();

function buildFilterParams(filters: MissionFilterState) {
  const params = new URLSearchParams();
  const arrayKeys: Array<keyof Pick<
    MissionFilterState,
    "folders" | "categories" | "arcs" | "tags" | "factions" | "classes" | "modes" | "objectiveTypes"
  >> = ["folders", "categories", "arcs", "tags", "factions", "classes", "modes", "objectiveTypes"];

  params.set("search", filters.search);
  for (const key of arrayKeys) {
    const values = filters[key];
    if (values.length) values.forEach((value) => params.append(key, value));
    else params.append(key, "");
  }
  params.set("levelMin", filters.levelMin);
  params.set("levelMax", filters.levelMax);
  params.set("hasPrerequisites", filters.hasPrerequisites);
  params.set("repeatable", filters.repeatable);
  params.set("sortBy", filters.sortBy);
  params.set("sortDirection", filters.sortDirection);
  params.set("selectedMissionKey", filters.selectedMissionKey ?? "");
  params.set("focusedMissionKey", filters.focusedMissionKey ?? "");

  return params;
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active ? "bg-accent text-black" : "border border-white/10 text-white/75 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function summarizeSelectedValues(label: string, selected: string[]) {
  if (!selected.length) return `All ${label.toLowerCase()}`;
  if (selected.length === 1) return selected[0];
  if (selected.length === 2) return `${selected[0]}, ${selected[1]}`;
  return `${selected.length} selected`;
}

function DropdownMultiSelectField({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <details className="group mt-1">
        <summary className="select flex min-h-11 list-none cursor-pointer items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <span className={`truncate ${selected.length ? "text-white" : "text-white/50"}`}>{summarizeSelectedValues(label, selected)}</span>
          <span className="text-xs text-white/45 transition group-open:rotate-180">v</span>
        </summary>
        <div className="mt-2 rounded-xl border border-white/10 bg-[#091321] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.24em] text-white/35">{values.length} options</div>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.2em] text-cyan-100/80 hover:text-cyan-50 disabled:text-white/30"
              onClick={(event) => {
                event.preventDefault();
                onChange([]);
              }}
              disabled={!selected.length}
            >
              Clear
            </button>
          </div>

          {values.length ? (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {values.map((value) => {
                const checked = selected.includes(value);
                return (
                  <label
                    key={`${label}-${value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/80 hover:border-cyan-300/20 hover:bg-cyan-300/[0.04]"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25"
                      checked={checked}
                      onChange={() =>
                        onChange(checked ? selected.filter((entry) => entry !== value) : [...selected, value])
                      }
                    />
                    <span className="min-w-0 break-words">{value}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-white/45">No options available.</div>
          )}
        </div>
      </details>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card py-10 text-center">
      <div className="text-xl font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-white/55">{body}</div>
    </div>
  );
}

function exportMissionsToCsv(rows: NormalizedMission[]) {
  const header = [
    "title",
    "id",
    "level",
    "folder",
    "category",
    "faction",
    "class",
    "mode",
    "objective_count",
    "prerequisite_count",
    "repeatable",
    "arcs",
    "tags",
    "relative_path",
  ];

  const lines = [
    header.join(","),
    ...rows.map((mission) =>
      [
        mission.title,
        mission.id,
        mission.level ?? "",
        mission.folderName,
        mission.derivedCategory ?? "",
        mission.faction ?? "",
        mission.classLabel,
        mission.primaryMode ?? "",
        mission.objectiveCount,
        mission.prerequisiteCount,
        mission.repeatable ? "yes" : "no",
        mission.arcs.join(" | "),
        mission.tags.join(" | "),
        mission.relativePath,
      ]
        .map((value) => `"${String(value).replace(/"/g, "\"\"")}"`)
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "mission-lab-export.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function MissionLabApp() {
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"import" | "browser" | "map" | "diagnostics">("import");
  const [mapMode, setMapMode] = useState<"graph" | "chain">("graph");
  const [filters, setFilters] = useState<MissionFilterState>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<MissionImportSummary | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [rows, setRows] = useState<NormalizedMission[]>([]);
  const [selectedMission, setSelectedMission] = useState<NormalizedMission | null>(null);
  const [detailMissionKey, setDetailMissionKey] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<MissionImportDiagnostics | null>(null);
  const [graphNodes, setGraphNodes] = useState<MissionGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<MissionGraphEdge[]>([]);
  const [graphFocus, setGraphFocus] = useState<GraphFocus>({ nodeIds: [], edgeIds: [], orderedNodeIds: [] });
  const [status, setStatus] = useState<{ tone: "neutral" | "success" | "error"; message: string }>({
    tone: "neutral",
    message: "Import a mission zip or folder to start a read-only Mission Lab workspace.",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [centerSignal, setCenterSignal] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      setSessionId(stored);
      return;
    }

    const nextSessionId = window.crypto?.randomUUID?.() ?? `mission-lab-${Date.now()}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);
  }, []);

  useEffect(() => {
    const activeSessionId = sessionId;
    if (!activeSessionId) return;
    let cancelled = false;
    const filterParams = buildFilterParams(filters).toString();

    async function loadWorkspace() {
      setIsLoading(true);
      try {
        const headers: Record<string, string> = { "x-mission-lab-session": activeSessionId as string };
        const [missionsResponse, graphResponse, diagnosticsResponse] = await Promise.all([
          fetch(`/api/mission-lab/missions?${filterParams}`, { headers }),
          fetch(`/api/mission-lab/graph?${filterParams}`, { headers }),
          fetch("/api/mission-lab/diagnostics", { headers }),
        ]);

        const [missionsJson, graphJson, diagnosticsJson] = await Promise.all([
          missionsResponse.json(),
          graphResponse.json(),
          diagnosticsResponse.json(),
        ]);

        if (cancelled) return;

        setSummary(missionsJson.summary ?? null);
        setOptions(missionsJson.options ?? null);
        setRows(Array.isArray(missionsJson.rows) ? missionsJson.rows : []);
        setSelectedMission(missionsJson.selectedMission ?? null);
        setDiagnostics(diagnosticsJson.diagnostics ?? null);
        setGraphNodes(Array.isArray(graphJson.nodes) ? graphJson.nodes : []);
        setGraphEdges(Array.isArray(graphJson.edges) ? graphJson.edges : []);
        setGraphFocus(graphJson.focus ?? { nodeIds: [], edgeIds: [], orderedNodeIds: [] });
        setFilters(missionsJson.filters ?? DEFAULT_FILTERS);
      } catch (error) {
        if (cancelled) return;
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [sessionId, JSON.stringify(filters), refreshToken]);

  useEffect(() => {
    if (!detailMissionKey) return;
    if (!rows.some((mission) => mission.key === detailMissionKey)) setDetailMissionKey(null);
  }, [rows, detailMissionKey]);

  async function importZip(file: File) {
    const activeSessionId = sessionId;
    if (!activeSessionId) return;
    setImporting(true);
    setStatus({ tone: "neutral", message: `Importing ${file.name}…` });

    try {
      const formData = new FormData();
      formData.set("sourceType", "zip");
      formData.set("file", file);
      const response = await fetch("/api/mission-lab/import", {
        method: "POST",
        headers: { "x-mission-lab-session": activeSessionId as string },
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Zip import failed.");

      setFilters(payload.filters ?? DEFAULT_FILTERS);
      setStatus({
        tone: "success",
        message: `Imported ${payload.summary?.totalMissions ?? 0} missions from ${payload.summary?.sourceLabel ?? file.name}.`,
      });
      setActiveTab("browser");
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }

  async function importFolder(fileList: FileList | null) {
    const activeSessionId = sessionId;
    if (!activeSessionId || !fileList?.length) return;
    setImporting(true);
    setStatus({ tone: "neutral", message: `Importing ${fileList.length} selected files…` });

    try {
      const formData = new FormData();
      formData.set("sourceType", "folder");
      const files = Array.from(fileList);
      for (const file of files) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        formData.append("files", file);
        formData.append("relativePaths", relativePath);
      }

      const response = await fetch("/api/mission-lab/import", {
        method: "POST",
        headers: { "x-mission-lab-session": activeSessionId as string },
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Folder import failed.");

      setFilters(payload.filters ?? DEFAULT_FILTERS);
      setStatus({
        tone: "success",
        message: `Imported ${payload.summary?.totalMissions ?? 0} missions from the selected folder.`,
      });
      setActiveTab("browser");
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  async function clearWorkspace() {
    const activeSessionId = sessionId;
    if (!activeSessionId) return;
    await fetch("/api/mission-lab/import", {
      method: "DELETE",
      headers: { "x-mission-lab-session": activeSessionId as string },
    });
    setFilters(DEFAULT_FILTERS);
    setDetailMissionKey(null);
    setActiveTab("import");
    setStatus({
      tone: "neutral",
      message: "Cleared the current Mission Lab workspace.",
    });
    setRefreshToken((value) => value + 1);
  }

  function updateArrayFilter(
    key: keyof Pick<MissionFilterState, "folders" | "categories" | "arcs" | "tags" | "factions" | "classes" | "modes" | "objectiveTypes">,
    nextValue: string[],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: nextValue,
      focusedMissionKey: current.focusedMissionKey,
    }));
  }

  function selectMission(missionKey: string, openDetail = false) {
    setFilters((current) => ({
      ...current,
      selectedMissionKey: missionKey,
      focusedMissionKey: missionKey,
    }));
    if (openDetail) setDetailMissionKey(missionKey);
  }

  const detailMission = rows.find((mission) => mission.key === detailMissionKey) ?? null;
  const missionByKey = Object.fromEntries(rows.map((mission) => [mission.key, mission])) as Record<string, NormalizedMission>;
  const workspaceContent =
    activeTab === "browser" ? (
      summary ? (
        <div className="card overflow-x-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm text-white/60">
              Showing <span className="text-white">{rows.length}</span> of <span className="text-white">{summary.totalMissions}</span> imported
              missions.
            </div>
            {isLoading ? <div className="text-sm text-white/45">Refreshing…</div> : null}
          </div>

          <table className="table min-w-full">
            <thead>
              <tr>
                <th>Title</th>
                <th>ID</th>
                <th>Level</th>
                <th>Folder</th>
                <th>Faction</th>
                <th>Mode</th>
                <th>Objectives</th>
                <th>Prereqs</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((mission) => (
                  <tr
                    key={mission.key}
                    className={`cursor-pointer ${filters.selectedMissionKey === mission.key ? "bg-cyan-300/5" : ""}`}
                    onClick={() => {
                      selectMission(mission.key, true);
                    }}
                  >
                    <td className="font-medium">{mission.title}</td>
                    <td className="text-white/65">{mission.id}</td>
                    <td>{mission.level ?? "?"}</td>
                    <td>{mission.folderName}</td>
                    <td>{mission.faction ?? "None"}</td>
                    <td>{humanizeToken(mission.primaryMode)}</td>
                    <td>{mission.objectiveCount}</td>
                    <td>{mission.prerequisiteCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-white/50">
                    No missions match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No workspace imported" body="Use the Import tab to load a mission zip or a missions folder." />
      )
    ) : activeTab === "map" ? (
      summary ? (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xl font-semibold text-white">Mission Map</div>
                <div className="mt-1 text-sm text-white/55">Edges follow explicit mission prerequisites only. Disconnected missions stay visible.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-sm ${mapMode === "graph" ? "bg-accent text-black" : "border border-white/10 text-white/75 hover:bg-white/5"}`}
                  onClick={() => setMapMode("graph")}
                >
                  Full Graph
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm ${mapMode === "chain" ? "bg-accent text-black" : "border border-white/10 text-white/75 hover:bg-white/5"}`}
                  onClick={() => setMapMode("chain")}
                >
                  Focused Chain
                </button>
                <button
                  className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                  onClick={() => setCenterSignal((value) => value + 1)}
                  disabled={!filters.selectedMissionKey}
                >
                  Center on Selected
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="label">Focused Mission</div>
                <select
                  className="select mt-1 w-full"
                  value={filters.focusedMissionKey ?? ""}
                  onChange={(event) => selectMission(event.target.value)}
                >
                  {rows.map((mission) => (
                    <option key={mission.key} value={mission.key}>
                      {mission.title} ({mission.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-white/55 lg:text-right">
                <div>Visible missions: {graphNodes.length}</div>
                <div>Visible edges: {graphEdges.length}</div>
              </div>
            </div>
          </div>

          {mapMode === "graph" ? (
            <MissionFlow
              nodes={graphNodes}
              edges={graphEdges}
              selectedMissionKey={filters.selectedMissionKey}
              focusNodeIds={graphFocus.nodeIds}
              focusEdgeIds={graphFocus.edgeIds}
              centerSignal={centerSignal}
              onSelect={(missionKey) => {
                selectMission(missionKey, true);
              }}
            />
          ) : graphFocus.orderedNodeIds.length ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-0">
              {graphFocus.orderedNodeIds.map((missionKey, index) => {
                const mission = missionByKey[missionKey];
                if (!mission) return null;

                return (
                  <div key={mission.key} className="flex w-full flex-col items-center">
                    <div className="w-full">
                      <MissionChainCard
                        mission={mission}
                        selected={filters.selectedMissionKey === mission.key}
                        onClick={() => {
                          selectMission(mission.key, true);
                        }}
                      />
                    </div>
                    {index < graphFocus.orderedNodeIds.length - 1 ? <div className="h-14 w-px bg-cyan-300/30" /> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No focused chain available" body="Select a mission that exists in the current filtered set." />
          )}
        </div>
      ) : (
        <EmptyState title="No workspace imported" body="Use the Import tab to load a mission zip or a missions folder." />
      )
    ) : activeTab === "diagnostics" ? (
      summary ? (
        <MissionDiagnosticsPanel summary={summary} diagnostics={diagnostics} />
      ) : (
        <EmptyState title="No workspace imported" body="Use the Import tab to load a mission zip or a missions folder." />
      )
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title mb-1">Mission Lab</h1>
          <p className="max-w-3xl text-sm leading-6 text-white/65">
            Import a mission zip or mission folder, normalize tolerant mission data in an isolated workspace, browse and filter the
            full set, and inspect prerequisite chains in graph or chain form.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton label="Import" active={activeTab === "import"} onClick={() => setActiveTab("import")} />
          <TabButton label="Browser" active={activeTab === "browser"} onClick={() => setActiveTab("browser")} />
          <TabButton label="Map" active={activeTab === "map"} onClick={() => setActiveTab("map")} />
          <TabButton label="Diagnostics" active={activeTab === "diagnostics"} onClick={() => setActiveTab("diagnostics")} />
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          status.tone === "error"
            ? "border-red-400/30 bg-red-400/10 text-red-100"
            : status.tone === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
              : "border-white/10 bg-white/5 text-white/70"
        }`}
      >
        {status.message}
      </div>

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Imported Missions" value={summary.totalMissions} />
          <SummaryCard label="Folders" value={summary.totalFolders} />
          <SummaryCard label="Prerequisite Edges" value={summary.totalPrerequisiteEdges} />
          <SummaryCard label="Parse Warnings / Errors" value={`${summary.parseWarnings} / ${summary.parseErrors}`} />
        </div>
      ) : null}

      {activeTab === "import" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card space-y-5">
            <div>
              <div className="text-xl font-semibold text-white">Import Workspace</div>
              <div className="mt-2 text-sm text-white/60">
                Mission Lab is read-only. Imported data stays isolated from the manifest-backed console store and can be cleared at any
                time.
              </div>
            </div>

            <div
              className="rounded-2xl border border-dashed border-cyan-300/25 bg-[#091321] px-6 py-12 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const zipFile = Array.from(event.dataTransfer.files).find((file) => file.name.toLowerCase().endsWith(".zip"));
                if (zipFile) {
                  void importZip(zipFile);
                } else {
                  setStatus({
                    tone: "error",
                    message: "Drag and drop expects a .zip file. Use the folder picker for direct mission-folder imports.",
                  });
                }
              }}
            >
              <div className="text-2xl font-semibold text-white">Drop a missions zip here</div>
              <div className="mt-2 text-sm text-white/55">Or use the controls below to import a zip file or a selected missions folder.</div>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button className="btn" onClick={() => zipInputRef.current?.click()} disabled={importing}>
                  Choose Zip
                </button>
                <button
                  className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={importing}
                >
                  Choose Folder
                </button>
                <button
                  className="rounded border border-red-400/25 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                  onClick={() => void clearWorkspace()}
                  disabled={importing}
                >
                  Clear Workspace
                </button>
              </div>
            </div>

            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importZip(file);
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              multiple
              {...({ webkitdirectory: "true", directory: "true" } as InputHTMLAttributes<HTMLInputElement> & {
                webkitdirectory?: string;
                directory?: string;
              })}
              onChange={(event) => void importFolder(event.target.files)}
            />
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Workspace Summary</div>
            {summary ? (
              <div className="space-y-3 text-sm text-white/70">
                <div>
                  Source: <span className="text-white">{summary.sourceType}</span>
                  {summary.sourceLabel ? <span className="text-white/60"> ({summary.sourceLabel})</span> : null}
                </div>
                <div>Imported: {new Date(summary.importedAt).toLocaleString()}</div>
                <div>Missions: {summary.totalMissions}</div>
                <div>Folders: {summary.totalFolders}</div>
                <div>Prerequisite edges: {summary.totalPrerequisiteEdges}</div>
                <div>Warnings: {summary.parseWarnings}</div>
                <div>Errors: {summary.parseErrors}</div>
              </div>
            ) : (
              <div className="text-sm text-white/55">No Mission Lab workspace is currently loaded.</div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab !== "import" ? (
        summary ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
            <aside className="card h-fit space-y-4 xl:sticky xl:top-24">
              <div className="space-y-1">
                <div className="text-xl font-semibold text-white">Shared Filters</div>
                <div className="text-sm text-white/55">Browser, Map, and Diagnostics stay aligned to the same mission selection and filter set.</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button className="btn w-full" onClick={() => exportMissionsToCsv(rows)} disabled={!rows.length}>
                  Export CSV
                </button>
                <button
                  className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Reset Filters
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="label">Search</div>
                  <input
                    className="input mt-1"
                    value={filters.search}
                    placeholder="Search title, id, folder, tag, arc, or faction"
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  />
                </div>

                <div>
                  <div className="label">Level</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="input min-w-0 flex-1"
                      value={filters.levelMin}
                      placeholder={String(options?.minLevel ?? "")}
                      aria-label="Level minimum"
                      onChange={(event) => setFilters((current) => ({ ...current, levelMin: event.target.value }))}
                    />
                    <span className="text-sm text-white/45">to</span>
                    <input
                      className="input min-w-0 flex-1"
                      value={filters.levelMax}
                      placeholder={String(options?.maxLevel ?? "")}
                      aria-label="Level maximum"
                      onChange={(event) => setFilters((current) => ({ ...current, levelMax: event.target.value }))}
                    />
                  </div>
                </div>

                <DropdownMultiSelectField
                  label="Folder"
                  values={options?.folders ?? []}
                  selected={filters.folders}
                  onChange={(next) => updateArrayFilter("folders", next)}
                />
                <DropdownMultiSelectField
                  label="Derived Category"
                  values={options?.categories ?? []}
                  selected={filters.categories}
                  onChange={(next) => updateArrayFilter("categories", next)}
                />
                <DropdownMultiSelectField label="Arc" values={options?.arcs ?? []} selected={filters.arcs} onChange={(next) => updateArrayFilter("arcs", next)} />
                <DropdownMultiSelectField label="Tag" values={options?.tags ?? []} selected={filters.tags} onChange={(next) => updateArrayFilter("tags", next)} />
                <DropdownMultiSelectField
                  label="Faction"
                  values={options?.factions ?? []}
                  selected={filters.factions}
                  onChange={(next) => updateArrayFilter("factions", next)}
                />
                <DropdownMultiSelectField
                  label="Class"
                  values={options?.classes ?? []}
                  selected={filters.classes}
                  onChange={(next) => updateArrayFilter("classes", next)}
                />
                <DropdownMultiSelectField label="Mode" values={options?.modes ?? []} selected={filters.modes} onChange={(next) => updateArrayFilter("modes", next)} />
                <DropdownMultiSelectField
                  label="Objective Type"
                  values={options?.objectiveTypes ?? []}
                  selected={filters.objectiveTypes}
                  onChange={(next) => updateArrayFilter("objectiveTypes", next)}
                />

                <div>
                  <div className="label">Has Prerequisites</div>
                  <select
                    className="select mt-1 w-full"
                    value={filters.hasPrerequisites}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        hasPrerequisites: event.target.value as MissionFilterState["hasPrerequisites"],
                      }))
                    }
                  >
                    <option value="all">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <div className="label">Repeatable</div>
                  <select
                    className="select mt-1 w-full"
                    value={filters.repeatable}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        repeatable: event.target.value as MissionFilterState["repeatable"],
                      }))
                    }
                  >
                    <option value="all">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <div className="label">Sort By</div>
                  <select
                    className="select mt-1 w-full"
                    value={filters.sortBy}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        sortBy: event.target.value as MissionSortKey,
                      }))
                    }
                  >
                    <option value="title">Title</option>
                    <option value="id">ID</option>
                    <option value="level">Level</option>
                    <option value="folder">Folder</option>
                    <option value="faction">Faction</option>
                    <option value="mode">Type / Mode</option>
                    <option value="objectiveCount">Objective Count</option>
                    <option value="prerequisiteCount">Prerequisite Count</option>
                  </select>
                </div>

                <div>
                  <div className="label">Direction</div>
                  <select
                    className="select mt-1 w-full"
                    value={filters.sortDirection}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        sortDirection: event.target.value === "desc" ? "desc" : "asc",
                      }))
                    }
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </aside>

            <div className="min-w-0">{workspaceContent}</div>
          </div>
        ) : (
          workspaceContent
        )
      ) : null}

      <MissionDetailPanel
        mission={detailMission}
        onClose={() => setDetailMissionKey(null)}
        onFocus={(missionKey) => {
          selectMission(missionKey);
          setActiveTab("map");
          setCenterSignal((value) => value + 1);
        }}
      />
    </div>
  );
}
