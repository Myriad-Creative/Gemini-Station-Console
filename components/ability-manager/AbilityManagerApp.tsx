"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { AbilityDraft, AbilityManagerDatabase, AbilityManagerModOption, AbilityManagerValidationIssue } from "@lib/ability-manager/types";
import { MOD_SLOT_OPTIONS, RARITY_LABEL } from "@lib/constants";
import {
  buildAbilityBundleFiles,
  computeAbilityLinkedEffects,
  computeAbilityLinkedMods,
  cloneAbilityDraft,
  createBlankAbility,
  deleteAbilityAt,
  inferAbilityDeliveryType,
  insertAbilityAfter,
  isAbilityExcludedFromModLinkChecks,
  isStatusEffectExcludedFromAbilityLinkChecks,
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

function selectInputContentsOnFocus(event: FocusEvent<HTMLInputElement>) {
  const target = event.currentTarget;
  window.requestAnimationFrame(() => target.select());
}

function normalizeModSlotLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function abilityMatchesModSlot(primaryModSlot: string, secondaryModSlot: string, modSlot: string) {
  const normalizedModSlot = normalizeModSlotLabel(modSlot);
  if (!normalizedModSlot) return false;
  return normalizeModSlotLabel(primaryModSlot) === normalizedModSlot || normalizeModSlotLabel(secondaryModSlot) === normalizedModSlot;
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

function formatDurationSummary(value: string) {
  const { minutes, seconds } = splitDurationFields(value);
  const numericMinutes = minutes ? Number(minutes) : 0;
  const numericSeconds = seconds ? Number(seconds) : 0;
  if (!numericMinutes && !numericSeconds) return "";
  if (numericMinutes && numericSeconds) return `${numericMinutes}m ${numericSeconds}s`;
  if (numericMinutes) return `${numericMinutes}m`;
  return `${numericSeconds}s`;
}

type StatusState = {
  tone: StatusTone;
  message: string;
  dismissAfterMs?: number | null;
};

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

type AbilitySummaryFilter = "all" | "projectile" | "beam" | "linked" | "orphans";
type AbilityDashboardFilter = "" | "slotTagged" | "missingSlotTags" | "minimumModLevel" | "missingMinimumModLevel";

type OrphanStatusEffectOption = {
  numericId: number;
  effectId: string;
  name: string;
  description: string;
  icon: string;
  isBuff: boolean;
};

type AbilityIconOption = {
  fileName: string;
  relativePath: string;
  resPath: string;
  folder: string;
  folderLabel: string;
};

type AbilityIconResponse = {
  ok?: boolean;
  data?: AbilityIconOption[];
  message?: string;
  error?: string;
};

const DEFAULT_ABILITY_ICON = "icon_lootbox.png";

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

const VALID_TARGET_KNOWN_MASK = VALID_TARGET_FLAGS.reduce((mask, option) => mask | option.value, 0);

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

const ABILITY_RARITY_OPTIONS: AbilityValueOption[] = Object.entries(RARITY_LABEL).map(([value, label]) => ({
  value,
  label,
  description: `${label} or higher mods can use this ability.`,
}));

const MINIMUM_MOD_LEVEL_OPTIONS = Array.from({ length: 100 }, (_, index) => String(index + 1));

function resolveAbilityValueOption(value: string, options: AbilityValueOption[]) {
  const normalizedValue = value.trim();
  return options.find((option) => option.value === normalizedValue) ?? null;
}

function withCurrentAbilityValueOption(value: string, options: AbilityValueOption[], fieldLabel: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue || options.some((option) => option.value === normalizedValue)) return options;
  return [
    ...options,
    {
      value: normalizedValue,
      label: "Unrecognized value",
      description: `${fieldLabel} is currently set to ${normalizedValue}, which is not one of the known definitions.`,
    },
  ];
}

function matchesAbilityIconValue(option: AbilityIconOption, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === option.resPath || trimmed === option.fileName || trimmed === option.relativePath) return true;

  const cleaned = trimmed.replace(/^res:\/\//i, "").replace(/^\/+/, "");
  return cleaned === `assets/${option.relativePath}` || cleaned === option.relativePath || cleaned.endsWith(`/${option.fileName}`);
}

export default function AbilityManagerApp() {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const { database: loadedDatabase, loading } = useAbilityDatabase();
  const [database, setDatabase] = useState<AbilityManagerDatabase | null>(null);
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [linkedFilter, setLinkedFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [modFilter, setModFilter] = useState("");
  const [dashboardFilter, setDashboardFilter] = useState<AbilityDashboardFilter>("");
  const [statusEffectSearch, setStatusEffectSearch] = useState("");
  const [linkedModSearch, setLinkedModSearch] = useState("");
  const [availableAbilityIcons, setAvailableAbilityIcons] = useState<AbilityIconOption[]>([]);
  const [abilityIconsLoading, setAbilityIconsLoading] = useState(false);
  const [abilityIconStatus, setAbilityIconStatus] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    async function loadAbilityIcons() {
      setAbilityIconsLoading(true);
      try {
        const response = await fetch(`/api/ability-icons?_v=${sharedDataVersion}`, { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as AbilityIconResponse;
        if (cancelled) return;
        setAvailableAbilityIcons(Array.isArray(json.data) ? json.data : []);
        setAbilityIconStatus(typeof json.message === "string" ? json.message : typeof json.error === "string" ? json.error : "");
      } catch {
        if (cancelled) return;
        setAvailableAbilityIcons([]);
        setAbilityIconStatus("Ability icon catalog could not be loaded from the active local game root.");
      } finally {
        if (!cancelled) setAbilityIconsLoading(false);
      }
    }

    void loadAbilityIcons();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

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
  const summary = useMemo(() => summarizeAbilityManager(database, abilityIssues, []), [database, abilityIssues]);
  const errorDraftCount = useMemo(() => Array.from(abilityIssueFlagsByKey.values()).filter((entry) => entry.error).length, [abilityIssueFlagsByKey]);
  const warningDraftCount = useMemo(() => Array.from(abilityIssueFlagsByKey.values()).filter((entry) => entry.warning).length, [abilityIssueFlagsByKey]);
  const hasActiveFilters = Boolean(search.trim() || deliveryFilter || linkedFilter || validationFilter || modFilter || dashboardFilter);
  const activeSummaryFilter = useMemo<AbilitySummaryFilter | null>(() => {
    if (!deliveryFilter && !linkedFilter && !modFilter) return "all";
    if (deliveryFilter === "projectile" && !linkedFilter && !modFilter) return "projectile";
    if (deliveryFilter === "beam" && !linkedFilter && !modFilter) return "beam";
    if (!deliveryFilter && linkedFilter === "linked" && !modFilter) return "linked";
    if (!deliveryFilter && !linkedFilter && modFilter === "unlinked") return "orphans";
    return null;
  }, [deliveryFilter, linkedFilter, modFilter]);

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
        if (isAbilityExcludedFromModLinkChecks(draft)) return false;
        const linkedModCount = (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length;
        return modFilter === "linked" ? linkedModCount > 0 : linkedModCount === 0;
      })
      .filter((draft) => {
        if (!dashboardFilter) return true;
        if (isAbilityExcludedFromModLinkChecks(draft)) return false;

        const hasSlotTags = Boolean(draft.primaryModSlot.trim() || draft.secondaryModSlot.trim());
        const hasMinimumModLevel = Boolean(draft.minimumModLevel.trim());

        if (dashboardFilter === "slotTagged") return hasSlotTags;
        if (dashboardFilter === "missingSlotTags") return !hasSlotTags;
        if (dashboardFilter === "minimumModLevel") return hasMinimumModLevel;
        if (dashboardFilter === "missingMinimumModLevel") return !hasMinimumModLevel;
        return true;
      })
      .sort((left, right) => {
        const leftLabel = (left.name || left.id || "").trim().toLowerCase();
        const rightLabel = (right.name || right.id || "").trim().toLowerCase();
        const byLabel = leftLabel.localeCompare(rightLabel);
        if (byLabel !== 0) return byLabel;
        return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
      });
  }, [abilityIssuesByKey, dashboardFilter, database, deliveryFilter, linkedFilter, modFilter, modLinksByAbilityId, search, statusEffectOptions, validationFilter]);

  const selectedAbility = useMemo(() => {
    const abilities = database?.abilities ?? [];
    return abilities.find((draft) => draft.key === selectedAbilityKey) ?? filteredAbilities[0] ?? abilities[0] ?? null;
  }, [database, filteredAbilities, selectedAbilityKey]);

  const selectedIssues = selectedAbility ? abilityIssuesByKey.get(selectedAbility.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const workspaceHasErrors = abilityIssues.some((issue) => issue.level === "error");
  const selectedCooldownFields = useMemo(() => splitDurationFields(selectedAbility?.cooldown ?? ""), [selectedAbility?.cooldown]);
  const selectedLinkedEffects = useMemo(
    () => (selectedAbility ? computeAbilityLinkedEffects(selectedAbility, statusEffectOptions) : []),
    [selectedAbility, statusEffectOptions],
  );
  const filteredStatusEffectOptions = useMemo(() => {
    const query = statusEffectSearch.trim().toLowerCase();
    if (!query) return statusEffectOptions;
    return statusEffectOptions.filter((effect) => effect.name.toLowerCase().includes(query));
  }, [statusEffectOptions, statusEffectSearch]);
  const orphanStatusEffects = useMemo<OrphanStatusEffectOption[]>(() => {
    if (!database) return [];
    const detailsByNumericId = new Map(
      database.statusEffects
        .map((effect) => {
          const numericId = Number(effect.numericId);
          return Number.isFinite(numericId) ? [numericId, effect] as const : null;
        })
        .filter((entry): entry is readonly [number, (typeof database.statusEffects)[number]] => entry !== null),
    );

    return statusEffectOptions
      .filter((effect) => effect.linkedAbilityCount === 0 && !isStatusEffectExcludedFromAbilityLinkChecks(effect))
      .map((effect) => {
        const details = detailsByNumericId.get(effect.numericId);
        return {
          numericId: effect.numericId,
          effectId: effect.effectId,
          name: effect.name,
          description: effect.description,
          icon: details?.icon ?? "",
          isBuff: details?.isBuff ?? true,
        };
      })
      .sort((left, right) => {
        const byName = left.name.trim().toLowerCase().localeCompare(right.name.trim().toLowerCase());
        if (byName !== 0) return byName;
        return left.numericId - right.numericId;
      });
  }, [database, statusEffectOptions]);
  const selectedLinkedMods = useMemo(() => {
    if (!selectedAbility || !database?.modCatalogAvailable) return [];
    if (isAbilityExcludedFromModLinkChecks(selectedAbility)) return [];
    return [...(modLinksByAbilityId.get(normalizeAbilityReference(selectedAbility.id)) ?? computeAbilityLinkedMods(selectedAbility, database.mods))].sort((left, right) => {
      const byName = left.name.trim().toLowerCase().localeCompare(right.name.trim().toLowerCase());
      if (byName !== 0) return byName;
      return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [database?.modCatalogAvailable, database?.mods, modLinksByAbilityId, selectedAbility]);
  const filteredLinkedMods = useMemo(() => {
    const query = linkedModSearch.trim().toLowerCase();
    if (!query) return selectedLinkedMods;
    return selectedLinkedMods.filter((mod) => [mod.name, mod.id, mod.slot, mod.description].join(" ").toLowerCase().includes(query));
  }, [linkedModSearch, selectedLinkedMods]);
  const selectedAbilityExcludedFromModChecks = selectedAbility ? isAbilityExcludedFromModLinkChecks(selectedAbility) : false;
  const selectedThreatTypeValue = selectedAbility?.threatType.trim() ?? "";
  const selectedValidTargetsValue = selectedAbility?.validTargets.trim() ?? "";
  const selectedFacingRequirementValue = selectedAbility?.facingRequirement.trim() ?? "";
  const selectedMinRangeTypeValue = selectedAbility?.minRangeType.trim() ?? "";
  const selectedMaxRangeTypeValue = selectedAbility?.maxRangeType.trim() ?? "";
  const selectedRarityValue = selectedAbility?.rarity.trim() ?? "";
  const selectedMinimumModLevelValue = selectedAbility?.minimumModLevel.trim() ?? "";
  const selectedPrimaryModSlotValue = selectedAbility?.primaryModSlot.trim() ?? "";
  const selectedSecondaryModSlotValue = selectedAbility?.secondaryModSlot.trim() ?? "";
  const selectedRarityNumber = selectedRarityValue ? Number(selectedRarityValue) : null;
  const selectedAbilityRarity =
    selectedRarityNumber !== null && Number.isInteger(selectedRarityNumber) && selectedRarityNumber in RARITY_LABEL ? selectedRarityNumber : null;
  const selectedMinimumModLevelNumber = selectedMinimumModLevelValue ? Number(selectedMinimumModLevelValue) : null;
  const selectedMinimumModLevel =
    selectedMinimumModLevelNumber !== null &&
    Number.isInteger(selectedMinimumModLevelNumber) &&
    selectedMinimumModLevelNumber >= 1 &&
    selectedMinimumModLevelNumber <= 100
      ? selectedMinimumModLevelNumber
      : null;
  const selectedBelowRarityModCount = selectedAbilityRarity === null ? 0 : selectedLinkedMods.filter((mod) => mod.rarity < selectedAbilityRarity).length;
  const selectedUnderleveledModCount = selectedMinimumModLevel === null ? 0 : selectedLinkedMods.filter((mod) => mod.levelRequirement < selectedMinimumModLevel).length;
  const selectedSlotMismatchModCount =
    !selectedPrimaryModSlotValue && !selectedSecondaryModSlotValue
      ? 0
      : selectedLinkedMods.filter((mod) => !abilityMatchesModSlot(selectedPrimaryModSlotValue, selectedSecondaryModSlotValue, mod.slot)).length;
  const selectedValidTargetsMask = selectedValidTargetsValue ? Number(selectedValidTargetsValue) : 0;
  const validTargetUnknownBits = Number.isInteger(selectedValidTargetsMask) ? selectedValidTargetsMask & ~VALID_TARGET_KNOWN_MASK : null;
  const selectedValidTargetFlags = Number.isInteger(selectedValidTargetsMask)
    ? VALID_TARGET_FLAGS.filter((option) => (selectedValidTargetsMask & option.value) !== 0)
    : [];
  const threatTypeOptions = withCurrentAbilityValueOption(selectedThreatTypeValue, THREAT_TYPE_OPTIONS, "Threat Type");
  const facingRequirementOptions = withCurrentAbilityValueOption(selectedFacingRequirementValue, FACING_REQUIREMENT_OPTIONS, "Facing Requirement");
  const minRangeTypeOptions = withCurrentAbilityValueOption(selectedMinRangeTypeValue, RANGE_TYPE_OPTIONS, "Min Range Type");
  const maxRangeTypeOptions = withCurrentAbilityValueOption(selectedMaxRangeTypeValue, RANGE_TYPE_OPTIONS, "Max Range Type");
  const selectedThreatTypeOption = resolveAbilityValueOption(selectedThreatTypeValue, threatTypeOptions);
  const selectedFacingRequirementOption = resolveAbilityValueOption(selectedFacingRequirementValue, facingRequirementOptions);
  const selectedMinRangeTypeOption = resolveAbilityValueOption(selectedMinRangeTypeValue, minRangeTypeOptions);
  const selectedMaxRangeTypeOption = resolveAbilityValueOption(selectedMaxRangeTypeValue, maxRangeTypeOptions);
  const selectedRarityOptions = withCurrentAbilityValueOption(selectedRarityValue, ABILITY_RARITY_OPTIONS, "Rarity");
  const selectedRarityOption = resolveAbilityValueOption(selectedRarityValue, selectedRarityOptions);

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

  useEffect(() => {
    setLinkedModSearch("");
  }, [selectedAbility?.key]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    const summary = params.get("summary");
    const validation = params.get("validation");
    const mod = params.get("mod");
    const meta = params.get("meta");

    setSearch("");
    setDeliveryFilter(summary === "projectile" || summary === "beam" ? summary : "");
    setLinkedFilter(summary === "linked" ? "linked" : "");
    setValidationFilter(validation === "errors" || validation === "warnings" ? validation : "");
    setModFilter(summary === "orphans" ? "unlinked" : mod === "linked" || mod === "unlinked" ? mod : "");
    setDashboardFilter(
      meta === "slotTagged" ||
        meta === "missingSlotTags" ||
        meta === "minimumModLevel" ||
        meta === "missingMinimumModLevel"
        ? meta
        : "",
    );
  }, [searchParamsKey]);

  const abilityIndexJson = useMemo(() => (database ? stringifyAbilityIndexJson(database.abilities) : "{}"), [database]);
  const dashboardFilterLabel = useMemo(() => {
    if (dashboardFilter === "slotTagged") return "Dashboard filter: Slot-tagged abilities";
    if (dashboardFilter === "missingSlotTags") return "Dashboard filter: Abilities missing slot tags";
    if (dashboardFilter === "minimumModLevel") return "Dashboard filter: Abilities with minimum mod level";
    if (dashboardFilter === "missingMinimumModLevel") return "Dashboard filter: Abilities missing minimum mod level";
    return "";
  }, [dashboardFilter]);
  const previewIcon = buildIconSrc(
    selectedAbility?.icon || DEFAULT_ABILITY_ICON,
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

  function setSelectedValidTargetFlag(flagValue: number, checked: boolean) {
    updateSelectedAbility((current) => {
      const currentValue = current.validTargets.trim();
      const currentMask = currentValue ? Number(currentValue) : 0;
      const knownMask = Number.isInteger(currentMask) ? currentMask & VALID_TARGET_KNOWN_MASK : 0;
      const unknownMask = Number.isInteger(currentMask) ? currentMask & ~VALID_TARGET_KNOWN_MASK : 0;
      const nextKnownMask = checked ? knownMask | flagValue : knownMask & ~flagValue;
      const nextMask = unknownMask | nextKnownMask;
      return {
        ...current,
        validTargets: nextMask ? String(nextMask) : "",
      };
    });
  }

  function setSelectedStatusEffect(numericId: number, checked: boolean) {
    updateSelectedAbility((current) => {
      const effectId = String(numericId);
      return {
        ...current,
        appliesEffectIds: checked
          ? (current.appliesEffectIds.includes(effectId) ? current.appliesEffectIds : [...current.appliesEffectIds, effectId]).sort(
              (left, right) => Number(left) - Number(right),
            )
          : current.appliesEffectIds.filter((entry) => entry !== effectId),
      };
    });
  }

  function updateCooldownField(part: "minutes" | "seconds", value: string) {
    const current = splitDurationFields(selectedAbility?.cooldown ?? "");
    const nextMinutes = part === "minutes" ? value : current.minutes;
    const nextSeconds = part === "seconds" ? value : current.seconds;
    updateSelectedAbility((draft) => ({
      ...draft,
      cooldown: buildDurationValue(nextMinutes, nextSeconds),
    }));
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

  function createAbilityFromStatusEffect(effect: OrphanStatusEffectOption) {
    if (!database) return;

    const nextDraft = syncDerivedAbilityFields({
      ...createBlankAbility(
        database.abilities.map((draft) => draft.id),
        database.abilities.map((draft) => draft.fileName),
      ),
      name: effect.name,
      description: effect.description,
      icon: effect.icon,
      appliesEffectIds: [String(effect.numericId)],
      threatType: effect.isBuff ? "3" : "",
    });

    const nextDatabase = insertAbilityAfter(database, selectedAbility?.key ?? null, nextDraft);
    setDatabase(nextDatabase);
    setSelectedAbilityKey(nextDraft.key);
    setStatus({ tone: "success", message: `Created a new ability draft for "${effect.name}".`, dismissAfterMs: 4000 });
    statusTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetFilters() {
    setSearch("");
    setDeliveryFilter("");
    setLinkedFilter("");
    setValidationFilter("");
    setModFilter("");
    setDashboardFilter("");
  }

  function applySummaryFilter(filter: AbilitySummaryFilter) {
    setSearch("");
    setValidationFilter("");
    setDashboardFilter("");

    if (filter === "all") {
      setDeliveryFilter("");
      setLinkedFilter("");
      setModFilter("");
      return;
    }

    setDeliveryFilter(filter === "projectile" ? "projectile" : filter === "beam" ? "beam" : "");
    setLinkedFilter(filter === "linked" ? "linked" : "");
    setModFilter(filter === "orphans" ? "unlinked" : "");
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-4xl">
          <h1 className="page-title mb-1">Abilities Manager</h1>
          <p className="text-sm text-white/70">
            Browse all ability JSON files, inspect delivery behavior, and manage JSON-linked status effects while still surfacing script-linked effect
            relationships.
          </p>
        </div>
        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!database || workspaceHasErrors} onClick={() => void handleSaveAllAbilitiesToBuild()}>
          Save All Abilities To Build
        </button>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Abilities" value={summary.totalAbilities} active={activeSummaryFilter === "all"} onClick={() => applySummaryFilter("all")} />
        <SummaryCard label="Projectile" value={summary.projectileCount} active={activeSummaryFilter === "projectile"} onClick={() => applySummaryFilter("projectile")} />
        <SummaryCard label="Beam" value={summary.beamCount} active={activeSummaryFilter === "beam"} onClick={() => applySummaryFilter("beam")} />
        <SummaryCard label="Linked Effects" value={summary.linkedAbilityCount} active={activeSummaryFilter === "linked"} onClick={() => applySummaryFilter("linked")} />
        <SummaryCard
          label="Orphan Abilities"
          value={database.modCatalogAvailable ? summary.orphanAbilityCount : "N/A"}
          accent={database.modCatalogAvailable ? (summary.orphanAbilityCount ? "text-amber-200" : undefined) : "text-white/55"}
          active={database.modCatalogAvailable && activeSummaryFilter === "orphans"}
          disabled={!database.modCatalogAvailable}
          onClick={database.modCatalogAvailable ? () => applySummaryFilter("orphans") : undefined}
        />
        <SummaryCard label="Warnings / Errors" value={`${summary.warningCount} / ${summary.errorCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="space-y-6 xl:min-w-0">
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
              {dashboardFilterLabel ? (
                <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
                  {dashboardFilterLabel}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  className={`rounded border px-3 py-2 text-left transition ${
                    validationFilter === "errors"
                      ? "border-red-300/80 bg-red-500/20 text-red-50"
                      : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  }`}
                  onClick={() => setValidationFilter("errors")}
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
                  onClick={() => setValidationFilter("warnings")}
                >
                  <div className="label text-yellow-100/80">Warnings</div>
                  <div className="mt-1 text-lg font-semibold">{warningDraftCount}</div>
                </button>
                <button
                  className="col-span-2 rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                  disabled={!hasActiveFilters}
                  onClick={resetFilters}
                >
                  Reset Filter
                </button>
              </div>

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
                  const linkedModCount =
                    database?.modCatalogAvailable && !isAbilityExcludedFromModLinkChecks(draft)
                      ? (modLinksByAbilityId.get(normalizeAbilityReference(draft.id)) ?? []).length
                      : null;
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

        </aside>

        <div className={`space-y-6 xl:min-w-0 ${selectedAbility ? "" : "xl:col-span-2"}`}>
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

                <div className="space-y-4">
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
                  <div>
                    <div className="label">Script</div>
                    <div className="relative mt-1">
                      <input
                        className="input pr-12"
                        value={selectedAbility.script}
                        onFocus={selectInputContentsOnFocus}
                        onChange={(event) => updateSelectedAbility((current) => ({ ...current, script: event.target.value }))}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={() => updateSelectedAbility((current) => ({ ...current, script: "" }))}
                        aria-label="Clear script"
                      >
                        X
                      </button>
                    </div>
                    {selectedAbility.scriptPathResolved ? <div className="mt-2 text-xs text-white/45 break-all">{selectedAbility.scriptPathResolved}</div> : null}
                  </div>
                  <div>
                    <div className="label">Threat Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedThreatTypeValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, threatType: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {threatTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedThreatTypeOption?.description ?? "Choose how this ability should generate threat."}
                    </div>
                  </div>
                  <div>
                    <div className="label">Threat Multiplier</div>
                    <input className="input mt-1" value={selectedAbility.threatMultiplier} onChange={(event) => updateSelectedAbility((current) => ({ ...current, threatMultiplier: event.target.value }))} />
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-white/75">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedAbility.requiresTarget}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, requiresTarget: event.target.checked }))}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-white">Requires Target</div>
                      <div className="mt-1 text-xs leading-5 text-white/45">
                        Check if a specific target is required to use this ability. Uncheck if the ability is targetless or self-casting.
                      </div>
                    </div>
                  </label>
                  <div>
                    <div className="label">Valid Targets</div>
                    <div className="mt-1 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                      {VALID_TARGET_FLAGS.map((option) => {
                        const checked = Number.isInteger(selectedValidTargetsMask) && (selectedValidTargetsMask & option.value) !== 0;
                        return (
                          <label key={option.value} className="flex items-start gap-3 rounded-lg border border-white/5 px-3 py-2 text-sm text-white/80">
                            <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => setSelectedValidTargetFlag(option.value, event.target.checked)} />
                            <div className="min-w-0">
                              <div className="font-medium text-white">{option.label}</div>
                              <div className="mt-1 text-xs text-white/45">{option.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedValidTargetFlags.length ? `Selected: ${selectedValidTargetFlags.map((option) => option.label).join(", ")}` : "No valid target flags selected."}
                    </div>
                    {validTargetUnknownBits ? <div className="mt-1 text-xs text-amber-200/80">This ability has additional unknown target flags that will be preserved unless you replace them.</div> : null}
                  </div>
                  <div>
                    <div className="label">Min Range Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedMinRangeTypeValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, minRangeType: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {minRangeTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedMinRangeTypeOption?.description ?? "Choose the starting range band for this ability."}
                    </div>
                  </div>
                  <div>
                    <div className="label">Max Range Type</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedMaxRangeTypeValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, maxRangeType: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {maxRangeTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedMaxRangeTypeOption?.description ?? "Choose the furthest range band for this ability."}
                    </div>
                  </div>
                  <div>
                    <div className="label">Facing Requirement</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedFacingRequirementValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, facingRequirement: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {facingRequirementOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedFacingRequirementOption?.description ?? "Choose whether the target has to be in front, rear, or side arc."}
                    </div>
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={selectedAbility.isGcdLocked}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, isGcdLocked: event.target.checked }))}
                    />
                    GCD Locked
                  </label>
                  <div>
                    <div className="label">Cooldown</div>
                    <div className="mt-1 grid grid-cols-2 gap-3">
                      <div>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={selectedCooldownFields.minutes}
                          onFocus={selectInputContentsOnFocus}
                          onChange={(event) => updateCooldownField("minutes", event.target.value)}
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
                          value={selectedCooldownFields.seconds}
                          onFocus={selectInputContentsOnFocus}
                          onChange={(event) => updateCooldownField("seconds", event.target.value)}
                        />
                        <div className="mt-2 text-xs text-white/45">Seconds</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="label">Charge Time</div>
                    <input className="input mt-1" value={selectedAbility.chargeTime} onChange={(event) => updateSelectedAbility((current) => ({ ...current, chargeTime: event.target.value }))} />
                  </div>
                  <div>
                    <div className="label">Energy Cost</div>
                    <input
                      className="input mt-1"
                      type="number"
                      min="0"
                      step="1"
                      value={selectedAbility.energyCost}
                      onFocus={selectInputContentsOnFocus}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, energyCost: event.target.value }))}
                    />
                  </div>
                  <div>
                    <div className="label">Rarity</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedRarityValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, rarity: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {selectedRarityOptions.map((option) => (
                        <option key={`ability-rarity-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">
                      {selectedRarityOption?.description ?? "Minimum mod rarity required to use this ability."}
                    </div>
                  </div>
                  <div>
                    <div className="label">Minimum Mod Level</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedMinimumModLevelValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, minimumModLevel: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {MINIMUM_MOD_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">Warn if any linked mod requires a lower level than this ability allows.</div>
                  </div>
                  <div>
                    <div className="label">Primary Mod Slot</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedPrimaryModSlotValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, primaryModSlot: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {MOD_SLOT_OPTIONS.map((option) => (
                        <option key={`primary-slot-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">Primary slot match for mod pairing and auto-assignment.</div>
                  </div>
                  <div>
                    <div className="label">Secondary Mod Slot</div>
                    <select
                      className="select mt-1 w-full"
                      value={selectedSecondaryModSlotValue}
                      onChange={(event) => updateSelectedAbility((current) => ({ ...current, secondaryModSlot: event.target.value }))}
                    >
                      <option value="">Not set</option>
                      {MOD_SLOT_OPTIONS.map((option) => (
                        <option key={`secondary-slot-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-white/45">Optional fallback slot if the ability also fits a second mod family.</div>
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
                  <div>
                    <div className="label">Description</div>
                    <textarea className="input mt-1 min-h-24" value={selectedAbility.description} onChange={(event) => updateSelectedAbility((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="label">Orphan Status Effects</div>
                    <div className="text-xs text-white/45">{orphanStatusEffects.length} ready to convert</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    {orphanStatusEffects.length ? (
                      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                        {orphanStatusEffects.map((effect) => (
                          <div key={effect.numericId} className="rounded-lg border border-white/5 px-3 py-3">
                            <div className="flex items-start gap-3">
                              <img
                                src={buildIconSrc(effect.icon, String(effect.numericId), effect.name || "Status Effect", sharedDataVersion)}
                                alt=""
                                className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-[#07111d] object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-white">{effect.name}</div>
                                    <div className="mt-1 text-xs text-white/45">
                                      {effect.numericId} · {effect.effectId || "no properties.id"}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10"
                                    onClick={() => createAbilityFromStatusEffect(effect)}
                                  >
                                    Create Ability
                                  </button>
                                </div>
                                {effect.description.trim() ? <div className="mt-2 text-sm leading-5 text-white/60">{effect.description}</div> : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-white/45">No orphan status effects currently need new abilities.</div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
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

            </>
          ) : (
            <Section title="No Ability Selected" description="Create a new ability or pick one from the left sidebar to start editing.">
              <button className="btn" onClick={addBlankAbility}>
                New Ability
              </button>
            </Section>
          )}
        </div>

        {selectedAbility ? (
          <aside className="space-y-6 xl:min-w-0">
            <Section title="Preview" description="Quick view of the current ability icon, description, and key runtime tags.">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="flex items-start gap-4">
                  <img src={previewIcon} alt="" className="h-20 w-20 shrink-0 rounded-2xl border border-white/10 bg-[#07111d] object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-semibold text-white">{selectedAbility.name || "Unnamed Ability"}</div>
                    <div className="mt-2 font-mono text-xs text-white/55">{selectedAbility.id || "missing-id"}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/65">
                      <span className="rounded bg-white/5 px-2 py-1 capitalize">{inferAbilityDeliveryType(selectedAbility)}</span>
                      {selectedThreatTypeOption ? <span className="rounded bg-white/5 px-2 py-1">Threat {selectedThreatTypeOption.label}</span> : null}
                      {selectedAbility.cooldown.trim() ? <span className="rounded bg-white/5 px-2 py-1">Cooldown {formatDurationSummary(selectedAbility.cooldown) || selectedAbility.cooldown}</span> : null}
                      {selectedAbility.energyCost.trim() ? <span className="rounded bg-white/5 px-2 py-1">Energy {selectedAbility.energyCost}</span> : null}
                      {selectedMinimumModLevel !== null ? <span className="rounded bg-white/5 px-2 py-1">Min Mod Lvl {selectedMinimumModLevel}</span> : null}
                      {selectedPrimaryModSlotValue ? <span className="rounded bg-white/5 px-2 py-1">Primary {selectedPrimaryModSlotValue}</span> : null}
                      {selectedSecondaryModSlotValue ? <span className="rounded bg-white/5 px-2 py-1">Secondary {selectedSecondaryModSlotValue}</span> : null}
                    </div>
                    {selectedAbility.description.trim() ? <div className="mt-4 text-sm leading-6 text-white/70">{selectedAbility.description}</div> : null}
                  </div>
                </div>
              </div>
            </Section>
          </aside>
        ) : null}

        {selectedAbility ? (
          <>
            <aside className="space-y-6 xl:min-w-0">
              <Section title="Validation" description="Review the current draft warnings and errors before exporting or saving it.">
              {selectedIssues.length ? (
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
              )}
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
                <pre className="max-h-[28rem] overflow-auto rounded-xl border border-white/10 bg-[#08101c] p-4 text-xs text-white/80">{abilityIndexJson}</pre>
              </Section>
            </aside>

            <div className="space-y-6 xl:col-span-2 xl:min-w-0">
              <Section title="Icon" description="Choose from the local assets/abilities and assets/status_effects catalogs.">
                <AbilityIconField
                  label="Icon"
                  value={selectedAbility.icon}
                  onChange={(value) => updateSelectedAbility((current) => ({ ...current, icon: value }))}
                  iconOptions={availableAbilityIcons}
                  loading={abilityIconsLoading}
                  status={abilityIconStatus}
                  version={sharedDataVersion}
                />
              </Section>
            </div>

            <div className="grid gap-6 xl:col-span-3 xl:grid-cols-2">
              <Section title="Mods Using This Ability" description="Review every mod that currently points at this ability from the live mod workspace.">
              {!database?.modCatalogAvailable ? (
                <div className="text-sm text-white/45">No mod data is currently available from the local game root.</div>
              ) : selectedAbilityExcludedFromModChecks ? (
                <div className="text-sm text-white/45">Auto Cannon is excluded from orphan mod checks because it is the default ship ability.</div>
              ) : selectedLinkedMods.length ? (
                <div className="space-y-3">
                  <div className="text-xs text-white/45">
                    {filteredLinkedMods.length} of {selectedLinkedMods.length} linked mod{selectedLinkedMods.length === 1 ? "" : "s"}
                  </div>
                  <input
                    className="input"
                    value={linkedModSearch}
                    onChange={(event) => setLinkedModSearch(event.target.value)}
                    placeholder="Search linked mods by name, ID, description, or slot..."
                  />
                  {selectedUnderleveledModCount > 0 ? (
                    <div className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                      {selectedUnderleveledModCount} linked mod{selectedUnderleveledModCount === 1 ? "" : "s"} fall below the current Minimum Mod Level of{" "}
                      {selectedMinimumModLevel}.
                    </div>
                  ) : null}
                  {selectedBelowRarityModCount > 0 && selectedAbilityRarity !== null ? (
                    <div className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-2 text-sm text-fuchsia-100">
                      {selectedBelowRarityModCount} linked mod{selectedBelowRarityModCount === 1 ? "" : "s"} fall below this ability's rarity of{" "}
                      {RARITY_LABEL[selectedAbilityRarity] ?? `Rarity ${selectedAbilityRarity}`}.
                    </div>
                  ) : null}
                  {selectedSlotMismatchModCount > 0 ? (
                    <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                      {selectedSlotMismatchModCount} linked mod{selectedSlotMismatchModCount === 1 ? "" : "s"} do not match this ability's Primary or Secondary Mod Slot.
                    </div>
                  ) : null}
                  {filteredLinkedMods.length ? (
                    <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                      {filteredLinkedMods.map((mod) => {
                        const hasRarityMismatch = selectedAbilityRarity !== null && mod.rarity < selectedAbilityRarity;
                        const isBelowMinimum = selectedMinimumModLevel !== null && mod.levelRequirement < selectedMinimumModLevel;
                        const hasSlotMismatch =
                          (selectedPrimaryModSlotValue || selectedSecondaryModSlotValue) &&
                          !abilityMatchesModSlot(selectedPrimaryModSlotValue, selectedSecondaryModSlotValue, mod.slot);
                        const modManagerHref = `/mods/manager?mod=${encodeURIComponent(String(mod.id ?? ""))}`;

                        return (
                          <Link
                            key={mod.id}
                            href={modManagerHref}
                            title={`Open ${mod.name || "this mod"} in Mod Manager`}
                            className={`block rounded-lg border px-3 py-3 transition hover:bg-white/10 ${
                              hasRarityMismatch
                                ? "border-fuchsia-300/25 bg-fuchsia-300/10"
                                : isBelowMinimum
                                ? "border-yellow-300/25 bg-yellow-300/10"
                                : hasSlotMismatch
                                  ? "border-amber-300/25 bg-amber-300/10"
                                  : "border-white/5"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={buildIconSrc(mod.icon, mod.id, mod.name || "Mod", sharedDataVersion)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-base font-medium text-white">{mod.name}</div>
                                    <div className="mt-1 text-xs text-white/45">
                                      {mod.id} · {mod.slot || "Unknown slot"} · Lvl {mod.levelRequirement} · Rarity {mod.rarity}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                                    {hasRarityMismatch ? <div className="rounded bg-fuchsia-300/15 px-2 py-1 font-medium text-fuchsia-100">Below rarity</div> : null}
                                    {isBelowMinimum ? <div className="rounded bg-yellow-300/15 px-2 py-1 font-medium text-yellow-100">Below minimum</div> : null}
                                    {hasSlotMismatch ? <div className="rounded bg-amber-300/15 px-2 py-1 font-medium text-amber-100">Slot mismatch</div> : null}
                                  </div>
                                </div>
                                {mod.description ? <div className="mt-2 text-sm leading-6 text-white/60">{mod.description}</div> : null}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                      No linked mods matched this search.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/45">No mods currently include this ability.</div>
              )}
              </Section>

              <Section title="JSON Link Status Effects" description="Manage JSON-linked status effects and compare them against the resolved runtime links for this ability.">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="label">JSON-linked Status Effects</div>
                  <input
                    className="input"
                    value={statusEffectSearch}
                    placeholder="Search status effects by name..."
                    onChange={(event) => setStatusEffectSearch(event.target.value)}
                  />
                  <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                    {filteredStatusEffectOptions.length ? (
                      filteredStatusEffectOptions.map((effect) => {
                        const checked = selectedAbility.appliesEffectIds.includes(String(effect.numericId));
                        return (
                          <label
                            key={effect.numericId}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 px-4 py-3 hover:bg-white/[0.03]"
                          >
                            <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => setSelectedStatusEffect(effect.numericId, event.target.checked)} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex flex-wrap items-center gap-2">
                                  <div className="truncate text-sm font-medium text-white">{effect.name}</div>
                                  {effect.linkedAbilityCount === 0 && !isStatusEffectExcludedFromAbilityLinkChecks(effect) ? (
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
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                        No status effects match the current search.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="label">Resolved Effect Links</div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    {selectedLinkedEffects.length ? (
                      <div className="space-y-2">
                        {selectedLinkedEffects.map((link) => (
                          <div key={`${link.numericId}-${link.sources.join("-")}`} className="rounded-lg border border-white/5 px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-white">{link.effectName || link.effectId || `Status ${link.numericId}`}</div>
                                <div className="mt-1 text-xs text-white/45">
                                  {link.numericId} · {sourceLabel(link.sources)} {link.missing ? "· Missing from status effect files" : ""}
                                </div>
                              </div>
                              {link.sources.includes("json") ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded border border-red-400/25 px-2.5 py-1 text-xs text-red-100 hover:bg-red-400/10"
                                  onClick={() => setSelectedStatusEffect(link.numericId, false)}
                                >
                                  Remove
                                </button>
                              ) : null}
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
              </Section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AbilityIconField({
  label,
  value,
  onChange,
  iconOptions,
  loading,
  status,
  version,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  iconOptions: AbilityIconOption[];
  loading: boolean;
  status: string;
  version?: string;
}) {
  const selectedOption = iconOptions.find((option) => matchesAbilityIconValue(option, value)) ?? null;
  const previewSrc = buildIconSrc(value || DEFAULT_ABILITY_ICON, selectedOption?.fileName || "ability", selectedOption?.fileName || "Ability icon", version);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label mb-2">{label}</div>
          <div className="text-xs text-white/50">Choose from the local assets/abilities and assets/status_effects catalogs.</div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
          {loading ? "Loading icons…" : `${iconOptions.length} icon option(s)`}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[96px,minmax(0,1fr)]">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt={selectedOption?.fileName || "Ability icon preview"} className="h-full w-full object-cover" />
        </div>
        <div className="space-y-2">
          <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="res://assets/abilities/icon_AutoCannon.png" />
          <div className="text-xs text-white/50">
            {selectedOption ? `Selected file: ${selectedOption.fileName}` : "Choose an ability icon below, or edit the path directly if needed."}
          </div>
        </div>
      </div>

      {status ? <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">{status}</div> : null}

      <div className="max-h-72 overflow-auto pr-1">
        {iconOptions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {iconOptions.map((option) => {
              const selected = matchesAbilityIconValue(option, value);
              return (
                <button
                  key={option.resPath}
                  type="button"
                  className={`rounded border p-2 text-left transition ${
                    selected ? "border-accent bg-white/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                  }`}
                  onClick={() => onChange(option.resPath)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={buildIconSrc(option.resPath, option.fileName, option.fileName, version)}
                        alt={option.fileName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{option.fileName}</div>
                      <div className="truncate text-xs text-white/50">{option.folderLabel}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
            No ability icons were found in assets/abilities or assets/status_effects.
          </div>
        )}
      </div>
    </div>
  );
}
