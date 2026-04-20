"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { MOD_SLOT_OPTIONS, RARITY_LABEL } from "@lib/constants";
import type { AbilityDraft, AbilityManagerDatabase, AbilityManagerModOption, AbilityManagerValidationIssue } from "@lib/ability-manager/types";
import {
  computeAbilityLinkedEffects,
  isAbilityExcludedFromModLinkChecks,
  normalizeAbilityReference,
  statusEffectOptionsFromDatabase,
  syncDerivedAbilityFields,
  validateAbilityDrafts,
} from "@lib/ability-manager/utils";
import {
  DismissibleStatusBanner,
  EMPTY_TIMED_STATUS,
  Section,
  StatusBanner,
  SummaryCard,
  buildIconSrc,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { useAbilityDatabase } from "@components/ability-manager/useAbilityDatabase";

type AbilityValueOption = {
  value: string;
  label: string;
  description: string;
};

type AbilityFlagOption = {
  value: number;
  label: string;
  description: string;
};

type BulkTextField = {
  enabled: boolean;
  value: string;
};

type BulkBooleanField = {
  enabled: boolean;
  value: boolean;
};

type BulkTargetsField = {
  enabled: boolean;
  enemy: boolean;
  neutral: boolean;
  ally: boolean;
  self: boolean;
};

type BulkCooldownField = {
  enabled: boolean;
  minutes: string;
  seconds: string;
};

type BulkEditState = {
  deliveryType: BulkTextField;
  threatType: BulkTextField;
  threatMultiplier: BulkTextField;
  validTargets: BulkTargetsField;
  requiresTarget: BulkBooleanField;
  facingRequirement: BulkTextField;
  minRangeType: BulkTextField;
  maxRangeType: BulkTextField;
  cooldown: BulkCooldownField;
  chargeTime: BulkTextField;
  energyCost: BulkTextField;
  isGcdLocked: BulkBooleanField;
  rarity: BulkTextField;
  minimumModLevel: BulkTextField;
  primaryModSlot: BulkTextField;
  secondaryModSlot: BulkTextField;
  applyEffectsToCaster: BulkBooleanField;
};

type BulkSummaryFilter = "all" | "errors" | "warnings" | "linkedMods" | "unlinkedMods" | "linkedEffects";

const THREAT_TYPE_OPTIONS: AbilityValueOption[] = [
  { value: "0", label: "None", description: "No threat is generated when this ability resolves." },
  { value: "1", label: "Damage", description: "Threat is based on damage dealt, then scaled by the threat multiplier." },
  { value: "2", label: "Heal", description: "Threat is based on healing done, then scaled by the threat multiplier." },
  { value: "3", label: "Buff", description: "Buff threat is applied to enemies already engaged with the buffed target." },
  { value: "4", label: "Custom", description: "Threat comes from custom script logic such as get_custom_threat()." },
];

const VALID_TARGET_FLAGS: AbilityFlagOption[] = [
  { value: 1, label: "Enemy", description: "Enemy targets. In current game logic, Neutral reputation also passes this check." },
  { value: 2, label: "Neutral", description: "Neutral targets only." },
  { value: 4, label: "Ally", description: "Allied targets only." },
  { value: 8, label: "Self", description: "The user can target itself." },
];

const FACING_REQUIREMENT_OPTIONS: AbilityValueOption[] = [
  { value: "0", label: "Any", description: "No facing restriction." },
  { value: "1", label: "Front", description: "Target must be within 45 degrees of the forward arc." },
  { value: "2", label: "Rear", description: "Target must be behind the ship, roughly 135 to 225 degrees." },
  { value: "3", label: "Side", description: "Target must be in a side arc, roughly 45 to 135 or 225 to 315 degrees." },
];

const RANGE_TYPE_OPTIONS: AbilityValueOption[] = [
  { value: "0", label: "Point Blank", description: "0 to 500 range." },
  { value: "1", label: "Mid", description: "501 to 1000 range." },
  { value: "2", label: "Normal", description: "1001 to 2000 range." },
  { value: "3", label: "Long", description: "2001 to 3000 range." },
];

const DELIVERY_TYPE_OPTIONS: AbilityValueOption[] = [
  { value: "energy", label: "Energy", description: "Energy delivery type." },
  { value: "beam", label: "Beam", description: "Beam delivery type." },
  { value: "projectile", label: "Projectile", description: "Projectile delivery type." },
  { value: "other", label: "Other", description: "Any non-standard delivery type." },
];

const ABILITY_RARITY_OPTIONS: AbilityValueOption[] = Object.entries(RARITY_LABEL).map(([value, label]) => ({
  value,
  label,
  description: `${label} or higher mods can use this ability.`,
}));

const MOD_LEVEL_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));

const EMPTY_BULK_EDIT_STATE: BulkEditState = {
  deliveryType: { enabled: false, value: "other" },
  threatType: { enabled: false, value: "0" },
  threatMultiplier: { enabled: false, value: "1" },
  validTargets: { enabled: false, enemy: false, neutral: false, ally: false, self: false },
  requiresTarget: { enabled: false, value: false },
  facingRequirement: { enabled: false, value: "0" },
  minRangeType: { enabled: false, value: "0" },
  maxRangeType: { enabled: false, value: "3" },
  cooldown: { enabled: false, minutes: "", seconds: "" },
  chargeTime: { enabled: false, value: "" },
  energyCost: { enabled: false, value: "" },
  isGcdLocked: { enabled: false, value: true },
  rarity: { enabled: false, value: "" },
  minimumModLevel: { enabled: false, value: "" },
  primaryModSlot: { enabled: false, value: "" },
  secondaryModSlot: { enabled: false, value: "" },
  applyEffectsToCaster: { enabled: false, value: false },
};

function selectInputContentsOnFocus(event: FocusEvent<HTMLInputElement>) {
  const target = event.currentTarget;
  window.requestAnimationFrame(() => target.select());
}

function buildDurationValue(minutesValue: string, secondsValue: string) {
  const trimmedMinutes = minutesValue.trim();
  const trimmedSeconds = secondsValue.trim();
  if (!trimmedMinutes && !trimmedSeconds) return "";

  const minutes = trimmedMinutes ? Number(trimmedMinutes) : 0;
  const seconds = trimmedSeconds ? Number(trimmedSeconds) : 0;
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return "";

  return String(Math.max(0, Math.round(minutes)) * 60 + Math.max(0, Math.round(seconds)));
}

function buildValidTargetsValue(field: BulkTargetsField) {
  const mask = (field.enemy ? 1 : 0) | (field.neutral ? 2 : 0) | (field.ally ? 4 : 0) | (field.self ? 8 : 0);
  return mask ? String(mask) : "";
}

function enabledFieldCount(state: BulkEditState) {
  return [
    state.deliveryType.enabled,
    state.threatType.enabled,
    state.threatMultiplier.enabled,
    state.validTargets.enabled,
    state.requiresTarget.enabled,
    state.facingRequirement.enabled,
    state.minRangeType.enabled,
    state.maxRangeType.enabled,
    state.cooldown.enabled,
    state.chargeTime.enabled,
    state.energyCost.enabled,
    state.isGcdLocked.enabled,
    state.rarity.enabled,
    state.minimumModLevel.enabled,
    state.primaryModSlot.enabled,
    state.secondaryModSlot.enabled,
    state.applyEffectsToCaster.enabled,
  ].filter(Boolean).length;
}

function BulkFieldRow({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <label className="flex items-start gap-3 text-sm text-white/75">
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} className="mt-1" />
        <div>
          <div className="font-medium text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-white/45">{description}</div>
        </div>
      </label>
      <div className={enabled ? "opacity-100" : "pointer-events-none opacity-45"}>{children}</div>
    </div>
  );
}

export default function AbilityBulkEditorApp() {
  const { database: loadedDatabase, loading, error } = useAbilityDatabase();
  const [database, setDatabase] = useState<AbilityManagerDatabase | null>(null);
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [modFilter, setModFilter] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selectedAbilityKeys, setSelectedAbilityKeys] = useState<string[]>([]);
  const [bulkEdit, setBulkEdit] = useState<BulkEditState>(EMPTY_BULK_EDIT_STATE);
  const [status, setStatus] = useState<TimedStatusState>(EMPTY_TIMED_STATUS);
  const statusTopRef = useRef<HTMLDivElement | null>(null);
  const statusCountdown = useDismissibleStatusCountdown(status, () => setStatus(EMPTY_TIMED_STATUS));

  useEffect(() => {
    const syncedDatabase = loadedDatabase
      ? {
          ...loadedDatabase,
          abilities: loadedDatabase.abilities.map((draft) => syncDerivedAbilityFields(draft)),
        }
      : null;
    setDatabase(syncedDatabase);
  }, [loadedDatabase]);

  useEffect(() => {
    if (!database) {
      setSelectedAbilityKeys([]);
      return;
    }
    const validKeys = new Set(database.abilities.map((draft) => draft.key));
    setSelectedAbilityKeys((current) => current.filter((key) => validKeys.has(key)));
  }, [database]);

  const statusEffectOptions = useMemo(() => statusEffectOptionsFromDatabase(database), [database]);
  const abilityIssues = useMemo(
    () => validateAbilityDrafts(database?.abilities ?? [], statusEffectOptions, database?.mods ?? [], database?.modCatalogAvailable ?? false),
    [database, statusEffectOptions],
  );
  const abilityIssuesByKey = useMemo(() => {
    const next = new Map<string, AbilityManagerValidationIssue[]>();
    for (const issue of abilityIssues) {
      const current = next.get(issue.draftKey) ?? [];
      current.push(issue);
      next.set(issue.draftKey, current);
    }
    return next;
  }, [abilityIssues]);
  const abilityIssueFlagsByKey = useMemo(() => {
    const next = new Map<string, { error: boolean; warning: boolean }>();
    for (const [draftKey, issues] of abilityIssuesByKey.entries()) {
      next.set(draftKey, {
        error: issues.some((issue) => issue.level === "error"),
        warning: issues.some((issue) => issue.level === "warning"),
      });
    }
    return next;
  }, [abilityIssuesByKey]);
  const errorDraftCount = useMemo(() => Array.from(abilityIssueFlagsByKey.values()).filter((entry) => entry.error).length, [abilityIssueFlagsByKey]);
  const warningDraftCount = useMemo(() => Array.from(abilityIssueFlagsByKey.values()).filter((entry) => entry.warning).length, [abilityIssueFlagsByKey]);
  const workspaceHasErrors = abilityIssues.some((issue) => issue.level === "error");
  const selectedKeySet = useMemo(() => new Set(selectedAbilityKeys), [selectedAbilityKeys]);

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
        if (selectedOnly && !selectedKeySet.has(draft.key)) return false;
        return true;
      })
      .filter((draft) => {
        if (!query) return true;
        return [draft.id, draft.name, draft.description, draft.script, draft.fileName].join(" ").toLowerCase().includes(query);
      })
      .filter((draft) => (deliveryFilter ? draft.deliveryType === deliveryFilter : true))
      .filter((draft) => {
        if (!linkedFilter) return true;
        const linkedCount = computeAbilityLinkedEffects(draft, statusEffectOptions).length;
        return linkedFilter === "linked" ? linkedCount > 0 : linkedCount === 0;
      })
      .filter((draft) => {
        if (!validationFilter) return true;
        const flags = abilityIssueFlagsByKey.get(draft.key);
        if (validationFilter === "errors") return Boolean(flags?.error);
        if (validationFilter === "warnings") return Boolean(flags?.warning);
        return true;
      })
      .filter((draft) => {
        if (!modFilter || !database?.modCatalogAvailable) return true;
        if (isAbilityExcludedFromModLinkChecks(draft)) return false;
        const linkedModCount = (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length;
        return modFilter === "linked" ? linkedModCount > 0 : linkedModCount === 0;
      })
      .sort((left, right) => {
        const leftLabel = (left.name || left.id || "").trim().toLowerCase();
        const rightLabel = (right.name || right.id || "").trim().toLowerCase();
        const byLabel = leftLabel.localeCompare(rightLabel);
        if (byLabel !== 0) return byLabel;
        return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
      });
  }, [abilityIssueFlagsByKey, database, deliveryFilter, linkedFilter, modFilter, modLinksByAbilityId, search, selectedKeySet, selectedOnly, statusEffectOptions, validationFilter]);

  const effectLinkedCount = useMemo(
    () => (database?.abilities ?? []).filter((draft) => computeAbilityLinkedEffects(draft, statusEffectOptions).length > 0).length,
    [database?.abilities, statusEffectOptions],
  );
  const modAssignableAbilities = useMemo(
    () => (database?.abilities ?? []).filter((draft) => !isAbilityExcludedFromModLinkChecks(draft)),
    [database?.abilities],
  );
  const modLinkedCount = useMemo(
    () =>
      database?.modCatalogAvailable
        ? modAssignableAbilities.filter((draft) => (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length > 0).length
        : 0,
    [database?.modCatalogAvailable, modAssignableAbilities, modLinksByAbilityId],
  );
  const orphanModCount = useMemo(
    () =>
      database?.modCatalogAvailable
        ? modAssignableAbilities.filter((draft) => (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length === 0).length
        : 0,
    [database?.modCatalogAvailable, modAssignableAbilities, modLinksByAbilityId],
  );

  const selectedAbilities = useMemo(
    () => (database?.abilities ?? []).filter((draft) => selectedKeySet.has(draft.key)),
    [database?.abilities, selectedKeySet],
  );
  const selectedErrorCount = useMemo(
    () => selectedAbilities.filter((draft) => abilityIssueFlagsByKey.get(draft.key)?.error).length,
    [abilityIssueFlagsByKey, selectedAbilities],
  );
  const selectedWarningCount = useMemo(
    () => selectedAbilities.filter((draft) => abilityIssueFlagsByKey.get(draft.key)?.warning).length,
    [abilityIssueFlagsByKey, selectedAbilities],
  );
  const selectedCount = selectedAbilities.length;
  const enabledBulkFieldTotal = useMemo(() => enabledFieldCount(bulkEdit), [bulkEdit]);

  function applySummaryFilter(filter: BulkSummaryFilter) {
    setSearch("");
    setSelectedOnly(false);

    if (filter === "all") {
      setDeliveryFilter("");
      setLinkedFilter("");
      setValidationFilter("");
      setModFilter("");
      return;
    }

    setDeliveryFilter("");
    setLinkedFilter(filter === "linkedEffects" ? "linked" : "");
    setValidationFilter(filter === "errors" || filter === "warnings" ? filter : "");
    setModFilter(filter === "linkedMods" ? "linked" : filter === "unlinkedMods" ? "unlinked" : "");
  }

  function resetFilters() {
    setSearch("");
    setDeliveryFilter("");
    setLinkedFilter("");
    setValidationFilter("");
    setModFilter("");
    setSelectedOnly(false);
  }

  function toggleAbilitySelection(draftKey: string) {
    setSelectedAbilityKeys((current) => (current.includes(draftKey) ? current.filter((entry) => entry !== draftKey) : [...current, draftKey]));
  }

  function selectAllFiltered() {
    setSelectedAbilityKeys((current) => Array.from(new Set([...current, ...filteredAbilities.map((draft) => draft.key)])));
  }

  function clearSelection() {
    setSelectedAbilityKeys([]);
  }

  function applyBulkEditToSelection() {
    if (!database) return;
    if (!selectedCount) {
      setStatus({ tone: "error", message: "Select at least one ability before applying bulk edits.", dismissAfterMs: 5000 });
      return;
    }
    if (!enabledBulkFieldTotal) {
      setStatus({ tone: "error", message: "Enable at least one bulk edit field before applying changes.", dismissAfterMs: 5000 });
      return;
    }

    const nextAbilities = database.abilities.map((draft) => {
      if (!selectedKeySet.has(draft.key)) return draft;

      const nextDraft: AbilityDraft = {
        ...draft,
        deliveryType: bulkEdit.deliveryType.enabled ? (bulkEdit.deliveryType.value as AbilityDraft["deliveryType"]) : draft.deliveryType,
        threatType: bulkEdit.threatType.enabled ? bulkEdit.threatType.value : draft.threatType,
        threatMultiplier: bulkEdit.threatMultiplier.enabled ? bulkEdit.threatMultiplier.value : draft.threatMultiplier,
        validTargets: bulkEdit.validTargets.enabled ? buildValidTargetsValue(bulkEdit.validTargets) : draft.validTargets,
        requiresTarget: bulkEdit.requiresTarget.enabled ? bulkEdit.requiresTarget.value : draft.requiresTarget,
        facingRequirement: bulkEdit.facingRequirement.enabled ? bulkEdit.facingRequirement.value : draft.facingRequirement,
        minRangeType: bulkEdit.minRangeType.enabled ? bulkEdit.minRangeType.value : draft.minRangeType,
        maxRangeType: bulkEdit.maxRangeType.enabled ? bulkEdit.maxRangeType.value : draft.maxRangeType,
        cooldown: bulkEdit.cooldown.enabled ? buildDurationValue(bulkEdit.cooldown.minutes, bulkEdit.cooldown.seconds) : draft.cooldown,
        chargeTime: bulkEdit.chargeTime.enabled ? bulkEdit.chargeTime.value : draft.chargeTime,
        energyCost: bulkEdit.energyCost.enabled ? bulkEdit.energyCost.value : draft.energyCost,
        isGcdLocked: bulkEdit.isGcdLocked.enabled ? bulkEdit.isGcdLocked.value : draft.isGcdLocked,
        rarity: bulkEdit.rarity.enabled ? bulkEdit.rarity.value : draft.rarity,
        minimumModLevel: bulkEdit.minimumModLevel.enabled ? bulkEdit.minimumModLevel.value : draft.minimumModLevel,
        primaryModSlot: bulkEdit.primaryModSlot.enabled ? bulkEdit.primaryModSlot.value : draft.primaryModSlot,
        secondaryModSlot: bulkEdit.secondaryModSlot.enabled ? bulkEdit.secondaryModSlot.value : draft.secondaryModSlot,
        applyEffectsToCaster: bulkEdit.applyEffectsToCaster.enabled ? bulkEdit.applyEffectsToCaster.value : draft.applyEffectsToCaster,
      };

      return syncDerivedAbilityFields(nextDraft);
    });

    setDatabase({
      ...database,
      abilities: nextAbilities,
    });
    setStatus({
      tone: "success",
      message: `Updated ${selectedCount} selected abilit${selectedCount === 1 ? "y" : "ies"} across ${enabledBulkFieldTotal} bulk field${enabledBulkFieldTotal === 1 ? "" : "s"}.`,
      dismissAfterMs: 8000,
    });
    statusTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSaveAllAbilitiesToBuild() {
    if (!database || workspaceHasErrors) return;

    try {
      const response = await fetch("/api/abilities/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drafts: database.abilities,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save all abilities into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      const savedPathsByKey = payload?.savedPathsByKey && typeof payload.savedPathsByKey === "object" ? (payload.savedPathsByKey as Record<string, string>) : {};
      setDatabase({
        ...database,
        abilities: database.abilities.map((draft) =>
          syncDerivedAbilityFields({
            ...draft,
            sourcePath: typeof savedPathsByKey[draft.key] === "string" ? savedPathsByKey[draft.key] : draft.sourcePath,
          }),
        ),
      });

      const removedCount = Number(payload?.removedCount) || 0;
      setStatus({
        tone: "success",
        message: `Saved all ${database.abilities.length} abilities into the game build and updated _AbilityIndex.json${
          removedCount ? `, removing ${removedCount} old file${removedCount === 1 ? "" : "s"}` : ""
        }.`,
        dismissAfterMs: 10000,
      });
      statusTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (nextError) {
      setStatus({
        tone: "error",
        message: nextError instanceof Error ? nextError.message : String(nextError),
        dismissAfterMs: null,
      });
    }
  }

  if (loading && !database) return <div>Loading…</div>;

  if (!database) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">Ability Bulk Edit</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Bulk edit shared ability gameplay fields from the active local game root.
          </p>
        </div>
        <StatusBanner tone="error" message={error || "No ability data is currently available. Check Settings."} />
        <Section title="No Ability Data Loaded">
          <p className="text-sm leading-6 text-white/65">
            Set your Gemini Station folder in Settings and this bulk editor will load the current ability data automatically.
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
          <h1 className="page-title mb-1">Ability Bulk Edit</h1>
          <p className="text-sm text-white/70">
            Filter the ability library, select any subset, and apply shared gameplay changes in one pass without touching IDs, file names, or names.
          </p>
        </div>
        <button
          className="btn-save-build disabled:cursor-default disabled:opacity-40"
          disabled={!database || workspaceHasErrors}
          onClick={() => void handleSaveAllAbilitiesToBuild()}
        >
          Save All Abilities To Build
        </button>
      </div>

      <div ref={statusTopRef} />
      {status.tone !== "neutral" && status.message ? (
        <DismissibleStatusBanner
          tone={status.tone}
          message={status.message}
          onDismiss={() => setStatus(EMPTY_TIMED_STATUS)}
          countdownSeconds={statusCountdown}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Abilities" value={database.abilities.length} active={!deliveryFilter && !linkedFilter && !validationFilter && !modFilter} onClick={() => applySummaryFilter("all")} />
        <SummaryCard label="Errors" value={errorDraftCount} active={validationFilter === "errors"} accent={errorDraftCount ? "text-red-200" : undefined} onClick={() => applySummaryFilter("errors")} />
        <SummaryCard label="Warnings" value={warningDraftCount} active={validationFilter === "warnings"} accent={warningDraftCount ? "text-yellow-100" : undefined} onClick={() => applySummaryFilter("warnings")} />
        <SummaryCard label="Linked Mods" value={database.modCatalogAvailable ? modLinkedCount : "N/A"} active={database.modCatalogAvailable && modFilter === "linked"} disabled={!database.modCatalogAvailable} onClick={database.modCatalogAvailable ? () => applySummaryFilter("linkedMods") : undefined} />
        <SummaryCard label="No Mods" value={database.modCatalogAvailable ? orphanModCount : "N/A"} active={database.modCatalogAvailable && modFilter === "unlinked"} accent={database.modCatalogAvailable && orphanModCount ? "text-amber-200" : database.modCatalogAvailable ? undefined : "text-white/55"} disabled={!database.modCatalogAvailable} onClick={database.modCatalogAvailable ? () => applySummaryFilter("unlinkedMods") : undefined} />
        <SummaryCard label="Linked Effects" value={effectLinkedCount} active={linkedFilter === "linked"} onClick={() => applySummaryFilter("linkedEffects")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:min-w-0">
          <Section title="Ability Selection" description={`${selectedCount} selected · ${filteredAbilities.length} filtered · ${database.abilities.length} total`}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  className={`rounded border px-3 py-2 text-left transition ${
                    validationFilter === "errors"
                      ? "border-red-300/80 bg-red-500/20 text-red-50"
                      : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  }`}
                  onClick={() => setValidationFilter(validationFilter === "errors" ? "" : "errors")}
                >
                  <div className="label text-red-100/80">Errors</div>
                  <div className="mt-1 text-lg font-semibold">{errorDraftCount}</div>
                </button>
                <button
                  className={`rounded border px-3 py-2 text-left transition ${
                    validationFilter === "warnings"
                      ? "border-yellow-300/80 bg-yellow-500/20 text-yellow-50"
                      : "border-yellow-400/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
                  }`}
                  onClick={() => setValidationFilter(validationFilter === "warnings" ? "" : "warnings")}
                >
                  <div className="label text-yellow-100/80">Warnings</div>
                  <div className="mt-1 text-lg font-semibold">{warningDraftCount}</div>
                </button>
              </div>
              <button className="btn w-full" onClick={resetFilters}>
                Reset Filter
              </button>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, name, description, script, or file..." />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <div className="label">Delivery Type</div>
                  <select className="select mt-1 w-full" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}>
                    <option value="">All</option>
                    {DELIVERY_TYPE_OPTIONS.map((option) => (
                      <option key={`filter-delivery-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Effect Links</div>
                  <select className="select mt-1 w-full" value={linkedFilter} onChange={(event) => setLinkedFilter(event.target.value)}>
                    <option value="">All</option>
                    <option value="linked">Linked</option>
                    <option value="unlinked">No linked effects</option>
                  </select>
                </div>
                <div>
                  <div className="label">Mod Links</div>
                  <select className="select mt-1 w-full" value={modFilter} onChange={(event) => setModFilter(event.target.value)} disabled={!database.modCatalogAvailable}>
                    <option value="">All</option>
                    <option value="linked">Linked to mods</option>
                    <option value="unlinked">No linked mods</option>
                  </select>
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm text-white/70">
                  <input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />
                  Show selected only
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={selectAllFiltered} disabled={!filteredAbilities.length}>
                  Select All Filtered
                </button>
                <button className="btn" onClick={clearSelection} disabled={!selectedCount}>
                  Clear Selection
                </button>
              </div>

              <div className="max-h-[52rem] space-y-2 overflow-y-auto pr-1">
                {filteredAbilities.length ? (
                  filteredAbilities.map((draft) => {
                    const flags = abilityIssueFlagsByKey.get(draft.key);
                    const linkedEffectCount = computeAbilityLinkedEffects(draft, statusEffectOptions).length;
                    const linkedModCount = database.modCatalogAvailable ? (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length : 0;
                    const selected = selectedKeySet.has(draft.key);

                    return (
                      <button
                        key={draft.key}
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                        }`}
                        onClick={() => toggleAbilitySelection(draft.key)}
                      >
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={selected} readOnly className="mt-1" />
                          <img
                            src={buildIconSrc(draft.icon || "icon_lootbox.png", draft.id || "ability", draft.name || "Ability")}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-xl border border-white/10 bg-[#07111d] object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-base font-medium text-white">{draft.name || "Unnamed Ability"}</div>
                                <div className="mt-1 truncate text-xs text-white/45">
                                  {draft.id} · {draft.deliveryType} · {draft.fileName}
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-2 text-xs">
                                {flags?.error ? <span className="rounded bg-red-500/15 px-2 py-1 font-medium text-red-100">Error</span> : null}
                                {!flags?.error && flags?.warning ? <span className="rounded bg-yellow-500/15 px-2 py-1 font-medium text-yellow-100">Warning</span> : null}
                              </div>
                            </div>
                            {draft.description.trim() ? <div className="mt-2 line-clamp-2 text-sm leading-5 text-white/60">{draft.description}</div> : null}
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/65">
                              <span className="rounded bg-white/5 px-2 py-1">{linkedEffectCount} effect{linkedEffectCount === 1 ? "" : "s"}</span>
                              {database.modCatalogAvailable ? (
                                <span className="rounded bg-white/5 px-2 py-1">{linkedModCount} mod{linkedModCount === 1 ? "" : "s"}</span>
                              ) : null}
                              {draft.minimumModLevel.trim() ? <span className="rounded bg-white/5 px-2 py-1">Min lvl {draft.minimumModLevel}</span> : null}
                              {draft.rarity.trim() ? <span className="rounded bg-white/5 px-2 py-1">{RARITY_LABEL[Number(draft.rarity)] ?? `Rarity ${draft.rarity}`}</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-white/45">
                    No abilities match the current filters.
                  </div>
                )}
              </div>
            </div>
          </Section>
        </aside>

        <div className="space-y-6 xl:min-w-0">
          <Section
            title="Bulk Edit Selected Abilities"
            description="Enable only the fields you want to overwrite. Blank optional values clear that field on every selected ability."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/60">
                {selectedCount} selected · {selectedErrorCount} with errors · {selectedWarningCount} with warnings
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => setBulkEdit(EMPTY_BULK_EDIT_STATE)}>
                  Reset Bulk Form
                </button>
                <button className="btn-save-build disabled:cursor-default disabled:opacity-40" onClick={applyBulkEditToSelection} disabled={!selectedCount || !enabledBulkFieldTotal}>
                  Apply To Selected
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <BulkFieldRow
                title="Delivery Type"
                description="Replace the delivery type on every selected ability."
                enabled={bulkEdit.deliveryType.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, deliveryType: { ...current.deliveryType, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.deliveryType.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, deliveryType: { ...current.deliveryType, value: event.target.value } }))}
                >
                  {DELIVERY_TYPE_OPTIONS.map((option) => (
                    <option key={`bulk-delivery-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Threat Type"
                description="Replace the threat type on every selected ability."
                enabled={bulkEdit.threatType.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, threatType: { ...current.threatType, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.threatType.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, threatType: { ...current.threatType, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {THREAT_TYPE_OPTIONS.map((option) => (
                    <option key={`bulk-threat-type-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Threat Multiplier"
                description="Apply the same threat multiplier to every selected ability."
                enabled={bulkEdit.threatMultiplier.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, threatMultiplier: { ...current.threatMultiplier, enabled: checked } }))}
              >
                <input
                  className="input"
                  value={bulkEdit.threatMultiplier.value}
                  onFocus={selectInputContentsOnFocus}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, threatMultiplier: { ...current.threatMultiplier, value: event.target.value } }))}
                  placeholder="1"
                />
              </BulkFieldRow>

              <BulkFieldRow
                title="Valid Targets"
                description="Replace the valid-target bitmask on every selected ability."
                enabled={bulkEdit.validTargets.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, validTargets: { ...current.validTargets, enabled: checked } }))}
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {VALID_TARGET_FLAGS.map((flag) => {
                    const key = flag.label.toLowerCase() as "enemy" | "neutral" | "ally" | "self";
                    return (
                      <label key={`bulk-valid-target-${flag.value}`} className="rounded-lg border border-white/10 px-3 py-3 text-sm text-white/75">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={bulkEdit.validTargets[key]}
                            onChange={(event) =>
                              setBulkEdit((current) => ({
                                ...current,
                                validTargets: {
                                  ...current.validTargets,
                                  [key]: event.target.checked,
                                },
                              }))
                            }
                          />
                          <div className="font-medium text-white">{flag.label}</div>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-white/45">{flag.description}</div>
                      </label>
                    );
                  })}
                </div>
              </BulkFieldRow>

              <BulkFieldRow
                title="Requires Target"
                description="Set whether a specific target is required to use the selected abilities."
                enabled={bulkEdit.requiresTarget.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, requiresTarget: { ...current.requiresTarget, enabled: checked } }))}
              >
                <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-3 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={bulkEdit.requiresTarget.value}
                    onChange={(event) => setBulkEdit((current) => ({ ...current, requiresTarget: { ...current.requiresTarget, value: event.target.checked } }))}
                  />
                  Requires target
                </label>
              </BulkFieldRow>

              <BulkFieldRow
                title="Facing Requirement"
                description="Replace the facing requirement on every selected ability."
                enabled={bulkEdit.facingRequirement.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, facingRequirement: { ...current.facingRequirement, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.facingRequirement.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, facingRequirement: { ...current.facingRequirement, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {FACING_REQUIREMENT_OPTIONS.map((option) => (
                    <option key={`bulk-facing-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Range Types"
                description="Apply both minimum and maximum range types to every selected ability."
                enabled={bulkEdit.minRangeType.enabled || bulkEdit.maxRangeType.enabled}
                onToggle={(checked) =>
                  setBulkEdit((current) => ({
                    ...current,
                    minRangeType: { ...current.minRangeType, enabled: checked },
                    maxRangeType: { ...current.maxRangeType, enabled: checked },
                  }))
                }
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="label">Min Range Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={bulkEdit.minRangeType.value}
                      onChange={(event) => setBulkEdit((current) => ({ ...current, minRangeType: { ...current.minRangeType, value: event.target.value } }))}
                    >
                      <option value="">Not set</option>
                      {RANGE_TYPE_OPTIONS.map((option) => (
                        <option key={`bulk-min-range-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="label">Max Range Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={bulkEdit.maxRangeType.value}
                      onChange={(event) => setBulkEdit((current) => ({ ...current, maxRangeType: { ...current.maxRangeType, value: event.target.value } }))}
                    >
                      <option value="">Not set</option>
                      {RANGE_TYPE_OPTIONS.map((option) => (
                        <option key={`bulk-max-range-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </BulkFieldRow>

              <BulkFieldRow
                title="Cooldown"
                description="Apply the same cooldown to every selected ability."
                enabled={bulkEdit.cooldown.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, cooldown: { ...current.cooldown, enabled: checked } }))}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="label">Minutes</div>
                    <input
                      className="input mt-1"
                      type="number"
                      min="0"
                      step="1"
                      value={bulkEdit.cooldown.minutes}
                      onFocus={selectInputContentsOnFocus}
                      onChange={(event) => setBulkEdit((current) => ({ ...current, cooldown: { ...current.cooldown, minutes: event.target.value } }))}
                    />
                  </div>
                  <div>
                    <div className="label">Seconds</div>
                    <input
                      className="input mt-1"
                      type="number"
                      min="0"
                      step="1"
                      value={bulkEdit.cooldown.seconds}
                      onFocus={selectInputContentsOnFocus}
                      onChange={(event) => setBulkEdit((current) => ({ ...current, cooldown: { ...current.cooldown, seconds: event.target.value } }))}
                    />
                  </div>
                </div>
              </BulkFieldRow>

              <BulkFieldRow
                title="Charge Time"
                description="Apply the same charge time to every selected ability."
                enabled={bulkEdit.chargeTime.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, chargeTime: { ...current.chargeTime, enabled: checked } }))}
              >
                <input
                  className="input"
                  value={bulkEdit.chargeTime.value}
                  onFocus={selectInputContentsOnFocus}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, chargeTime: { ...current.chargeTime, value: event.target.value } }))}
                />
              </BulkFieldRow>

              <BulkFieldRow
                title="Energy Cost"
                description="Apply the same energy cost to every selected ability."
                enabled={bulkEdit.energyCost.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, energyCost: { ...current.energyCost, enabled: checked } }))}
              >
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={bulkEdit.energyCost.value}
                  onFocus={selectInputContentsOnFocus}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, energyCost: { ...current.energyCost, value: event.target.value } }))}
                />
              </BulkFieldRow>

              <BulkFieldRow
                title="GCD Locked"
                description="Set whether the selected abilities are GCD locked."
                enabled={bulkEdit.isGcdLocked.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, isGcdLocked: { ...current.isGcdLocked, enabled: checked } }))}
              >
                <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-3 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={bulkEdit.isGcdLocked.value}
                    onChange={(event) => setBulkEdit((current) => ({ ...current, isGcdLocked: { ...current.isGcdLocked, value: event.target.checked } }))}
                  />
                  GCD locked
                </label>
              </BulkFieldRow>

              <BulkFieldRow
                title="Rarity"
                description="Set the minimum required mod rarity for every selected ability."
                enabled={bulkEdit.rarity.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, rarity: { ...current.rarity, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.rarity.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, rarity: { ...current.rarity, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {ABILITY_RARITY_OPTIONS.map((option) => (
                    <option key={`bulk-rarity-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Minimum Mod Level"
                description="Set the minimum required mod level for every selected ability."
                enabled={bulkEdit.minimumModLevel.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, minimumModLevel: { ...current.minimumModLevel, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.minimumModLevel.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, minimumModLevel: { ...current.minimumModLevel, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {MOD_LEVEL_OPTIONS.map((option) => (
                    <option key={`bulk-min-level-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Primary Mod Slot"
                description="Set the primary slot tag for every selected ability."
                enabled={bulkEdit.primaryModSlot.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, primaryModSlot: { ...current.primaryModSlot, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.primaryModSlot.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, primaryModSlot: { ...current.primaryModSlot, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {MOD_SLOT_OPTIONS.map((option) => (
                    <option key={`bulk-primary-slot-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Secondary Mod Slot"
                description="Set the secondary slot tag for every selected ability."
                enabled={bulkEdit.secondaryModSlot.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, secondaryModSlot: { ...current.secondaryModSlot, enabled: checked } }))}
              >
                <select
                  className="select w-full"
                  value={bulkEdit.secondaryModSlot.value}
                  onChange={(event) => setBulkEdit((current) => ({ ...current, secondaryModSlot: { ...current.secondaryModSlot, value: event.target.value } }))}
                >
                  <option value="">Not set</option>
                  {MOD_SLOT_OPTIONS.map((option) => (
                    <option key={`bulk-secondary-slot-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </BulkFieldRow>

              <BulkFieldRow
                title="Apply Effects To Caster"
                description="Set whether the selected abilities apply their effects to the caster."
                enabled={bulkEdit.applyEffectsToCaster.enabled}
                onToggle={(checked) => setBulkEdit((current) => ({ ...current, applyEffectsToCaster: { ...current.applyEffectsToCaster, enabled: checked } }))}
              >
                <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-3 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={bulkEdit.applyEffectsToCaster.value}
                    onChange={(event) =>
                      setBulkEdit((current) => ({ ...current, applyEffectsToCaster: { ...current.applyEffectsToCaster, value: event.target.checked } }))
                    }
                  />
                  Apply effects to caster
                </label>
              </BulkFieldRow>
            </div>
          </Section>

          <Section title="Selected Abilities" description="Quick review of the current bulk-edit selection.">
            {selectedAbilities.length ? (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {selectedAbilities
                  .slice()
                  .sort((left, right) => {
                    const leftLabel = (left.name || left.id || "").trim().toLowerCase();
                    const rightLabel = (right.name || right.id || "").trim().toLowerCase();
                    return leftLabel.localeCompare(rightLabel);
                  })
                  .map((draft) => {
                    const flags = abilityIssueFlagsByKey.get(draft.key);
                    return (
                      <div key={`selected-${draft.key}`} className="rounded-lg border border-white/10 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">{draft.name || "Unnamed Ability"}</div>
                            <div className="mt-1 truncate text-xs text-white/45">
                              {draft.id} · {draft.deliveryType} · {draft.fileName}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {flags?.error ? <span className="rounded bg-red-500/15 px-2 py-1 font-medium text-red-100">Error</span> : null}
                            {!flags?.error && flags?.warning ? <span className="rounded bg-yellow-500/15 px-2 py-1 font-medium text-yellow-100">Warning</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-sm text-white/45">Select one or more abilities from the left to start a bulk edit.</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
