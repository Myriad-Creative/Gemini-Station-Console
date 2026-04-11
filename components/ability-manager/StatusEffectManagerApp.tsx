"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import { STATUS_EFFECT_MODIFIER_KEYS, type AbilityManagerDatabase, type AbilityManagerValidationIssue, type StatusEffectDraft } from "@lib/ability-manager/types";
import {
  buildStatusEffectBundleFiles,
  cloneStatusEffectDraft,
  createBlankStatusEffect,
  deleteStatusEffectAt,
  insertStatusEffectAfter,
  syncDerivedStatusEffectFields,
  stringifyStatusEffectDraft,
  stringifyStatusEffectIndexJson,
  summarizeAbilityManager,
  updateStatusEffectAt,
  validateStatusEffectDrafts,
} from "@lib/ability-manager/utils";
import { buildIconSrc, copyToClipboard, DismissibleStatusBanner, downloadZipBundle, Section, StatusBanner, SummaryCard, type StatusTone } from "@components/ability-manager/common";
import { useAbilityDatabase } from "@components/ability-manager/useAbilityDatabase";

function issueTone(issue: AbilityManagerValidationIssue["level"]) {
  return issue === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
}

function modifierLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWholePercentInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) return trimmed;
  return Number((numericValue * 100).toFixed(4)).toString();
}

function parseWholePercentInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) return trimmed;
  return Number((numericValue / 100).toFixed(6)).toString();
}

function splitDurationFields(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      minutes: "",
      seconds: "",
    };
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return {
      minutes: "",
      seconds: "",
    };
  }

  const wholeSeconds = Math.max(0, Math.round(numericValue));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return {
    minutes: String(minutes),
    seconds: String(seconds),
  };
}

function buildDurationValue(minutesValue: string, secondsValue: string) {
  const trimmedMinutes = minutesValue.trim();
  const trimmedSeconds = secondsValue.trim();
  if (!trimmedMinutes && !trimmedSeconds) return "";

  const minutes = trimmedMinutes ? Number(trimmedMinutes) : 0;
  const seconds = trimmedSeconds ? Number(trimmedSeconds) : 0;
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return "";

  const safeMinutes = Math.max(0, Math.round(minutes));
  const safeSeconds = Math.max(0, Math.round(seconds));
  return String(safeMinutes * 60 + safeSeconds);
}

type StatusState = {
  tone: StatusTone;
  message: string;
  dismissAfterMs?: number | null;
};

function detectModifierKeySelection(flatModifiers: Record<string, string>, percentModifiers: Record<string, string>) {
  for (const key of STATUS_EFFECT_MODIFIER_KEYS) {
    if ((flatModifiers[key] ?? "").trim() && Number(flatModifiers[key]) !== 0) return key;
    if ((percentModifiers[key] ?? "").trim() && Number(percentModifiers[key]) !== 0) return key;
  }
  return STATUS_EFFECT_MODIFIER_KEYS[0];
}

function formatDurationSummary(value: string) {
  const { minutes, seconds } = splitDurationFields(value);
  const numericMinutes = minutes ? Number(minutes) : 0;
  const numericSeconds = seconds ? Number(seconds) : 0;
  if (!numericMinutes && !numericSeconds) return "";
  if (numericMinutes && numericSeconds) return `${numericMinutes}m ${numericSeconds}s`;
  if (numericMinutes) return `${numericMinutes}m`;
  return `${numericSeconds}s`;
}

export default function StatusEffectManagerApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const { database: loadedDatabase, loading } = useAbilityDatabase();
  const [database, setDatabase] = useState<AbilityManagerDatabase | null>(null);
  const [selectedStatusEffectKey, setSelectedStatusEffectKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [buffFilter, setBuffFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");
  const [status, setStatus] = useState<StatusState>({ tone: "neutral", message: "", dismissAfterMs: null });
  const [statusCountdown, setStatusCountdown] = useState<number | null>(null);
  const [selectedModifierKey, setSelectedModifierKey] = useState<(typeof STATUS_EFFECT_MODIFIER_KEYS)[number]>(STATUS_EFFECT_MODIFIER_KEYS[0]);
  const statusTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncedDatabase = loadedDatabase
      ? {
          ...loadedDatabase,
          statusEffects: loadedDatabase.statusEffects.map((draft) => syncDerivedStatusEffectFields(draft)),
        }
      : loadedDatabase;
    setDatabase(syncedDatabase);
    setSelectedStatusEffectKey(syncedDatabase?.statusEffects[0]?.key ?? null);
  }, [loadedDatabase]);

  const statusEffectIssues = useMemo(() => validateStatusEffectDrafts(database?.statusEffects ?? []), [database]);
  const issuesByKey = useMemo(() => {
    const next = new Map<string, AbilityManagerValidationIssue[]>();
    for (const issue of statusEffectIssues) {
      const current = next.get(issue.draftKey) ?? [];
      current.push(issue);
      next.set(issue.draftKey, current);
    }
    return next;
  }, [statusEffectIssues]);
  const summary = useMemo(() => summarizeAbilityManager(database, [], statusEffectIssues), [database, statusEffectIssues]);

  const filteredStatusEffects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (database?.statusEffects ?? [])
      .filter((draft) => {
        if (!query) return true;
        return [draft.numericId, draft.effectId, draft.name, draft.description, draft.fileName].join(" ").toLowerCase().includes(query);
      })
      .filter((draft) => {
        if (!buffFilter) return true;
        return buffFilter === "buff" ? draft.isBuff : !draft.isBuff;
      })
      .filter((draft) => {
        if (!linkedFilter) return true;
        return linkedFilter === "linked" ? draft.linkedAbilityIds.length > 0 : draft.linkedAbilityIds.length === 0;
      });
  }, [buffFilter, database, linkedFilter, search]);

  useEffect(() => {
    const statusEffects = database?.statusEffects ?? [];
    if (!statusEffects.length) {
      if (selectedStatusEffectKey !== null) setSelectedStatusEffectKey(null);
      return;
    }

    if (!selectedStatusEffectKey || !statusEffects.some((draft) => draft.key === selectedStatusEffectKey)) {
      setSelectedStatusEffectKey(filteredStatusEffects[0]?.key ?? statusEffects[0]?.key ?? null);
      return;
    }

    if (filteredStatusEffects.length && !filteredStatusEffects.some((draft) => draft.key === selectedStatusEffectKey)) {
      setSelectedStatusEffectKey(filteredStatusEffects[0]?.key ?? statusEffects[0]?.key ?? null);
    }
  }, [database, filteredStatusEffects, selectedStatusEffectKey]);

  const selectedStatusEffect = useMemo(() => {
    const statusEffects = database?.statusEffects ?? [];
    return statusEffects.find((draft) => draft.key === selectedStatusEffectKey) ?? filteredStatusEffects[0] ?? statusEffects[0] ?? null;
  }, [database, filteredStatusEffects, selectedStatusEffectKey]);
  const selectedDurationFields = useMemo(() => splitDurationFields(selectedStatusEffect?.duration ?? ""), [selectedStatusEffect?.duration]);

  const selectedIssues = selectedStatusEffect ? issuesByKey.get(selectedStatusEffect.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const workspaceHasErrors = statusEffectIssues.some((issue) => issue.level === "error");

  useEffect(() => {
    if (!selectedStatusEffect) return;
    setSelectedModifierKey(detectModifierKeySelection(selectedStatusEffect.flatModifiers, selectedStatusEffect.percentModifiers));
  }, [selectedStatusEffect?.key]);

  useEffect(() => {
    if (status.tone === "neutral" || !status.message || !status.dismissAfterMs || status.dismissAfterMs <= 0) {
      setStatusCountdown(null);
      return;
    }

    const startedAt = Date.now();
    const totalSeconds = Math.max(1, Math.ceil(status.dismissAfterMs / 1000));
    setStatusCountdown(totalSeconds);

    const interval = window.setInterval(() => {
      const remainingMs = status.dismissAfterMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        setStatus({ tone: "neutral", message: "", dismissAfterMs: null });
        setStatusCountdown(null);
        return;
      }
      setStatusCountdown(Math.max(1, Math.ceil(remainingMs / 1000)));
    }, 250);

    const timeout = window.setTimeout(() => {
      setStatus({ tone: "neutral", message: "", dismissAfterMs: null });
      setStatusCountdown(null);
    }, status.dismissAfterMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [status]);
  const previewIcon = buildIconSrc(
    selectedStatusEffect?.icon || "icon_lootbox.png",
    selectedStatusEffect?.numericId || "status-effect",
    selectedStatusEffect?.name || "Status Effect",
    sharedDataVersion,
  );
  const indexJson = useMemo(() => (database ? stringifyStatusEffectIndexJson(database.statusEffects) : "{}"), [database]);

  function updateSelectedStatusEffect(updater: (current: StatusEffectDraft) => StatusEffectDraft) {
    if (!database || !selectedStatusEffect) return;
    setDatabase(updateStatusEffectAt(database, selectedStatusEffect.key, (current) => syncDerivedStatusEffectFields(updater(current))));
  }

  function updateModifierBucket(bucket: "flatModifiers" | "percentModifiers", key: string, value: string) {
    updateSelectedStatusEffect((current) => ({
      ...current,
      [bucket]: {
        ...current[bucket],
        [key]: value,
      },
    }));
  }

  function updateDurationField(part: "minutes" | "seconds", value: string) {
    const current = splitDurationFields(selectedStatusEffect?.duration ?? "");
    const nextMinutes = part === "minutes" ? value : current.minutes;
    const nextSeconds = part === "seconds" ? value : current.seconds;
    updateSelectedStatusEffect((draft) => ({
      ...draft,
      duration: buildDurationValue(nextMinutes, nextSeconds),
    }));
  }

  function addBlankStatusEffect() {
    if (!database) return;
    const nextDraft = createBlankStatusEffect(
      database.statusEffects.map((draft) => draft.numericId),
      database.statusEffects.map((draft) => draft.fileName),
    );
    const nextDatabase = insertStatusEffectAfter(database, selectedStatusEffect?.key ?? null, nextDraft);
    setDatabase(nextDatabase);
    setSelectedStatusEffectKey(nextDraft.key);
    setStatus({ tone: "success", message: "Added a new blank status effect draft.", dismissAfterMs: 3000 });
  }

  function cloneSelectedStatusEffect() {
    if (!database || !selectedStatusEffect) return;
    const nextDraft = cloneStatusEffectDraft(
      selectedStatusEffect,
      database.statusEffects.map((draft) => draft.numericId),
      database.statusEffects.map((draft) => draft.fileName),
    );
    const nextDatabase = insertStatusEffectAfter(database, selectedStatusEffect.key, nextDraft);
    setDatabase(nextDatabase);
    setSelectedStatusEffectKey(nextDraft.key);
    setStatus({ tone: "success", message: `Cloned status effect "${selectedStatusEffect.name || selectedStatusEffect.numericId}" into "${nextDraft.numericId}".`, dismissAfterMs: null });
  }

  function deleteSelectedStatusEffect() {
    if (!database || !selectedStatusEffect) return;
    const nextDatabase = deleteStatusEffectAt(database, selectedStatusEffect.key);
    setDatabase(nextDatabase);
    setSelectedStatusEffectKey(nextDatabase.statusEffects[0]?.key ?? null);
    setStatus({ tone: "success", message: `Deleted status effect "${selectedStatusEffect.name || selectedStatusEffect.numericId}".`, dismissAfterMs: null });
  }

  async function handleCopyIndexJson() {
    if (!database) return;
    const copied = await copyToClipboard(indexJson);
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the updated _StatusEffectIndex.json to the clipboard." : "Clipboard copy failed in this browser context.",
      dismissAfterMs: null,
    });
  }

  async function handleCopyCurrentStatusEffect() {
    if (!selectedStatusEffect || selectedHasErrors) return;
    const copied = await copyToClipboard(stringifyStatusEffectDraft(selectedStatusEffect));
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? `Copied ${selectedStatusEffect.fileName} to the clipboard.` : "Clipboard copy failed in this browser context.",
      dismissAfterMs: null,
    });
  }

  async function handleSaveCurrentStatusEffectToBuild() {
    if (!database || !selectedStatusEffect || selectedHasErrors) return;

    try {
      const response = await fetch("/api/abilities/status-effects/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: selectedStatusEffect,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save the current status effect into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setDatabase(
        updateStatusEffectAt(database, selectedStatusEffect.key, (current) =>
          syncDerivedStatusEffectFields({
            ...current,
            sourcePath: typeof payload?.savedPath === "string" ? payload.savedPath : current.sourcePath,
          }),
        ),
      );
      setStatus({
        tone: "success",
        message: `Saved ${selectedStatusEffect.fileName} into the game build and updated _StatusEffectIndex.json.`,
        dismissAfterMs: 10000,
      });
      statusTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleDownloadBundle() {
    if (!database || workspaceHasErrors) return;
    await downloadZipBundle("status_effects_bundle.zip", buildStatusEffectBundleFiles(database.statusEffects));
    setStatus({ tone: "success", message: "Downloaded status effects bundle zip.", dismissAfterMs: null });
  }

  if (loading && !database) return <div>Loading…</div>;

  if (!database) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">Status Effects Manager</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Manage status effect JSON entries, browse linked abilities, and export the indexed status effect bundle.
          </p>
        </div>
        <StatusBanner tone="error" message="No status effect data is currently available. Check Settings." />
        <Section title="No Status Effect Data Loaded">
          <p className="text-sm leading-6 text-white/65">
            Set your Gemini Station folder in Settings and this editor will load the current status effect data automatically.
          </p>
          <div>
            <Link href="/settings" className="btn">
              Open Settings
            </Link>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-4xl">
          <h1 className="page-title mb-1">Status Effects Manager</h1>
          <p className="text-sm text-white/70">
            Browse all status-effect JSON files, tune buff/debuff and stacking rules, inspect linked abilities, and export the runtime index-plus-file
            bundle.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!database || workspaceHasErrors} onClick={() => void handleDownloadBundle()}>
            Download status_effects bundle.zip
          </button>
          <button
            className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
            disabled={!database}
            onClick={() => void handleCopyIndexJson()}
          >
            Copy Updated _StatusEffectIndex.json
          </button>
        </div>
      </div>

      {/* status banner */}
      <div ref={statusTopRef} />
      {status.tone !== "neutral" && status.message ? (
        <DismissibleStatusBanner
          tone={status.tone}
          message={status.message}
          onDismiss={() => setStatus({ tone: "neutral", message: "", dismissAfterMs: null })}
          countdownSeconds={statusCountdown}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Status Effects" value={summary.totalStatusEffects} />
        <SummaryCard label="Linked Abilities" value={database.statusEffects.filter((draft) => draft.linkedAbilityIds.length > 0).length} />
        <SummaryCard label="Buffs" value={database.statusEffects.filter((draft) => draft.isBuff).length} />
        <SummaryCard label="Debuffs" value={database.statusEffects.filter((draft) => !draft.isBuff).length} />
        <SummaryCard label="Warnings / Errors" value={`${summary.warningCount} / ${summary.errorCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="card h-fit space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Status Effect Library</div>
                <div className="mt-1 text-sm text-white/55">
                  {database.sourceLabel} · {database.statusEffects.length} effect file{database.statusEffects.length === 1 ? "" : "s"}
                </div>
              </div>
              <button className="btn shrink-0" onClick={addBlankStatusEffect}>
                New Effect
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="label">Search</div>
                <input
                  className="input mt-1"
                  value={search}
                  placeholder="Search numeric ID, effect ID, name, description, or file..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div>
                <div className="label">Buff / Debuff</div>
                <select className="select mt-1 w-full" value={buffFilter} onChange={(event) => setBuffFilter(event.target.value)}>
                  <option value="">All status effects</option>
                  <option value="buff">Buffs</option>
                  <option value="debuff">Debuffs</option>
                </select>
              </div>

              <div>
                <div className="label">Ability Links</div>
                <select className="select mt-1 w-full" value={linkedFilter} onChange={(event) => setLinkedFilter(event.target.value)}>
                  <option value="">All effects</option>
                  <option value="linked">Linked to abilities</option>
                  <option value="unlinked">No linked abilities</option>
                </select>
              </div>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {filteredStatusEffects.length ? (
                filteredStatusEffects.map((draft) => {
                  const selected = selectedStatusEffect?.key === draft.key;
                  const issues = issuesByKey.get(draft.key) ?? [];
                  const hasErrors = issues.some((issue) => issue.level === "error");
                  return (
                    <button
                      key={draft.key}
                      type="button"
                      onClick={() => setSelectedStatusEffectKey(draft.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={buildIconSrc(draft.icon, draft.numericId || "status-effect", draft.name || "Status Effect", sharedDataVersion)}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-[#07111d] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold text-white">{draft.name || "Unnamed Status Effect"}</div>
                          <div className="mt-1 truncate font-mono text-xs text-white/55">{draft.numericId || "missing-id"}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
                            <span className="rounded bg-white/5 px-2 py-1">{draft.isBuff ? "Buff" : "Debuff"}</span>
                            {draft.linkedAbilityIds.length ? <span className="rounded bg-white/5 px-2 py-1">{draft.linkedAbilityIds.length} abilities</span> : null}
                            {hasErrors ? <span className="rounded bg-red-400/15 px-2 py-1 text-red-100">Errors</span> : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                  No status effects match the current search or filters.
                </div>
              )}
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-lg font-semibold text-white">Validation</div>
            {selectedStatusEffect ? (
              selectedIssues.length ? (
                <div className="space-y-3">
                  {selectedIssues.map((issue, index) => (
                    <div key={`${issue.field}-${index}`} className={`rounded-xl border px-3 py-3 ${issueTone(issue.level)}`}>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em]">{issue.level}</div>
                      <div className="mt-2 text-sm">{issue.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-4 text-sm text-emerald-100">
                  no issues
                </div>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">Select a status effect to review validation.</div>
            )}
          </div>
        </aside>

        <div className="space-y-6">
          {selectedStatusEffect ? (
            <>
              <Section
                title="Status Effect Editor"
                description="Edit the core status effect runtime fields directly, including flat and percent modifiers, and keep only the remaining unknown payload in the JSON blocks below."
              >
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={cloneSelectedStatusEffect}>
                    Clone Status Effect
                  </button>
                  <button className="rounded border border-red-400/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={deleteSelectedStatusEffect}>
                    Delete Status Effect
                  </button>
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40" disabled={selectedHasErrors} onClick={() => void handleCopyCurrentStatusEffect()}>
                    Copy Current Status Effect JSON
                  </button>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={selectedHasErrors}
                    onClick={() => void handleSaveCurrentStatusEffectToBuild()}
                  >
                    Save Current Status Effect To Build
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label">Numeric ID</div>
                    <input className="input mt-1" value={selectedStatusEffect.numericId} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, numericId: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">File Name</div>
                    <input className="input mt-1 cursor-default text-white/70" value={selectedStatusEffect.fileName} readOnly />
                    <div className="mt-2 text-xs text-white/45">Auto-generated as numeric id + name in lower case.</div>
                  </div>
                  <div>
                    <div className="label">properties.id</div>
                    <input className="input mt-1 cursor-default text-white/70" value={selectedStatusEffect.effectId} readOnly />
                    <div className="mt-2 text-xs text-white/45">Auto-generated from the name with spaces removed.</div>
                  </div>
                  <div>
                    <div className="label">Name</div>
                    <input className="input mt-1" value={selectedStatusEffect.name} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Script</div>
                    <input className="input mt-1" value={selectedStatusEffect.script} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, script: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Icon</div>
                    <input className="input mt-1" value={selectedStatusEffect.icon} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, icon: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Description</div>
                    <textarea className="input mt-1 min-h-24" value={selectedStatusEffect.description} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Effect Type</div>
                    <input className="input mt-1" value={selectedStatusEffect.effectType} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, effectType: event.target.value }))} />
                    <div className="mt-2 text-xs text-white/45">Numeric runtime type for the effect. Existing game data currently uses values like 0, 1, and 2, so reuse a similar effect if you are unsure.</div>
                  </div>
                  <div>
                    <div className="label">Threat Multiplier</div>
                    <input className="input mt-1" value={selectedStatusEffect.threatMultiplier} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, threatMultiplier: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Duration</div>
                    <div className="mt-1 grid grid-cols-2 gap-3">
                      <div>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={selectedDurationFields.minutes}
                          onChange={(event) => updateDurationField("minutes", event.target.value)}
                        />
                        <div className="mt-2 text-xs text-white/45">Minutes</div>
                      </div>
                      <div>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={selectedDurationFields.seconds}
                          onChange={(event) => updateDurationField("seconds", event.target.value)}
                        />
                        <div className="mt-2 text-xs text-white/45">Seconds</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/45">Stored and exported automatically as total seconds.</div>
                  </div>
                  <div>
                    <div className="label">Tick Interval</div>
                    <input className="input mt-1" value={selectedStatusEffect.tickInterval} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, tickInterval: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Max Stacks</div>
                    <input className="input mt-1" value={selectedStatusEffect.maxStacks} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, maxStacks: event.target.value }))} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 md:col-span-2">
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                      <input type="checkbox" checked={selectedStatusEffect.isBuff} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, isBuff: event.target.checked }))} />
                      Buff
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                      <input type="checkbox" checked={selectedStatusEffect.isDispellable} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, isDispellable: event.target.checked }))} />
                      Dispellable
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                      <input type="checkbox" checked={selectedStatusEffect.canStack} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, canStack: event.target.checked }))} />
                      Can Stack
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                      <input type="checkbox" checked={selectedStatusEffect.showDuration} onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, showDuration: event.target.checked }))} />
                      Show Duration
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="label">Linked Abilities</div>
                  {selectedStatusEffect.linkedAbilityIds.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedStatusEffect.linkedAbilityNames.map((name, index) => (
                        <span key={`${name}-${index}`} className="rounded bg-white/5 px-2 py-1 text-xs text-white/75">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-white/45">No abilities currently link to this status effect.</div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label">Flat Modifiers</div>
                    <div className="mt-1 space-y-3">
                      <div>
                        <div className="label">Stat</div>
                        <select className="select mt-1 w-full" value={selectedModifierKey} onChange={(event) => setSelectedModifierKey(event.target.value as (typeof STATUS_EFFECT_MODIFIER_KEYS)[number])}>
                          {STATUS_EFFECT_MODIFIER_KEYS.map((key) => (
                            <option key={`flat-select-${key}`} value={key}>
                              {modifierLabel(key)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="label">{modifierLabel(selectedModifierKey)}</div>
                        <input
                          className="input mt-1"
                          value={selectedStatusEffect.flatModifiers[selectedModifierKey] ?? ""}
                          onChange={(event) => updateModifierBucket("flatModifiers", selectedModifierKey, event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="label">Percent Modifiers</div>
                    <div className="mt-1 text-xs text-white/45">Enter whole percentages here, like 10 for 10%. The exporter converts them back to decimals automatically.</div>
                    <div className="mt-1 space-y-3">
                      <div>
                        <div className="label">Stat</div>
                        <select className="select mt-1 w-full" value={selectedModifierKey} onChange={(event) => setSelectedModifierKey(event.target.value as (typeof STATUS_EFFECT_MODIFIER_KEYS)[number])}>
                          {STATUS_EFFECT_MODIFIER_KEYS.map((key) => (
                            <option key={`percent-select-${key}`} value={key}>
                              {modifierLabel(key)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="label">{modifierLabel(selectedModifierKey)}</div>
                        <div className="relative mt-1">
                          <input
                            className="input pr-8"
                            inputMode="decimal"
                            value={formatWholePercentInput(selectedStatusEffect.percentModifiers[selectedModifierKey] ?? "")}
                            onChange={(event) => updateModifierBucket("percentModifiers", selectedModifierKey, parseWholePercentInput(event.target.value))}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-white/45">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="label">Additional Runtime JSON</div>
                    <textarea
                      className="input mt-1 min-h-52 font-mono text-sm"
                      value={selectedStatusEffect.extraPropertiesJson}
                      placeholder='{"power_scaling": 0.25}'
                      onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, extraPropertiesJson: event.target.value }))}
                    />
                  </div>
                  <div>
                    <div className="label">Additional Root JSON</div>
                    <textarea
                      className="input mt-1 min-h-52 font-mono text-sm"
                      value={selectedStatusEffect.extraRootJson}
                      placeholder='{"metadata/_custom_type_script": "uid://..."}'
                      onChange={(event) => updateSelectedStatusEffect((current) => ({ ...current, extraRootJson: event.target.value }))}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Preview" description="Quick view of the current icon, label, and linked-ability context for the selected status effect.">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start">
                    <img src={previewIcon} alt="" className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 bg-[#07111d] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="text-3xl font-semibold text-white">{selectedStatusEffect.name || "Unnamed Status Effect"}</div>
                      <div className="mt-2 font-mono text-xs text-white/55">
                        {selectedStatusEffect.numericId || "missing-id"} · {selectedStatusEffect.effectId || "no properties.id"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/65">
                        <span className="rounded bg-white/5 px-2 py-1">{selectedStatusEffect.isBuff ? "Buff" : "Debuff"}</span>
                        {selectedStatusEffect.duration.trim() ? <span className="rounded bg-white/5 px-2 py-1">Duration {formatDurationSummary(selectedStatusEffect.duration) || selectedStatusEffect.duration}</span> : null}
                        {selectedStatusEffect.canStack ? <span className="rounded bg-white/5 px-2 py-1">Stacks</span> : null}
                      </div>
                      {selectedStatusEffect.description.trim() ? <div className="mt-4 max-w-3xl text-sm leading-6 text-white/70">{selectedStatusEffect.description}</div> : null}
                      {selectedStatusEffect.linkedAbilityNames.length ? (
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                          {selectedStatusEffect.linkedAbilityNames.map((name, index) => (
                            <span key={`${name}-${index}`} className="rounded bg-white/5 px-2 py-1">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Export Preview" description="The full status-effect bundle exports as indexed per-file JSON, matching the real game data layout.">
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={() => void handleCopyIndexJson()}>
                    Copy Updated _StatusEffectIndex.json
                  </button>
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40" disabled={workspaceHasErrors} onClick={() => void handleDownloadBundle()}>
                    Download status_effects bundle.zip
                  </button>
                </div>
                <pre className="max-h-[28rem] overflow-auto rounded-xl border border-white/10 bg-[#08101c] p-4 text-sm text-white/80">{indexJson}</pre>
              </Section>
            </>
          ) : (
            <Section title="No Status Effect Selected" description="Create a new status effect or pick one from the left sidebar to start editing.">
              <button className="btn" onClick={addBlankStatusEffect}>
                New Status Effect
              </button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
