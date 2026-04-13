"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { AbilityDraft, AbilityManagerDatabase, AbilityManagerModOption, AbilityManagerValidationIssue } from "@lib/ability-manager/types";
import {
  buildAbilityBundleFiles,
  computeAbilityLinkedEffects,
  computeAbilityLinkedMods,
  cloneAbilityDraft,
  createBlankAbility,
  deleteAbilityAt,
  inferAbilityDeliveryType,
  insertAbilityAfter,
  normalizeAbilityReference,
  statusEffectOptionsFromDatabase,
  syncDerivedAbilityFields,
  stringifyAbilityDraft,
  stringifyAbilityIndexJson,
  summarizeAbilityManager,
  updateAbilityAt,
  validateAbilityDrafts,
} from "@lib/ability-manager/utils";
import { buildIconSrc, copyToClipboard, DismissibleStatusBanner, downloadTextFile, downloadZipBundle, Section, StatusBanner, SummaryCard, type StatusTone } from "@components/ability-manager/common";
import { useAbilityDatabase } from "@components/ability-manager/useAbilityDatabase";

function issueTone(issue: AbilityManagerValidationIssue["level"]) {
  return issue === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
}

function sourceLabel(sources: string[]) {
  return sources
    .map((source) => {
      if (source === "json") return "JSON";
      if (source === "script_constant") return "Script";
      return "Fallback";
    })
    .join(" + ");
}

type StatusState = {
  tone: StatusTone;
  message: string;
  dismissAfterMs?: number | null;
};

export default function AbilityManagerApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const { database: loadedDatabase, loading } = useAbilityDatabase();
  const [database, setDatabase] = useState<AbilityManagerDatabase | null>(null);
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [modFilter, setModFilter] = useState("");
  const [status, setStatus] = useState<StatusState>({ tone: "neutral", message: "", dismissAfterMs: null });
  const [statusCountdown, setStatusCountdown] = useState<number | null>(null);
  const statusTopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncedDatabase = loadedDatabase
      ? {
          ...loadedDatabase,
          abilities: loadedDatabase.abilities.map((draft) => syncDerivedAbilityFields(draft)),
        }
      : loadedDatabase;
    setDatabase(syncedDatabase);
    setSelectedAbilityKey(syncedDatabase?.abilities[0]?.key ?? null);
  }, [loadedDatabase]);

  const statusEffectOptions = useMemo(() => statusEffectOptionsFromDatabase(database), [database]);
  const abilityIssues = useMemo(() => validateAbilityDrafts(database?.abilities ?? [], statusEffectOptions), [database, statusEffectOptions]);
  const abilityIssuesByKey = useMemo(() => {
    const next = new Map<string, AbilityManagerValidationIssue[]>();
    for (const issue of abilityIssues) {
      const current = next.get(issue.draftKey) ?? [];
      current.push(issue);
      next.set(issue.draftKey, current);
    }
    return next;
  }, [abilityIssues]);
  const summary = useMemo(() => summarizeAbilityManager(database, abilityIssues, []), [database, abilityIssues]);

  const modLinksByAbilityId = useMemo(() => {
    const next = new Map<string, AbilityManagerModOption[]>();
    if (!database?.modCatalogAvailable) return next;

    for (const mod of database.mods) {
      for (const abilityId of mod.abilityIds) {
        const current = next.get(abilityId) ?? [];
        current.push(mod);
        next.set(abilityId, current);
      }
    }

    return next;
  }, [database?.modCatalogAvailable, database?.mods]);
  const filteredAbilities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (database?.abilities ?? [])
      .filter((draft) => {
        if (!query) return true;
        return [draft.id, draft.name, draft.description, draft.script, draft.fileName].join(" ").toLowerCase().includes(query);
      })
      .filter((draft) => (deliveryFilter ? inferAbilityDeliveryType(draft) === deliveryFilter : true))
      .filter((draft) => {
        if (!linkedFilter) return true;
        const linkedCount = computeAbilityLinkedEffects(draft, statusEffectOptions).length;
        return linkedFilter === "linked" ? linkedCount > 0 : linkedCount === 0;
      })
      .filter((draft) => {
        if (!validationFilter) return true;
        const issues = abilityIssuesByKey.get(draft.key) ?? [];
        const hasErrors = issues.some((issue) => issue.level === "error");
        const hasWarnings = issues.some((issue) => issue.level === "warning");
        if (validationFilter === "errors") return hasErrors;
        if (validationFilter === "warnings") return hasWarnings;
        return true;
      })
      .filter((draft) => {
        if (!modFilter || !database?.modCatalogAvailable) return true;
        const linkedModCount = (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length;
        return modFilter === "linked" ? linkedModCount > 0 : linkedModCount === 0;
      });
  }, [abilityIssuesByKey, database, deliveryFilter, linkedFilter, modFilter, modLinksByAbilityId, search, statusEffectOptions, validationFilter]);

  const selectedAbility = useMemo(() => {
    const abilities = database?.abilities ?? [];
    return abilities.find((draft) => draft.key === selectedAbilityKey) ?? filteredAbilities[0] ?? abilities[0] ?? null;
  }, [database, filteredAbilities, selectedAbilityKey]);

  const selectedIssues = selectedAbility ? abilityIssuesByKey.get(selectedAbility.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const workspaceHasErrors = abilityIssues.some((issue) => issue.level === "error");
  const selectedLinkedEffects = useMemo(
    () => (selectedAbility ? computeAbilityLinkedEffects(selectedAbility, statusEffectOptions) : []),
    [selectedAbility, statusEffectOptions],
  );
  const selectedLinkedMods = useMemo(() => {
    if (!selectedAbility || !database?.modCatalogAvailable) return [];
    return modLinksByAbilityId.get(normalizeAbilityReference(selectedAbility.id)) ?? computeAbilityLinkedMods(selectedAbility, database.mods);
  }, [database?.modCatalogAvailable, database?.mods, modLinksByAbilityId, selectedAbility]);

  useEffect(() => {
    const abilities = database?.abilities ?? [];
    if (!abilities.length) {
      if (selectedAbilityKey !== null) setSelectedAbilityKey(null);
      return;
    }

    if (!selectedAbilityKey || !abilities.some((draft) => draft.key === selectedAbilityKey)) {
      setSelectedAbilityKey(filteredAbilities[0]?.key ?? abilities[0]?.key ?? null);
      return;
    }

    if (filteredAbilities.length && !filteredAbilities.some((draft) => draft.key === selectedAbilityKey)) {
      setSelectedAbilityKey(filteredAbilities[0]?.key ?? abilities[0]?.key ?? null);
    }
  }, [database, filteredAbilities, selectedAbilityKey]);

  const abilityIndexJson = useMemo(() => (database ? stringifyAbilityIndexJson(database.abilities) : "{}"), [database]);
  const previewIcon = buildIconSrc(
    selectedAbility?.icon || "icon_lootbox.png",
    selectedAbility?.id || "ability",
    selectedAbility?.name || "Ability",
    sharedDataVersion,
  );

  useEffect(() => {
    if (status.tone === "neutral" || !status.message || !status.dismissAfterMs || status.dismissAfterMs <= 0) {
      setStatusCountdown(null);
      return;
    }

    const dismissAfterMs = status.dismissAfterMs;
    const startedAt = Date.now();
    const totalSeconds = Math.max(1, Math.ceil(dismissAfterMs / 1000));
    setStatusCountdown(totalSeconds);

    const interval = window.setInterval(() => {
      const remainingMs = dismissAfterMs - (Date.now() - startedAt);
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
    }, dismissAfterMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [status]);

  function updateSelectedAbility(updater: (current: AbilityDraft) => AbilityDraft) {
    if (!database || !selectedAbility) return;
    setDatabase(updateAbilityAt(database, selectedAbility.key, (current) => syncDerivedAbilityFields(updater(current))));
  }

  function addBlankAbility() {
    if (!database) return;
    const nextDraft = createBlankAbility(
      database.abilities.map((draft) => draft.id),
      database.abilities.map((draft) => draft.fileName),
    );
    const nextDatabase = insertAbilityAfter(database, selectedAbility?.key ?? null, nextDraft);
    setDatabase(nextDatabase);
    setSelectedAbilityKey(nextDraft.key);
    setStatus({ tone: "success", message: "Added a new blank ability draft.", dismissAfterMs: 3000 });
  }

  function cloneSelectedAbility() {
    if (!database || !selectedAbility) return;
    const nextDraft = cloneAbilityDraft(
      selectedAbility,
      database.abilities.map((draft) => draft.id),
      database.abilities.map((draft) => draft.fileName),
    );
    const nextDatabase = insertAbilityAfter(database, selectedAbility.key, nextDraft);
    setDatabase(nextDatabase);
    setSelectedAbilityKey(nextDraft.key);
    setStatus({ tone: "success", message: `Cloned ability "${selectedAbility.name || selectedAbility.id}" into "${nextDraft.id}".`, dismissAfterMs: null });
  }

  function deleteSelectedAbility() {
    if (!database || !selectedAbility) return;
    const nextDatabase = deleteAbilityAt(database, selectedAbility.key);
    setDatabase(nextDatabase);
    setSelectedAbilityKey(nextDatabase.abilities[0]?.key ?? null);
    setStatus({ tone: "success", message: `Deleted ability "${selectedAbility.name || selectedAbility.id}".`, dismissAfterMs: null });
  }

  async function handleCopyIndexJson() {
    if (!database) return;
    const copied = await copyToClipboard(abilityIndexJson);
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the updated _AbilityIndex.json to the clipboard." : "Clipboard copy failed in this browser context.",
      dismissAfterMs: null,
    });
  }

  async function handleCopyCurrentAbility() {
    if (!selectedAbility || selectedHasErrors) return;
    const copied = await copyToClipboard(stringifyAbilityDraft(selectedAbility));
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? `Copied ${selectedAbility.fileName} to the clipboard.` : "Clipboard copy failed in this browser context.",
      dismissAfterMs: null,
    });
  }

  async function handleSaveCurrentAbilityToBuild() {
    if (!database || !selectedAbility || selectedHasErrors) return;

    try {
      const response = await fetch("/api/abilities/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: selectedAbility,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save the current ability into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setDatabase(
        updateAbilityAt(database, selectedAbility.key, (current) =>
          syncDerivedAbilityFields({
            ...current,
            sourcePath: typeof payload?.savedPath === "string" ? payload.savedPath : current.sourcePath,
          }),
        ),
      );
      setStatus({
        tone: "success",
        message: `Saved ${selectedAbility.fileName} into the game build and updated _AbilityIndex.json.`,
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
    await downloadZipBundle("abilities_bundle.zip", buildAbilityBundleFiles(database.abilities));
    setStatus({ tone: "success", message: "Downloaded abilities bundle zip.", dismissAfterMs: null });
  }

  if (loading && !database) return <div>Loading…</div>;

  if (!database) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">Abilities Manager</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Manage ability JSON entries, inspect linked status effects, and export the indexed ability bundle.
          </p>
        </div>
        <StatusBanner tone="error" message="No ability data is currently available. Check Settings." />
        <Section title="No Ability Data Loaded">
          <p className="text-sm leading-6 text-white/65">
            Set your Gemini Station folder in Settings and this editor will load the current ability data automatically.
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
          <h1 className="page-title mb-1">Abilities Manager</h1>
          <p className="text-sm text-white/70">
            Browse all ability JSON files, inspect delivery behavior, and manage JSON-linked status effects while still surfacing script-linked effect
            relationships.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!database || workspaceHasErrors} onClick={() => void handleDownloadBundle()}>
            Download abilities bundle.zip
          </button>
          <button
            className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
            disabled={!database}
            onClick={() => void handleCopyIndexJson()}
          >
            Copy Updated _AbilityIndex.json
          </button>
        </div>
      </div>

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
        <SummaryCard label="Abilities" value={summary.totalAbilities} />
        <SummaryCard label="Projectile" value={summary.projectileCount} />
        <SummaryCard label="Beam" value={summary.beamCount} />
        <SummaryCard label="Linked Effects" value={summary.linkedAbilityCount} />
        <SummaryCard label="Warnings / Errors" value={`${summary.warningCount} / ${summary.errorCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="card h-fit space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Ability Library</div>
                <div className="mt-1 text-sm text-white/55">
                  {database.sourceLabel} · {database.abilities.length} ability file{database.abilities.length === 1 ? "" : "s"}
                </div>
              </div>
              <button className="btn shrink-0" onClick={addBlankAbility}>
                New Ability
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="label">Search</div>
                <input
                  className="input mt-1"
                  value={search}
                  placeholder="Search ID, name, description, script, or file..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div>
                <div className="label">Delivery Type</div>
                <select className="select mt-1 w-full" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}>
                  <option value="">All types</option>
                  <option value="energy">Energy</option>
                  <option value="projectile">Projectile</option>
                  <option value="beam">Beam</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <div className="label">Effect Links</div>
                <select className="select mt-1 w-full" value={linkedFilter} onChange={(event) => setLinkedFilter(event.target.value)}>
                  <option value="">All abilities</option>
                  <option value="linked">Has linked effects</option>
                  <option value="unlinked">No linked effects</option>
                </select>
              </div>

              <div>
                <div className="label">Validation</div>
                <select className="select mt-1 w-full" value={validationFilter} onChange={(event) => setValidationFilter(event.target.value)}>
                  <option value="">All validation states</option>
                  <option value="errors">Has errors</option>
                  <option value="warnings">Has warnings</option>
                </select>
              </div>

              <div>
                <div className="label">Mod Links</div>
                <select className="select mt-1 w-full" value={modFilter} onChange={(event) => setModFilter(event.target.value)} disabled={!database?.modCatalogAvailable}>
                  <option value="">All abilities</option>
                  <option value="linked">Has linked mods</option>
                  <option value="unlinked">No mods connected</option>
                </select>
                {!database?.modCatalogAvailable ? <div className="mt-2 text-xs text-white/45">Mods.json is not available in the active local game root.</div> : null}
              </div>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {filteredAbilities.length ? (
                filteredAbilities.map((draft) => {
                  const selected = selectedAbility?.key === draft.key;
                  const issues = abilityIssuesByKey.get(draft.key) ?? [];
                  const hasErrors = issues.some((issue) => issue.level === "error");
                  const linkedCount = computeAbilityLinkedEffects(draft, statusEffectOptions).length;
                  const linkedModCount = database?.modCatalogAvailable ? (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length : null;
                  const deliveryType = inferAbilityDeliveryType(draft);
                  return (
                    <button
                      key={draft.key}
                      type="button"
                      onClick={() => setSelectedAbilityKey(draft.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={buildIconSrc(draft.icon, draft.id || "ability", draft.name || "Ability", sharedDataVersion)}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-[#07111d] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold text-white">{draft.name || "Unnamed Ability"}</div>
                          <div className="mt-1 truncate font-mono text-xs text-white/55">{draft.id || "missing-id"}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
                            <span className="rounded bg-white/5 px-2 py-1 capitalize">{deliveryType}</span>
                            {linkedCount ? <span className="rounded bg-white/5 px-2 py-1">{linkedCount} link{linkedCount === 1 ? "" : "s"}</span> : null}
                            {linkedModCount === null ? null : linkedModCount > 0 ? (
                              <span className="rounded bg-white/5 px-2 py-1">{linkedModCount} mod{linkedModCount === 1 ? "" : "s"}</span>
                            ) : (
                              <span className="rounded bg-amber-400/15 px-2 py-1 text-amber-100">No mod</span>
                            )}
                            {hasErrors ? <span className="rounded bg-red-400/15 px-2 py-1 text-red-100">Errors</span> : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                  No abilities match the current search or filters.
                </div>
              )}
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-lg font-semibold text-white">Validation</div>
            {selectedAbility ? (
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
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">Select an ability to review validation.</div>
            )}
          </div>
        </aside>

        <div className="space-y-6">
          {selectedAbility ? (
            <>
              <Section
                title="Ability Editor"
                description="Edit the core ability JSON fields directly. JSON effect links are exported to properties.applies_effect_ids, while script-inferred links are shown for reference."
              >
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={cloneSelectedAbility}>
                    Clone Ability
                  </button>
                  <button className="rounded border border-red-400/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={deleteSelectedAbility}>
                    Delete Ability
                  </button>
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40" disabled={selectedHasErrors} onClick={() => void handleCopyCurrentAbility()}>
                    Copy Current Ability JSON
                  </button>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={selectedHasErrors}
                    onClick={() => void handleSaveCurrentAbilityToBuild()}
                  >
                    Save Current Ability To Build
                  </button>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={selectedHasErrors}
                    onClick={() => downloadTextFile(selectedAbility.fileName.trim() || "ability.json", stringifyAbilityDraft(selectedAbility))}
                  >
                    Download Current Ability JSON
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label">Ability ID</div>
                    <input className="input mt-1" value={selectedAbility.id} onChange={(event) => updateSelectedAbility((current) => ({ ...current, id: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">File Name</div>
                    <input className="input mt-1 cursor-default text-white/70" value={selectedAbility.fileName} readOnly />
                    <div className="mt-2 text-xs text-white/45">Auto-generated as id + name in lower case.</div>
                  </div>
                  <div>
                    <div className="label">Name</div>
                    <input className="input mt-1" value={selectedAbility.name} onChange={(event) => updateSelectedAbility((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Delivery Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedAbility.deliveryType}
                      onChange={(event) =>
                        updateSelectedAbility((current) => ({
                          ...current,
                          deliveryType: event.target.value as AbilityDraft["deliveryType"],
                        }))
                      }
                    >
                      <option value="energy">Energy</option>
                      <option value="beam">Beam</option>
                      <option value="projectile">Projectile</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Script</div>
                    <input className="input mt-1" value={selectedAbility.script} onChange={(event) => updateSelectedAbility((current) => ({ ...current, script: event.target.value }))} />
                    {selectedAbility.scriptPathResolved ? <div className="mt-2 text-xs text-white/45 break-all">{selectedAbility.scriptPathResolved}</div> : null}
                  </div>
                  <div>
                    <div className="label">Threat Type</div>
                    <input className="input mt-1" value={selectedAbility.threatType} onChange={(event) => updateSelectedAbility((current) => ({ ...current, threatType: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Threat Multiplier</div>
                    <input className="input mt-1" value={selectedAbility.threatMultiplier} onChange={(event) => updateSelectedAbility((current) => ({ ...current, threatMultiplier: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Valid Targets</div>
                    <input className="input mt-1" value={selectedAbility.validTargets} onChange={(event) => updateSelectedAbility((current) => ({ ...current, validTargets: event.target.value }))} />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={selectedAbility.requiresTarget}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, requiresTarget: event.target.checked }))}
                    />
                    Requires Target
                  </label>
                  <div>
                    <div className="label">Facing Requirement</div>
                    <input className="input mt-1" value={selectedAbility.facingRequirement} onChange={(event) => updateSelectedAbility((current) => ({ ...current, facingRequirement: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Min Range Type</div>
                    <input className="input mt-1" value={selectedAbility.minRangeType} onChange={(event) => updateSelectedAbility((current) => ({ ...current, minRangeType: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Max Range Type</div>
                    <input className="input mt-1" value={selectedAbility.maxRangeType} onChange={(event) => updateSelectedAbility((current) => ({ ...current, maxRangeType: event.target.value }))} />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={selectedAbility.isGcdLocked}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, isGcdLocked: event.target.checked }))}
                    />
                    GCD Locked
                  </label>
                  <div>
                    <div className="label">Cooldown</div>
                    <input className="input mt-1" value={selectedAbility.cooldown} onChange={(event) => updateSelectedAbility((current) => ({ ...current, cooldown: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Charge Time</div>
                    <input className="input mt-1" value={selectedAbility.chargeTime} onChange={(event) => updateSelectedAbility((current) => ({ ...current, chargeTime: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Energy Cost</div>
                    <input className="input mt-1" value={selectedAbility.energyCost} onChange={(event) => updateSelectedAbility((current) => ({ ...current, energyCost: event.target.value }))} />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={selectedAbility.applyEffectsToCaster}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, applyEffectsToCaster: event.target.checked }))}
                    />
                    Apply Effects To Caster
                  </label>
                  <div>
                    <div className="label">Effect VFX Scene</div>
                    <input className="input mt-1" value={selectedAbility.effectVfxScene} onChange={(event) => updateSelectedAbility((current) => ({ ...current, effectVfxScene: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Attack Range</div>
                    <input className="input mt-1" value={selectedAbility.attackRange} onChange={(event) => updateSelectedAbility((current) => ({ ...current, attackRange: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Power Percent</div>
                    <input className="input mt-1" value={selectedAbility.powerPercent} onChange={(event) => updateSelectedAbility((current) => ({ ...current, powerPercent: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Base Damage</div>
                    <input className="input mt-1" value={selectedAbility.baseDamage} onChange={(event) => updateSelectedAbility((current) => ({ ...current, baseDamage: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Projectile Scene</div>
                    <input className="input mt-1" value={selectedAbility.projectileScene} onChange={(event) => updateSelectedAbility((current) => ({ ...current, projectileScene: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Icon</div>
                    <input className="input mt-1" value={selectedAbility.icon} onChange={(event) => updateSelectedAbility((current) => ({ ...current, icon: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="label">Description</div>
                    <textarea className="input mt-1 min-h-24" value={selectedAbility.description} onChange={(event) => updateSelectedAbility((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="label">JSON-linked Status Effects</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {statusEffectOptions.map((effect) => {
                          const checked = selectedAbility.appliesEffectIds.includes(String(effect.numericId));
                          return (
                            <label
                              key={effect.numericId}
                              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 px-4 py-3 hover:bg-white/[0.03]"
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={(event) =>
                                  updateSelectedAbility((current) => ({
                                    ...current,
                                    appliesEffectIds: event.target.checked
                                      ? [...current.appliesEffectIds, String(effect.numericId)].sort((left, right) => Number(left) - Number(right))
                                      : current.appliesEffectIds.filter((entry) => entry !== String(effect.numericId)),
                                  }))
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                                    <div className="truncate text-sm font-medium text-white">{effect.name}</div>
                                    {effect.linkedAbilityCount === 0 ? (
                                      <span className="rounded bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-100">Not linked</span>
                                    ) : null}
                                  </div>
                                  <div className="shrink-0 text-right text-xs text-white/45">
                                    {effect.numericId} · {effect.effectId || "no properties.id"}
                                  </div>
                                </div>
                                {effect.description.trim() ? <div className="mt-2 text-sm leading-5 text-white/60">{effect.description}</div> : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="label">Resolved Effect Links</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      {selectedLinkedEffects.length ? (
                        <div className="space-y-2">
                          {selectedLinkedEffects.map((link) => (
                            <div key={`${link.numericId}-${link.sources.join("-")}`} className="rounded-lg border border-white/5 px-3 py-2">
                              <div className="text-sm text-white">{link.effectName || link.effectId || `Status ${link.numericId}`}</div>
                              <div className="mt-1 text-xs text-white/45">
                                {link.numericId} · {sourceLabel(link.sources)} {link.missing ? "· Missing from status effect files" : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-white/45">No linked status effects detected for this ability yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="label">Mods Using This Ability</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    {!database?.modCatalogAvailable ? (
                      <div className="text-sm text-white/45">No mod data is currently available from the local game root.</div>
                    ) : selectedLinkedMods.length ? (
                      <div className="space-y-2">
                        {selectedLinkedMods.map((mod) => (
                          <div key={mod.id} className="rounded-lg border border-white/5 px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm text-white">{mod.name}</div>
                                <div className="mt-1 text-xs text-white/45">{mod.id}</div>
                              </div>
                              <div className="shrink-0 text-right text-xs text-white/45">
                                <div>{mod.slot || "Unknown slot"}</div>
                                <div>
                                  Lvl {mod.levelRequirement} · Rarity {mod.rarity}
                                </div>
                              </div>
                            </div>
                            {mod.description ? <div className="mt-2 text-sm leading-5 text-white/60">{mod.description}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-white/45">No mods currently include this ability.</div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label">Additional Runtime JSON</div>
                    <textarea
                      className="input mt-1 min-h-64 font-mono text-sm"
                      value={selectedAbility.extraPropertiesJson}
                      placeholder='{"power_percent": 0.35, "valid_targets": 1}'
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, extraPropertiesJson: event.target.value }))}
                    />
                  </div>
                  <div>
                    <div className="label">Additional Root JSON</div>
                    <textarea
                      className="input mt-1 min-h-64 font-mono text-sm"
                      value={selectedAbility.extraRootJson}
                      placeholder='{"metadata/_custom_type_script": "uid://..."}'
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, extraRootJson: event.target.value }))}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Preview" description="Quick view of the current ability icon, description, and linked status-effect behavior.">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start">
                    <img src={previewIcon} alt="" className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 bg-[#07111d] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="text-3xl font-semibold text-white">{selectedAbility.name || "Unnamed Ability"}</div>
                      <div className="mt-2 font-mono text-xs text-white/55">{selectedAbility.id || "missing-id"}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/65">
                        <span className="rounded bg-white/5 px-2 py-1 capitalize">{inferAbilityDeliveryType(selectedAbility)}</span>
                        {selectedAbility.threatType.trim() ? <span className="rounded bg-white/5 px-2 py-1">Threat Type {selectedAbility.threatType}</span> : null}
                        {selectedAbility.cooldown.trim() ? <span className="rounded bg-white/5 px-2 py-1">Cooldown {selectedAbility.cooldown}</span> : null}
                        {selectedAbility.energyCost.trim() ? <span className="rounded bg-white/5 px-2 py-1">Energy {selectedAbility.energyCost}</span> : null}
                      </div>
                      {selectedAbility.description.trim() ? <div className="mt-4 max-w-3xl text-sm leading-6 text-white/70">{selectedAbility.description}</div> : null}
                      {selectedLinkedEffects.length ? (
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                          {selectedLinkedEffects.map((link) => (
                            <span key={`${link.numericId}-${link.sources.join("-")}`} className="rounded bg-white/5 px-2 py-1">
                              {link.effectName || `Status ${link.numericId}`} · {sourceLabel(link.sources)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Export Preview" description="The full ability bundle still exports as indexed per-file JSON, matching the real game data layout.">
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={() => void handleCopyIndexJson()}>
                    Copy Updated _AbilityIndex.json
                  </button>
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40" disabled={workspaceHasErrors} onClick={() => void handleDownloadBundle()}>
                    Download abilities bundle.zip
                  </button>
                </div>
                <pre className="max-h-[28rem] overflow-auto rounded-xl border border-white/10 bg-[#08101c] p-4 text-sm text-white/80">{abilityIndexJson}</pre>
              </Section>
            </>
          ) : (
            <Section title="No Ability Selected" description="Create a new ability or pick one from the left sidebar to start editing.">
              <button className="btn" onClick={addBlankAbility}>
                New Ability
              </button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
