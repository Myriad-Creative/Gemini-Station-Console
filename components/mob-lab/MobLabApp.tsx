"use client";

import Link from "next/link";
import { ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DismissibleStatusBanner,
  StatusBanner,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { BUILT_IN_MOB_STAT_KEYS, MOB_SORT_OPTIONS } from "@lib/mob-lab/constants";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { MobDraft, MobSortKey, MobValidationIssue, MobLabWorkspace } from "@lib/mob-lab/types";
import {
  cloneMobDraft,
  createBlankMobDraft,
  createBlankScanTierDraft,
  createBlankMobWorkspace,
  deleteMobDraftAt,
  duplicateMobIdMap,
  importMobWorkspace,
  insertMobDraftAfter,
  stringifyMobWorkspace,
  stringifySingleMob,
  summarizeMobWorkspace,
  updateMobDraftAt,
  validateMobDrafts,
} from "@lib/mob-lab/utils";

function labelize(value: string) {
  if (!value) return "Unknown";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-4">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-sm text-white/55">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ArrayEditor({
  label,
  values,
  emptyLabel,
  addLabel,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
  addLabel: string;
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="label">{label}</div>
        <button
          type="button"
          className="rounded border border-white/10 px-2 py-1 text-xs text-white/75 hover:bg-white/5"
          onClick={() => onChange([...values, ""])}
        >
          {addLabel}
        </button>
      </div>
      {values.length ? (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="flex gap-2">
              <input
                className="input"
                value={value}
                placeholder={placeholder}
                onChange={(event) =>
                  onChange(values.map((current, currentIndex) => (currentIndex === index ? event.target.value : current)))
                }
              />
              <button
                type="button"
                className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">{emptyLabel}</div>
      )}
    </div>
  );
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function mergeTextareaPaste(currentValue: string, pastedText: string, selectionStart: number | null, selectionEnd: number | null) {
  const start = selectionStart ?? currentValue.length;
  const end = selectionEnd ?? currentValue.length;
  return `${currentValue.slice(0, start)}${pastedText}${currentValue.slice(end)}`;
}

export default function MobLabApp() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<MobLabWorkspace | null>(null);
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<MobLabWorkspace | null>(null);
  const [selectedMobKey, setSelectedMobKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState("");
  const [aiFilter, setAiFilter] = useState("");
  const [sortBy, setSortBy] = useState<MobSortKey>("display_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [pasteJson, setPasteJson] = useState("");
  const [status, setStatus] = useState<TimedStatusState>({
    tone: "neutral",
    message: "Mob Lab reads mobs.json directly from the active local game root in Settings.",
    dismissAfterMs: null,
  });
  const clearStatus = () =>
    setStatus({
      tone: "neutral",
      message: "Mob Lab reads mobs.json directly from the active local game root in Settings.",
      dismissAfterMs: null,
    });
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  const validation = useMemo(() => validateMobDrafts(workspace?.mobs ?? []), [workspace]);
  const validationByMobKey = useMemo(() => {
    const next = new Map<string, MobValidationIssue[]>();
    for (const issue of validation) {
      const current = next.get(issue.mobKey) ?? [];
      current.push(issue);
      next.set(issue.mobKey, current);
    }
    return next;
  }, [validation]);
  const duplicateIds = useMemo(() => duplicateMobIdMap(workspace?.mobs ?? []), [workspace]);
  const summary = useMemo(() => summarizeMobWorkspace(workspace, validation), [workspace, validation]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const factionOptions = useMemo(() => {
    return Array.from(new Set((workspace?.mobs ?? []).map((mob) => mob.faction.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [workspace]);
  const aiOptions = useMemo(() => {
    return Array.from(new Set((workspace?.mobs ?? []).map((mob) => mob.ai_type.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [workspace]);

  const filteredMobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = (workspace?.mobs ?? [])
      .filter((mob) => {
        if (!query) return true;
        const haystack = [mob.id, mob.display_name, mob.faction, mob.ai_type, mob.scene, mob.sprite].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .filter((mob) => (factionFilter ? mob.faction.trim() === factionFilter : true))
      .filter((mob) => (aiFilter ? mob.ai_type.trim() === aiFilter : true));

    filtered.sort((left, right) => {
      if (sortBy === "level") {
        const leftLevel = Number(left.level || -1);
        const rightLevel = Number(right.level || -1);
        return sortDirection === "asc" ? leftLevel - rightLevel : rightLevel - leftLevel;
      }

      const leftValue = (left[sortBy] || "").toString().toLowerCase();
      const rightValue = (right[sortBy] || "").toString().toLowerCase();
      return sortDirection === "asc" ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    });

    return filtered;
  }, [aiFilter, factionFilter, search, sortBy, sortDirection, workspace]);

  useEffect(() => {
    const mobs = workspace?.mobs ?? [];
    if (!mobs.length) {
      if (selectedMobKey !== null) setSelectedMobKey(null);
      return;
    }

    if (!selectedMobKey || !mobs.some((mob) => mob.key === selectedMobKey)) {
      setSelectedMobKey(filteredMobs[0]?.key ?? mobs[0]?.key ?? null);
      return;
    }

    if (filteredMobs.length && !filteredMobs.some((mob) => mob.key === selectedMobKey)) {
      setSelectedMobKey(filteredMobs[0]?.key ?? mobs[0]?.key ?? null);
    }
  }, [filteredMobs, selectedMobKey, workspace]);

  useEffect(() => {
    let cancelled = false;
    async function loadSharedWorkspace() {
      try {
        const response = await fetch("/api/settings/data/source?kind=mobs");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled && workspaceRef.current?.sourceType === "uploaded") {
            setWorkspace(null);
            setSelectedMobKey(null);
            setStatus({
              tone: "neutral",
              message: "No mobs.json was found under the active local game root. Set a valid Gemini Station folder in Settings first.",
            });
          }
          return;
        }
        if (cancelled) return;
        if (workspaceRef.current && workspaceRef.current.sourceType !== "uploaded") return;
        importText(payload.text, payload.sourceLabel || "Local game source", "uploaded");
      } catch {
        // Local game source may not be configured yet.
      }
    }

    void loadSharedWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const selectedMob = useMemo(() => {
    const mobs = workspace?.mobs ?? [];
    return mobs.find((mob) => mob.key === selectedMobKey) ?? filteredMobs[0] ?? mobs[0] ?? null;
  }, [filteredMobs, selectedMobKey, workspace]);
  const selectedIssues = selectedMob ? validationByMobKey.get(selectedMob.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const selectedDuplicateKeys =
    selectedMob && selectedMob.id.trim() ? (duplicateIds.get(selectedMob.id.trim()) ?? []).filter((key) => key !== selectedMob.key) : [];
  const spritePreviewSrc = selectedMob
    ? buildIconSrc(selectedMob.sprite || undefined, selectedMob.id || "mob", selectedMob.display_name || "Mob", sharedDataVersion)
    : null;
  const hailPortraitPreviewSrc = selectedMob
    ? buildIconSrc(
        selectedMob.hail_portrait || undefined,
        selectedMob.id || "mob",
        selectedMob.hail_name || selectedMob.display_name || "Mob",
        sharedDataVersion,
      )
    : null;

  function updateSelectedMob(updater: (current: MobDraft) => MobDraft) {
    if (!workspace || !selectedMob) return;
    setWorkspace(updateMobDraftAt(workspace, selectedMob.key, updater));
  }

  function importText(text: string, sourceLabel: string | null, sourceType: "uploaded" | "pasted") {
    try {
      const result = importMobWorkspace(text, sourceLabel, sourceType);
      setWorkspace(result.workspace);
      setSelectedMobKey(result.workspace.mobs[0]?.key ?? null);
      setStatus({
        tone: "success",
        message: result.warnings.length
          ? `Imported ${result.workspace.mobs.length} mobs.${sourceLabel ? ` Source: ${sourceLabel}.` : ""} ${result.warnings.join(" ")}`
          : `Imported ${result.workspace.mobs.length} mobs${sourceLabel ? ` from ${sourceLabel}` : ""}.`,
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

  async function importFile(file: File) {
    importText(await file.text(), file.name, "uploaded");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function loadPastedJson() {
    if (!pasteJson.trim()) {
      setStatus({
        tone: "error",
        message: "Paste mobs.json content into the JSON box before loading it.",
      });
      return;
    }
    importText(pasteJson, "Pasted JSON", "pasted");
  }

  function handlePasteJsonPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    const nextValue = mergeTextareaPaste(pasteJson, pastedText, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
    event.preventDefault();
    setPasteJson(nextValue);
    if (nextValue.trim()) {
      importText(nextValue, "Pasted JSON", "pasted");
    }
  }

  function startBlankWorkspace() {
    const nextWorkspace = createBlankMobWorkspace();
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextWorkspace.mobs[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: "Started a blank Mob Lab workspace.",
      dismissAfterMs: 4000,
    });
  }

  function addBlankMob() {
    if (!workspace) {
      startBlankWorkspace();
      return;
    }

    const nextMob = createBlankMobDraft(workspace.mobs.map((mob) => mob.id));
    const nextWorkspace = insertMobDraftAfter(workspace, selectedMob?.key ?? null, nextMob);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextMob.key);
    setStatus({
      tone: "success",
      message: `Created new mob draft "${nextMob.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function cloneSelected() {
    if (!workspace || !selectedMob) return;
    const nextMob = cloneMobDraft(selectedMob, workspace.mobs.map((mob) => mob.id));
    const nextWorkspace = insertMobDraftAfter(workspace, selectedMob.key, nextMob);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextMob.key);
    setStatus({
      tone: "success",
      message: `Cloned "${selectedMob.id}" into "${nextMob.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function deleteSelected() {
    if (!workspace || !selectedMob) return;
    if (!window.confirm(`Delete mob "${selectedMob.id || selectedMob.display_name || "untitled"}"?`)) return;

    const nextWorkspace = deleteMobDraftAt(workspace, selectedMob.key);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextWorkspace.mobs[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: `Deleted "${selectedMob.id || selectedMob.display_name || "untitled"}".`,
      dismissAfterMs: 4000,
    });
  }

  function handleWorkspaceExport(action: "download" | "copy") {
    if (!workspace) return;
    try {
      const contents = stringifyMobWorkspace(workspace);
      if (action === "download") {
        downloadTextFile("mobs.json", contents);
        setStatus({
          tone: "success",
          message: "Downloaded updated mobs.json.",
          dismissAfterMs: 7000,
        });
        return;
      }

      void copyToClipboard(contents).then(() =>
        setStatus({
          tone: "success",
          message: "Copied updated mobs.json to the clipboard.",
          dismissAfterMs: 7000,
        }),
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function handleCurrentMobCopy() {
    if (!selectedMob) return;
    try {
      const contents = stringifySingleMob(selectedMob);
      void copyToClipboard(contents).then(() =>
        setStatus({
          tone: "success",
          message: `Copied ${selectedMob.id || "current mob"} JSON to the clipboard.`,
          dismissAfterMs: 5000,
        }),
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  const hasWorkspaceErrors = validation.some((issue) => issue.level === "error");
  const workspaceSourceLabel =
    workspace?.sourceType === "uploaded" || workspace?.sourceType === "pasted"
      ? `${workspace.sourceLabel ?? "Local game source"} (${workspace.parseStrategy === "strict" ? "strict JSON" : "JSON5"})`
      : "Manual workspace";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title mb-1">Mob Lab</h1>
          <p className="max-w-3xl text-sm leading-6 text-white/65">
            Browse and manage the full mob roster from the active local game root, clone and edit existing mobs, create new mob IDs with
            collision alerts, and export the updated runtime file or copy JSON directly to the clipboard.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => handleWorkspaceExport("download")}>
            Download Updated mobs.json
          </button>
          <button
            className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
            disabled={!workspace || hasWorkspaceErrors}
            onClick={() => handleWorkspaceExport("copy")}
          >
            Copy Updated JSON
          </button>
        </div>
      </div>

      {status.tone === "neutral" ? (
        <StatusBanner tone={status.tone} message={status.message} />
      ) : (
        <DismissibleStatusBanner tone={status.tone} message={status.message} onDismiss={clearStatus} countdownSeconds={statusCountdown} />
      )}

      {workspace ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Workspace Mobs" value={summary.totalMobs} />
          <SummaryCard label="Factions" value={summary.factionCount} />
          <SummaryCard label="AI Types" value={summary.aiTypeCount} />
          <SummaryCard label="Duplicate IDs" value={summary.duplicateIdCount} accent={summary.duplicateIdCount ? "text-yellow-200" : undefined} />
          <SummaryCard label="Errors" value={summary.errorCount} accent={summary.errorCount ? "text-red-200" : undefined} />
        </div>
      ) : null}

      {!workspace ? (
        <>
          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">What Mob Lab Includes</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Browse mobs by name, ID, level, faction, and AI type.</div>
              <div>Clone existing mobs or create blank ones for new enemy/NPC work.</div>
              <div>Edit core fields, hail/comms data, loot tables, stats, services, scan fields, and extra runtime JSON.</div>
              <div>Get live duplicate-ID alerts and validation for invalid JSON blocks.</div>
              <div>Download the full updated `mobs.json`, copy the whole file JSON, or copy just the current mob JSON.</div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Local Game Root Required</div>
            <div className="text-sm leading-6 text-white/65">
              Mob Lab no longer loads separate `mobs.json` files. Set the Gemini Station local game root in Settings and the editor will
              automatically read `data/database/mobs/mobs.json` from that folder.
            </div>
            <div>
              <Link href="/settings" className="btn">
                Open Settings
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="card h-fit space-y-4 xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Mob Browser</div>
                <div className="mt-1 text-sm text-white/55">{workspaceSourceLabel}</div>
              </div>
              <button className="btn shrink-0" onClick={addBlankMob}>
                New Mob
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="label">Search</div>
                <input
                  className="input mt-1"
                  value={search}
                  placeholder="Search ID, name, faction, AI, scene..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div>
                <div className="label">Faction</div>
                <select className="select mt-1 w-full" value={factionFilter} onChange={(event) => setFactionFilter(event.target.value)}>
                  <option value="">All factions</option>
                  {factionOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="label">AI Type</div>
                <select className="select mt-1 w-full" value={aiFilter} onChange={(event) => setAiFilter(event.target.value)}>
                  <option value="">All AI types</option>
                  {aiOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <div className="label">Sort By</div>
                  <select className="select mt-1 w-full" value={sortBy} onChange={(event) => setSortBy(event.target.value as MobSortKey)}>
                    {MOB_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Direction</div>
                  <select
                    className="select mt-1 w-full"
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value === "desc" ? "desc" : "asc")}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filteredMobs.length ? (
                filteredMobs.map((mob) => {
                  const issues = validationByMobKey.get(mob.key) ?? [];
                  const hasErrors = issues.some((issue) => issue.level === "error");
                  const isDuplicate = duplicateIds.has(mob.id.trim());
                  const selected = selectedMob?.key === mob.key;

                  return (
                    <button
                      key={mob.key}
                      type="button"
                      onClick={() => setSelectedMobKey(mob.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                          : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-white">{mob.display_name || mob.id || "Untitled Mob"}</div>
                          <div className="mt-1 truncate text-xs text-white/50">{mob.id || "Missing ID"}</div>
                        </div>
                        <div className="rounded border border-white/10 px-2 py-1 text-xs text-white/70">Lv {mob.level || "?"}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {mob.faction ? <span className="badge">{mob.faction}</span> : null}
                        {mob.ai_type ? <span className="badge">{mob.ai_type}</span> : null}
                        {isDuplicate ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Duplicate ID</span> : null}
                        {hasErrors ? <span className="badge border border-red-300/20 bg-red-300/10 text-red-100">Needs Fixes</span> : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                  No mobs match the current browser filters.
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {selectedMob ? (
              <>
                <div className="card space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-semibold text-white">{selectedMob.display_name || selectedMob.id || "Untitled Mob"}</div>
                      <div className="mt-1 text-sm text-white/55">
                        Editing mob {workspace.mobs.findIndex((mob) => mob.key === selectedMob.key) + 1} of {workspace.mobs.length}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn" onClick={cloneSelected}>
                        Clone Mob
                      </button>
                      <button
                        className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
                        disabled={selectedHasErrors}
                        onClick={handleCurrentMobCopy}
                      >
                        Copy Current Mob JSON
                      </button>
                      <button
                        className="rounded border border-red-400/20 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                        onClick={deleteSelected}
                      >
                        Delete Mob
                      </button>
                    </div>
                  </div>

                  {selectedDuplicateKeys.length ? (
                    <div className="rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      This mob ID already exists on {selectedDuplicateKeys.length} other mob{selectedDuplicateKeys.length === 1 ? "" : "s"} in the
                      workspace. Change the ID before exporting.
                    </div>
                  ) : null}

                  {selectedIssues.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {selectedIssues.map((issue, index) => (
                        <div
                          key={`${issue.field}-${index}`}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            issue.level === "error"
                              ? "border-red-400/25 bg-red-400/10 text-red-100"
                              : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
                          }`}
                        >
                          <span className="font-medium">{labelize(issue.field)}:</span> {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <Section title="Identity" description="Core fields used to identify and spawn the mob.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Mob ID</div>
                      <input
                        className={`input mt-1 ${selectedDuplicateKeys.length ? "border-red-300/35" : ""}`}
                        value={selectedMob.id}
                        placeholder="PirateFighter"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, id: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Display Name</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.display_name}
                        placeholder="Pirate Raider"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, display_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Level</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.level}
                        placeholder="1"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, level: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Faction</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.faction}
                        placeholder="Mob"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, faction: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">AI Type</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.ai_type}
                        placeholder="BasicAI"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, ai_type: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Mob Tag</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mob_tag}
                        placeholder="red"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mob_tag: event.target.value }))}
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <div className="label">Scene</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scene}
                        placeholder="res://scenes/entities/PirateBasic.tscn"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scene: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Sprite</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.sprite}
                        placeholder="res://assets/ships/PirateFighter.png"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, sprite: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Mob End</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mob_end}
                        placeholder="0"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mob_end: event.target.value }))}
                      />
                    </div>
                    {spritePreviewSrc ? (
                      <div className="xl:col-span-2">
                        <div className="label">Sprite Preview</div>
                        <div className="mt-1 flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          <img src={spritePreviewSrc} alt={selectedMob.display_name || selectedMob.id || "Mob sprite"} className="h-full w-full object-contain" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Section>

                <Section title="Flags and Runtime Controls" description="Common booleans and runtime references for attack, vendors, POIs, and repairs.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <ToggleField label="Can Attack" checked={selectedMob.can_attack} onChange={(next) => updateSelectedMob((current) => ({ ...current, can_attack: next }))} />
                    <ToggleField label="Vendor" checked={selectedMob.is_vendor} onChange={(next) => updateSelectedMob((current) => ({ ...current, is_vendor: next }))} />
                    <ToggleField
                      label="POI Visible"
                      checked={selectedMob.poi_show}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, poi_show: next }))}
                    />
                    <ToggleField
                      label="POI Requires Discovery"
                      checked={selectedMob.poi_require_discovery}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, poi_require_discovery: next }))}
                    />
                    <ToggleField
                      label="Can Be Hailed"
                      checked={selectedMob.hail_can_hail_target}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, hail_can_hail_target: next }))}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Merchant Profile</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.merchant_profile}
                        placeholder="utf_support_vendor"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, merchant_profile: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Repair Cost</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.repair_cost}
                        placeholder="0"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, repair_cost: event.target.value }))}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Abilities, Services, and Comms" description="Edit array-style fields without touching raw JSON by hand.">
                  <div className="grid gap-6 xl:grid-cols-3">
                    <ArrayEditor
                      label="Abilities"
                      values={selectedMob.abilities}
                      emptyLabel="No abilities assigned."
                      addLabel="Add Ability"
                      placeholder="Ability ID"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, abilities: next }))}
                    />
                    <ArrayEditor
                      label="Services"
                      values={selectedMob.services}
                      emptyLabel="No services configured."
                      addLabel="Add Service"
                      placeholder="repair"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, services: next }))}
                    />
                    <ArrayEditor
                      label="Comms Directory"
                      values={selectedMob.comms_directory}
                      emptyLabel="No comms directory entries."
                      addLabel="Add Entry"
                      placeholder="Directory entry"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, comms_directory: next }))}
                    />
                  </div>
                </Section>

                <Section title="Hail and Communication" description="Optional fields for hail windows, portraits, and flavor copy.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Hail Name</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.hail_name}
                        placeholder="Lieutenant Ray"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Hail Image</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.hail_image}
                        placeholder="res://scenes/entities/Terran/Gavix/hail_image.png"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_image: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Hail Portrait</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.hail_portrait}
                        placeholder="res://assets/comms/lt_ava.png"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_portrait: event.target.value }))}
                      />
                    </div>
                    {hailPortraitPreviewSrc ? (
                      <div>
                        <div className="label">Portrait Preview</div>
                        <div className="mt-1 flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          <img
                            src={hailPortraitPreviewSrc}
                            alt={selectedMob.hail_name || selectedMob.display_name || selectedMob.id || "Hail portrait"}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="lg:col-span-2 xl:col-span-3">
                      <div className="label">Hail Greeting</div>
                      <textarea
                        className="input mt-1 min-h-28"
                        value={selectedMob.hail_greeting}
                        placeholder="This is the UTF Flagship Terran One, how can we be of assistance?"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_greeting: event.target.value }))}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Loot and Drop Tables" description="Item and mod drop configuration, rarity bounds, and duplicate rules.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Item Loot Table</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.item_loot_table}
                        placeholder="pirate_basic_items"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, item_loot_table: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Item Drop Chance</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.item_drop_chance}
                        placeholder="0.5"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, item_drop_chance: event.target.value }))}
                      />
                    </div>
                    <ToggleField
                      label="Item No Duplicates"
                      checked={selectedMob.item_no_duplicates}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, item_no_duplicates: next }))}
                    />

                    <div>
                      <div className="label">Mod Loot Table</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mod_loot_table}
                        placeholder="pirate_mods_t1"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mod_loot_table: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Mod Drop Chance</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mod_drop_chance}
                        placeholder="1"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mod_drop_chance: event.target.value }))}
                      />
                    </div>
                    <ToggleField
                      label="Mod No Duplicates"
                      checked={selectedMob.mod_no_duplicates}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, mod_no_duplicates: next }))}
                    />

                    <div>
                      <div className="label">Min Mod Rarity</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.min_mod_rarity}
                        placeholder="0"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, min_mod_rarity: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Max Mod Rarity</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.max_mod_rarity}
                        placeholder="2"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, max_mod_rarity: event.target.value }))}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Stats" description="Built-in combat and utility stats stay in dedicated inputs. Custom stats can be added below.">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {BUILT_IN_MOB_STAT_KEYS.map((statKey) => (
                      <div key={statKey}>
                        <div className="label">{labelize(statKey)}</div>
                        <input
                          className="input mt-1"
                          value={selectedMob.stats[statKey] ?? ""}
                          placeholder="0"
                          onChange={(event) =>
                            updateSelectedMob((current) => ({
                              ...current,
                              stats: {
                                ...current.stats,
                                [statKey]: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">Custom Stats</div>
                        <div className="text-xs text-white/50">Any non-standard stat keys are preserved here and merged into the exported `stats` block.</div>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                        onClick={() =>
                          updateSelectedMob((current) => ({
                            ...current,
                            stats: {
                              ...current.stats,
                              [`custom_stat_${Object.keys(current.stats).length + 1}`]: "0",
                            },
                          }))
                        }
                      >
                        Add Custom Stat
                      </button>
                    </div>

                    <div className="space-y-2">
                      {Object.keys(selectedMob.stats)
                        .filter((statKey) => !BUILT_IN_MOB_STAT_KEYS.includes(statKey as (typeof BUILT_IN_MOB_STAT_KEYS)[number]))
                        .sort((left, right) => left.localeCompare(right))
                        .map((statKey) => (
                          <div key={statKey} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                            <input
                              className="input"
                              value={statKey}
                              placeholder="custom_key"
                              onChange={(event) =>
                                updateSelectedMob((current) => {
                                  const nextKey = event.target.value.trim();
                                  if (!nextKey || nextKey === statKey || nextKey in current.stats) return current;
                                  const nextStats = { ...current.stats };
                                  const existingValue = nextStats[statKey];
                                  delete nextStats[statKey];
                                  nextStats[nextKey] = existingValue;
                                  return {
                                    ...current,
                                    stats: nextStats,
                                  };
                                })
                              }
                            />
                            <input
                              className="input"
                              value={selectedMob.stats[statKey] ?? ""}
                              placeholder="0"
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  stats: {
                                    ...current.stats,
                                    [statKey]: event.target.value,
                                  },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                              onClick={() =>
                                updateSelectedMob((current) => {
                                  const nextStats = { ...current.stats };
                                  delete nextStats[statKey];
                                  return {
                                    ...current,
                                    stats: nextStats,
                                  };
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      {Object.keys(selectedMob.stats).filter(
                        (statKey) => !BUILT_IN_MOB_STAT_KEYS.includes(statKey as (typeof BUILT_IN_MOB_STAT_KEYS)[number]),
                      ).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No custom stats added.</div>
                      ) : null}
                    </div>
                  </div>
                </Section>

                <Section title="Scan Data" description="Edit the structured scan fields directly, including as many threshold tiers as you need.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Scan Faction</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scan_faction}
                        placeholder="Gem"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_faction: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Scan Class</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scan_class}
                        placeholder="Support Craft"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_class: event.target.value }))}
                      />
                    </div>
                    <div className="lg:col-span-2 xl:col-span-3">
                      <div className="label">Scan Notes</div>
                      <textarea
                        className="input mt-1 min-h-28"
                        value={selectedMob.scan_notes}
                        placeholder="Support ships are the resupplying arm of every faction."
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_notes: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">Scan Tiers</div>
                        <div className="text-xs text-white/50">
                          Each tier uses a numeric threshold and the text revealed at that scan level.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                        onClick={() =>
                          updateSelectedMob((current) => ({
                            ...current,
                            scan_tiers: [...current.scan_tiers, createBlankScanTierDraft()],
                          }))
                        }
                      >
                        Add Tier
                      </button>
                    </div>

                    {selectedMob.scan_tiers.length ? (
                      <div className="space-y-2">
                        {selectedMob.scan_tiers.map((tier) => (
                          <div key={tier.key} className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_auto]">
                            <input
                              type="number"
                              className="input"
                              value={tier.threshold}
                              placeholder="5"
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.map((entry) =>
                                    entry.key === tier.key ? { ...entry, threshold: event.target.value } : entry,
                                  ),
                                }))
                              }
                            />
                            <input
                              className="input"
                              value={tier.text}
                              placeholder="Docking chatter detected."
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.map((entry) =>
                                    entry.key === tier.key ? { ...entry, text: event.target.value } : entry,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                              onClick={() =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.filter((entry) => entry.key !== tier.key),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                        No scan tiers yet. Add one to define reveal thresholds.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-sm font-medium text-white">Scan Extra JSON</div>
                      <div className="mt-1 text-xs text-white/50">
                        Unsupported scan keys are preserved here. Reserved keys like `Faction`, `Class`, `Notes`, and `tiers` should stay in the fields above.
                      </div>
                    </div>
                    <textarea
                      className="input min-h-36 font-mono text-sm"
                      value={selectedMob.scan_extra_json}
                      placeholder='{\n  "Discovery": "Optional unsupported scan fields stay here."\n}'
                      onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_extra_json: event.target.value }))}
                    />
                  </div>
                </Section>

                <Section title="Extra JSON" description="Unknown runtime fields stay here and are merged back into the mob at export time.">
                  <textarea
                    className="input min-h-48 font-mono text-sm"
                    value={selectedMob.extra_json}
                    placeholder='{\n  "note above": "Preserved custom runtime fields go here."\n}'
                    onChange={(event) => updateSelectedMob((current) => ({ ...current, extra_json: event.target.value }))}
                  />
                </Section>
              </>
            ) : (
              <div className="card py-10 text-center">
                <div className="text-xl font-semibold text-white">No mob selected</div>
                <div className="mt-2 text-sm text-white/55">Choose a mob from the browser or create a new mob draft.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
