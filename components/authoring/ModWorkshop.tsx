"use client";

import { HTMLAttributes, startTransition, useEffect, useMemo, useState } from "react";
import { SummaryCard } from "@components/ability-manager/common";
import { ALL_STATS, CLASS_RESTRICTION_OPTIONS, MOD_SLOT_OPTIONS, RARITY_COLOR, RARITY_LABEL } from "@lib/constants";
import { buildIconSrc } from "@lib/icon-src";
import {
  autoBalanceModDraft,
  BulkModTemplateDraft,
  calculateDerivedSellPrice,
  ModAbilityDraft,
  ModDraft,
  ModStatDraft,
  ValidationMessage,
  buildModBudgetSummary,
  clampLevelInput,
  createBulkModDrafts,
  createModAbilityDraft,
  createModDraft,
  duplicateModDraft,
  exportModDraft,
  exportModsJson,
  listFromLines,
  modFilename,
  parseNumber,
  syncDerivedModFields,
  validateModDrafts,
} from "@lib/authoring";
import { generateAutoMods, getAutoModGeneratorConfig } from "@lib/mod-auto-generator";
import {
  MOD_BASE_ABILITY_SLOT_COST,
  MOD_MAX_ABILITIES,
  MOD_MAX_STATS,
  calculateModBudgetSummary,
  getModStatBudgetConfig,
  getModStatMaxAtRequiredLevel,
} from "@lib/mod-budget";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type IssueFilter = "all" | "error" | "warning";
type AbilityLinkFilter = "all" | "missing";
type EditorMode = "editor" | "bulk" | "auto";
type ModSummaryFilter = "all" | (typeof MOD_SLOT_OPTIONS)[number] | "missing";
type AbilityOption = {
  id: number | string;
  name?: string;
  description?: string;
  icon?: string;
  deliveryType?: "energy" | "beam" | "projectile" | "other";
  linkedEffectCount?: number;
  linkedModCount?: number;
  minimumModLevel?: number | null;
  primaryModSlot?: string | null;
  secondaryModSlot?: string | null;
};
type ModIconOption = {
  fileName: string;
  resPath: string;
  slot: string | null;
  slotKey: string | null;
};

type BulkCreateState = {
  titles: string;
  slot: string;
  rarity: string;
  levelRequirement: string;
  durability: string;
  sellPrice: string;
  classRestriction: string;
  stats: ModStatDraft[];
  abilities: ModAbilityDraft[];
  icon: string;
  description: string;
};

type AutoGenerateState = {
  count: string;
  levelMin: string;
  levelMax: string;
  rarity: string;
  allowedSlots: string[];
  allowedRoles: string[];
  allowedStats: string[];
  abilityPool: string[];
  abilitySearch: string;
};

const AUTO_MOD_GENERATOR_CONFIG = getAutoModGeneratorConfig();
const AUTO_MOD_SLOT_OPTIONS = AUTO_MOD_GENERATOR_CONFIG.slot_order.map((slotId) => ({
  value: slotId,
  label: AUTO_MOD_GENERATOR_CONFIG.slots[slotId as keyof typeof AUTO_MOD_GENERATOR_CONFIG.slots].label,
}));
const AUTO_MOD_ROLE_OPTIONS = AUTO_MOD_GENERATOR_CONFIG.role_order.map((roleId) => ({
  value: roleId,
  label: AUTO_MOD_GENERATOR_CONFIG.roles[roleId as keyof typeof AUTO_MOD_GENERATOR_CONFIG.roles].label,
}));
const AUTO_MOD_STAT_OPTIONS = AUTO_MOD_GENERATOR_CONFIG.stat_order
  .filter((statId) => {
    const stat = AUTO_MOD_GENERATOR_CONFIG.stats[statId as keyof typeof AUTO_MOD_GENERATOR_CONFIG.stats];
    return !!stat?.rollable && !AUTO_MOD_GENERATOR_CONFIG.manual_only_stats.includes(statId);
  })
  .map((statId) => ({
    value: statId,
    label: AUTO_MOD_GENERATOR_CONFIG.stats[statId as keyof typeof AUTO_MOD_GENERATOR_CONFIG.stats].label,
  }));
const AUTO_MOD_DEFAULT_EXCLUDED_STATS = new Set(["damage_reduction", "heat_resistance", "damage_reflect"]);

const EMPTY_BULK_CREATE_STATE: BulkCreateState = {
  titles: "",
  slot: "",
  rarity: "0",
  levelRequirement: "",
  durability: "",
  sellPrice: "",
  classRestriction: "None",
  stats: [],
  abilities: [],
  icon: "",
  description: "",
};

const EMPTY_AUTO_GENERATE_STATE: AutoGenerateState = {
  count: "10",
  levelMin: "1",
  levelMax: "100",
  rarity: "0",
  allowedSlots: [...AUTO_MOD_GENERATOR_CONFIG.slot_order],
  allowedRoles: [...AUTO_MOD_GENERATOR_CONFIG.role_order],
  allowedStats: AUTO_MOD_STAT_OPTIONS.map((option) => option.value).filter((value) => !AUTO_MOD_DEFAULT_EXCLUDED_STATS.has(value)),
  abilityPool: [],
  abilitySearch: "",
};

const DEFAULT_MOD_ICON = "res://assets/mods/DEFAULT.png";
const DEFAULT_ABILITY_ICON = "icon_lootbox.png";
const ABILITY_DELIVERY_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "energy", label: "Energy" },
  { value: "beam", label: "Beam" },
  { value: "projectile", label: "Projectile" },
  { value: "other", label: "Other" },
] as const;
const ABILITY_LINK_FILTER_OPTIONS = [
  { value: "all", label: "All abilities" },
  { value: "linked", label: "Linked effects" },
  { value: "orphan", label: "No linked effects" },
] as const;

function normalizeModSlotForIconFilter(slot: string) {
  const normalized = slot.trim().toLowerCase();
  if (!normalized) return null;
  return normalized === "weapon" ? "weapon" : normalized;
}

function normalizeAbilitySlotLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getAbilitySlotMatchType(option: Pick<AbilityOption, "primaryModSlot" | "secondaryModSlot">, modSlot: string | undefined) {
  const normalizedSlot = normalizeAbilitySlotLabel(modSlot);
  if (!normalizedSlot) return null;
  if (normalizeAbilitySlotLabel(option.primaryModSlot) === normalizedSlot) return "primary";
  if (normalizeAbilitySlotLabel(option.secondaryModSlot) === normalizedSlot) return "secondary";
  return null;
}

function normalizeAbilityId(value: number | string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? String(Math.trunc(numericValue)) : trimmed;
}

function hasAttachedAbility(mod: Pick<ModDraft, "abilities">) {
  return mod.abilities.some((ability) => ability.id.trim());
}

function filterModIconOptionsBySlot(options: ModIconOption[], slot: string) {
  const slotKey = normalizeModSlotForIconFilter(slot);
  if (!slotKey) return options;
  return options.filter((option) => !option.slotKey || option.slotKey === slotKey);
}

function matchesModIconValue(option: ModIconOption, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === option.resPath || trimmed === option.fileName) return true;

  const cleaned = trimmed.replace(/^res:\/\//i, "").replace(/^\/+/, "");
  return cleaned === `assets/mods/${option.fileName}` || cleaned === `mods/${option.fileName}` || cleaned.endsWith(`/${option.fileName}`);
}

function formatDraftNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  const normalized = Object.is(value, -0) ? 0 : value;
  return Number.isInteger(normalized) ? String(normalized) : String(Number(normalized.toFixed(2)));
}

function calculateBulkCreateBudget(state: BulkCreateState) {
  return calculateModBudgetSummary({
    requiredLevel: parseNumber(clampLevelInput(state.levelRequirement)),
    rarity: parseNumber(state.rarity),
    stats: state.stats.map((entry) => ({
      key: entry.key.trim(),
      value: parseNumber(entry.value),
    })),
    abilities: state.abilities.map((entry) => ({
      id: entry.id.trim(),
      budgetCost: parseNumber(entry.budgetCost),
    })),
  });
}

function autoBalanceBulkCreateState(
  state: BulkCreateState,
  options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
) {
  const budget = calculateBulkCreateBudget(state);
  let activeStatIndex = 0;

  const nextStats = state.stats.map((stat) => {
    const key = stat.key.trim();
    if (!key) return stat;

    const statBudget = budget.stats[activeStatIndex];
    activeStatIndex += 1;
    if (!statBudget || statBudget.key !== key) return stat;

    const numericValue = parseNumber(stat.value);
    if (options.syncAllStatValuesToMax && statBudget.effectiveMaxValue !== undefined && statBudget.effectiveMaxValue > 0) {
      return {
        ...stat,
        value: formatDraftNumber(statBudget.effectiveMaxValue),
      };
    }

    if (!stat.value.trim() && options.fillBlankStatValues && statBudget.effectiveMaxValue !== undefined && statBudget.effectiveMaxValue > 0) {
      return {
        ...stat,
        value: formatDraftNumber(statBudget.effectiveMaxValue),
      };
    }

    const clampMax = statBudget.currentMaxValue ?? statBudget.effectiveMaxValue;
    if (numericValue !== undefined && clampMax !== undefined && numericValue > clampMax) {
      return {
        ...stat,
        value: formatDraftNumber(clampMax),
      };
    }

    return stat;
  });

  return {
    ...state,
    levelRequirement: state.levelRequirement.trim() ? clampLevelInput(state.levelRequirement).trim() : "",
    stats: nextStats,
  };
}

export default function ModWorkshop({
  mods,
  onChange,
}: {
  mods: ModDraft[];
  onChange: (next: ModDraft[]) => void;
}) {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [abilityLinkFilter, setAbilityLinkFilter] = useState<AbilityLinkFilter>("all");
  const [rarityFilter, setRarityFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [levelMinFilter, setLevelMinFilter] = useState("");
  const [levelMaxFilter, setLevelMaxFilter] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("editor");
  const [bulkCreate, setBulkCreate] = useState<BulkCreateState>(EMPTY_BULK_CREATE_STATE);
  const [autoGenerate, setAutoGenerate] = useState<AutoGenerateState>(EMPTY_AUTO_GENERATE_STATE);
  const [availableAbilities, setAvailableAbilities] = useState<AbilityOption[]>([]);
  const [availableModIcons, setAvailableModIcons] = useState<ModIconOption[]>([]);
  const [modIconsLoading, setModIconsLoading] = useState(false);
  const [modIconStatus, setModIconStatus] = useState("");

  useEffect(() => {
    if (selectedIndex <= mods.length - 1) return;
    setSelectedIndex(Math.max(0, mods.length - 1));
  }, [mods.length, selectedIndex]);

  useEffect(() => {
    let cancelled = false;

    async function loadAbilities() {
      try {
        const response = await fetch("/api/abilities");
        const json = await response.json().catch(() => ({ data: [] }));
        if (cancelled) return;
        setAvailableAbilities(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (cancelled) return;
        setAvailableAbilities([]);
      }
    }

    loadAbilities();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadModIcons() {
      setModIconsLoading(true);

      try {
        const response = await fetch(`/api/mod-icons?_v=${sharedDataVersion}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({ data: [], message: "" }));
        if (cancelled) return;

        setAvailableModIcons(Array.isArray(json.data) ? (json.data as ModIconOption[]) : []);
        setModIconStatus(typeof json.message === "string" ? json.message : "");
      } catch {
        if (cancelled) return;
        setAvailableModIcons([]);
        setModIconStatus("Mod icon catalog could not be loaded from the active local game root.");
      } finally {
        if (!cancelled) {
          setModIconsLoading(false);
        }
      }
    }

    loadModIcons();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, mods.length - 1)));
  const deferredSearch = search.trim().toLowerCase();
  const selectedMod = mods[clampedSelectedIndex] ?? null;
  const selectedSyncedMod = useMemo(() => (selectedMod ? syncDerivedModFields(selectedMod) : null), [selectedMod]);
  const selectedBudget = useMemo(() => (selectedSyncedMod ? buildModBudgetSummary(selectedSyncedMod) : null), [selectedSyncedMod]);
  const selectedExportPreview = useMemo(
    () => (selectedSyncedMod ? JSON.stringify(exportModDraft(selectedSyncedMod), null, 2) : ""),
    [selectedSyncedMod],
  );

  const bulkTitles = useMemo(() => listFromLines(bulkCreate.titles), [bulkCreate.titles]);
  const bulkBudget = useMemo(() => calculateBulkCreateBudget(bulkCreate), [bulkCreate]);
  const bulkSellPrice = useMemo(
    () => calculateDerivedSellPrice(bulkCreate.levelRequirement, bulkCreate.rarity),
    [bulkCreate.levelRequirement, bulkCreate.rarity],
  );
  const filteredAbilityOptions = useMemo(() => {
    const searchValue = autoGenerate.abilitySearch.trim().toLowerCase();
    if (!searchValue) return availableAbilities;
    return availableAbilities.filter((ability) => {
      const name = (ability.name || "").toLowerCase();
      const id = String(ability.id).toLowerCase();
      return name.includes(searchValue) || id.includes(searchValue);
    });
  }, [autoGenerate.abilitySearch, availableAbilities]);

  const validation = useMemo(() => validateModDrafts(mods), [mods]);
  const issueFlagsByIndex = useMemo(() => {
    const map = new Map<number, { error: boolean; warning: boolean }>();
    for (const message of validation) {
      if (message.draftIndex === undefined) continue;
      const current = map.get(message.draftIndex) ?? { error: false, warning: false };
      current[message.level] = true;
      map.set(message.draftIndex, current);
    }
    return map;
  }, [validation]);

  const filteredMods = useMemo(() => {
    return mods
      .map((mod, index) => ({ mod: syncDerivedModFields(mod), index }))
      .filter(({ mod }) => {
        if (!deferredSearch) return true;
        return mod.name.toLowerCase().includes(deferredSearch);
      })
      .filter(({ mod }) => {
        if (!rarityFilter) return true;
        return mod.rarity.trim() === rarityFilter;
      })
      .filter(({ mod }) => {
        if (!slotFilter) return true;
        return mod.slot.trim() === slotFilter;
      })
      .filter(({ mod }) => {
        const levelRequirement = parseNumber(mod.levelRequirement);
        const min = parseNumber(levelMinFilter);
        const max = parseNumber(levelMaxFilter);

        if (min === undefined && max === undefined) return true;
        if (levelRequirement === undefined) return false;
        if (min !== undefined && levelRequirement < min) return false;
        if (max !== undefined && levelRequirement > max) return false;
        return true;
      })
      .filter(({ index }) => {
        if (issueFilter === "all") return true;
        const flags = issueFlagsByIndex.get(index);
        return issueFilter === "error" ? !!flags?.error : !!flags?.warning;
      })
      .filter(({ mod }) => {
        if (abilityLinkFilter === "all") return true;
        return abilityLinkFilter === "missing" ? !hasAttachedAbility(mod) : true;
      })
      .sort((left, right) => {
        const leftLabel = (left.mod.name || left.mod.id || "").trim().toLowerCase();
        const rightLabel = (right.mod.name || right.mod.id || "").trim().toLowerCase();
        const byLabel = leftLabel.localeCompare(rightLabel);
        if (byLabel !== 0) return byLabel;
        return left.mod.id.trim().localeCompare(right.mod.id.trim(), undefined, { numeric: true, sensitivity: "base" });
      });
  }, [abilityLinkFilter, deferredSearch, issueFilter, issueFlagsByIndex, levelMaxFilter, levelMinFilter, mods, rarityFilter, slotFilter]);

  const selectedValidation = useMemo(() => validation.filter((message) => message.draftIndex === clampedSelectedIndex), [clampedSelectedIndex, validation]);
  const selectedHasErrors = useMemo(
    () => selectedValidation.some((message) => message.level === "error"),
    [selectedValidation],
  );
  const anyValidationErrors = useMemo(() => validation.some((message) => message.level === "error"), [validation]);
  const errorDraftCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((entry) => entry.error).length, [issueFlagsByIndex]);
  const warningDraftCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((entry) => entry.warning).length, [issueFlagsByIndex]);
  const modsWithoutAbilityCount = useMemo(() => mods.filter((mod) => !hasAttachedAbility(mod)).length, [mods]);
  const modsBySlotCounts = useMemo(
    () =>
      MOD_SLOT_OPTIONS.reduce(
        (counts, slot) => {
          counts[slot] = mods.filter((mod) => mod.slot.trim() === slot).length;
          return counts;
        },
        {} as Record<(typeof MOD_SLOT_OPTIONS)[number], number>,
      ),
    [mods],
  );
  const activeSummaryFilter = useMemo<ModSummaryFilter | null>(() => {
    if (!slotFilter && abilityLinkFilter === "all") return "all";
    if (!slotFilter && abilityLinkFilter === "missing") return "missing";
    if (abilityLinkFilter === "all" && MOD_SLOT_OPTIONS.includes(slotFilter as (typeof MOD_SLOT_OPTIONS)[number])) {
      return slotFilter as ModSummaryFilter;
    }
    return null;
  }, [abilityLinkFilter, slotFilter]);
  const selectedMaxStats = useMemo(
    () => (selectedBudget?.supportedStatCounts.length ? Math.max(...selectedBudget.supportedStatCounts) : MOD_MAX_STATS),
    [selectedBudget],
  );
  const hasActiveFilters = Boolean(issueFilter !== "all" || abilityLinkFilter !== "all" || search.trim() || rarityFilter || slotFilter || levelMinFilter || levelMaxFilter);

  useEffect(() => {
    if (!filteredMods.length) return;
    if (filteredMods.some(({ index }) => index === clampedSelectedIndex)) return;
    setSelectedIndex(filteredMods[0].index);
  }, [clampedSelectedIndex, filteredMods]);

  function resetFilters() {
    setIssueFilter("all");
    setAbilityLinkFilter("all");
    setSearch("");
    setRarityFilter("");
    setSlotFilter("");
    setLevelMinFilter("");
    setLevelMaxFilter("");
  }

  function applySummaryFilter(filter: ModSummaryFilter) {
    setSearch("");
    setIssueFilter("all");
    setRarityFilter("");
    setLevelMinFilter("");
    setLevelMaxFilter("");

    if (filter === "all") {
      setSlotFilter("");
      setAbilityLinkFilter("all");
      return;
    }

    if (filter === "missing") {
      setSlotFilter("");
      setAbilityLinkFilter("missing");
      return;
    }

    setSlotFilter(filter);
    setAbilityLinkFilter("all");
  }

  function setModAt(index: number, next: ModDraft) {
    const synced = syncDerivedModFields(next);
    onChange(mods.map((mod, modIndex) => (modIndex === index ? synced : mod)));
  }

  function updateSelected(
    updater: (draft: ModDraft) => ModDraft,
    options: { autoBalance?: boolean; fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
  ) {
    if (!selectedSyncedMod) return;
    const nextDraft = updater(selectedSyncedMod);
    const preparedDraft = options.autoBalance
      ? autoBalanceModDraft(nextDraft, {
          fillBlankStatValues: options.fillBlankStatValues,
          syncAllStatValuesToMax: options.syncAllStatValuesToMax,
        })
      : nextDraft;
    setModAt(clampedSelectedIndex, preparedDraft);
  }

  function updateStat(
    statIndex: number,
    updater: (stat: ModStatDraft) => ModStatDraft,
    options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
  ) {
    updateSelected((draft) => ({
      ...draft,
      stats: draft.stats.map((stat, currentIndex) => (currentIndex === statIndex ? updater(stat) : stat)),
    }), {
      autoBalance: true,
      fillBlankStatValues: options.fillBlankStatValues,
      syncAllStatValuesToMax: options.syncAllStatValuesToMax,
    });
  }

  function updateAbility(abilityIndex: number, updater: (ability: ModAbilityDraft) => ModAbilityDraft) {
    updateSelected((draft) => ({
      ...draft,
      abilities: draft.abilities.map((ability, currentIndex) => (currentIndex === abilityIndex ? updater(ability) : ability)),
    }), { autoBalance: true });
  }

  function updateBulkCreate<K extends keyof BulkCreateState>(
    key: K,
    value: BulkCreateState[K],
    options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
  ) {
    setBulkCreate((current) => autoBalanceBulkCreateState({ ...current, [key]: value }, options));
  }

  function updateBulkAbility(
    abilityIndex: number,
    updater: (ability: ModAbilityDraft) => ModAbilityDraft,
    options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
  ) {
    setBulkCreate((current) => ({
      ...autoBalanceBulkCreateState({
        ...current,
        abilities: current.abilities.map((ability, currentIndex) => (currentIndex === abilityIndex ? updater(ability) : ability)),
      }, options),
    }));
  }

  function updateBulkStat(
    statIndex: number,
    updater: (stat: ModStatDraft) => ModStatDraft,
    options: { fillBlankStatValues?: boolean; syncAllStatValuesToMax?: boolean } = {},
  ) {
    setBulkCreate((current) => ({
      ...autoBalanceBulkCreateState({
        ...current,
        stats: current.stats.map((stat, currentIndex) => (currentIndex === statIndex ? updater(stat) : stat)),
      }, options),
    }));
  }

  function updateAutoGenerate<K extends keyof AutoGenerateState>(key: K, value: AutoGenerateState[K]) {
    setAutoGenerate((current) => ({ ...current, [key]: value }));
  }

  function toggleAutoGenerateValue(key: "allowedSlots" | "allowedRoles" | "allowedStats" | "abilityPool", value: string) {
    setAutoGenerate((current) => {
      const currentValues = current[key];
      return {
        ...current,
        [key]: currentValues.includes(value) ? currentValues.filter((entry) => entry !== value) : [...currentValues, value],
      };
    });
  }

  function addMod() {
    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const previousId = selectedSyncedMod?.id.trim() || existingIds[existingIds.length - 1];
    const newDraft = createModDraft(existingIds, previousId);
    const insertAt = selectedSyncedMod ? clampedSelectedIndex + 1 : mods.length;
    const next = [...mods];
    next.splice(insertAt, 0, newDraft);
    onChange(next);
    setSelectedIndex(insertAt);
    setStatus("Added a new mod to the manager list.");
  }

  function duplicateSelectedMod() {
    if (!selectedSyncedMod) return;
    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const next = [...mods];
    next.splice(clampedSelectedIndex + 1, 0, duplicateModDraft(selectedSyncedMod, existingIds));
    onChange(next);
    setSelectedIndex(clampedSelectedIndex + 1);
    setStatus("Cloned the selected mod.");
  }

  function removeSelectedMod() {
    const next = mods.filter((_, modIndex) => modIndex !== clampedSelectedIndex);
    onChange(next);
    setSelectedIndex(Math.max(0, clampedSelectedIndex - 1));
    setStatus("Deleted the selected mod.");
  }

  function createBulkMods() {
    if (!bulkTitles.length) {
      setStatus("Paste at least one mod title before creating bulk mods.");
      setEditorMode("bulk");
      return;
    }

    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const previousId = selectedSyncedMod?.id.trim() || existingIds[existingIds.length - 1];
    const template: BulkModTemplateDraft = {
      slot: bulkCreate.slot,
      classRestriction: bulkCreate.classRestriction ? [bulkCreate.classRestriction] : [],
      levelRequirement: bulkCreate.levelRequirement,
      rarity: bulkCreate.rarity,
      durability: bulkCreate.durability,
      sellPrice: bulkCreate.sellPrice,
      stats: bulkCreate.stats
        .filter((stat) => stat.key.trim() || stat.value.trim())
        .map((stat) => ({ ...stat })),
      abilities: bulkCreate.abilities
        .filter((ability) => ability.id.trim() || ability.budgetCost.trim())
        .map((ability) => ({ ...ability })),
      icon: bulkCreate.icon,
      description: bulkCreate.description,
    };

    const created = createBulkModDrafts(bulkTitles, template, existingIds, previousId);
    const insertAt = selectedSyncedMod ? clampedSelectedIndex + 1 : mods.length;
    const next = [...mods];
    next.splice(insertAt, 0, ...created);
    onChange(next);
    setSelectedIndex(insertAt);
    setBulkCreate((current) => ({ ...current, titles: "" }));
    setStatus(`Created ${created.length} mod(s) from the bulk title list.`);
  }

  function createAutoGeneratedMods() {
    try {
      const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
      const previousId = selectedSyncedMod?.id.trim() || existingIds[existingIds.length - 1];
      const result = generateAutoMods(
        {
          count: Number(autoGenerate.count),
          allowedSlots: autoGenerate.allowedSlots,
          levelMin: Number(autoGenerate.levelMin),
          levelMax: Number(autoGenerate.levelMax),
          rarity: Number(autoGenerate.rarity),
          allowedRoles: autoGenerate.allowedRoles,
          allowedStats: autoGenerate.allowedStats,
          abilityPool: autoGenerate.abilityPool,
        },
        existingIds,
        previousId,
        mods,
        availableAbilities,
      );

      const insertAt = selectedSyncedMod ? clampedSelectedIndex + 1 : mods.length;
      const next = [...mods];
      next.splice(insertAt, 0, ...result.mods);
      onChange(next);
      setSelectedIndex(insertAt);
      setEditorMode("editor");
      setStatus(
        `Generated ${result.mods.length} mod(s) and added them to the manager list.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`,
      );
    } catch (error) {
      setEditorMode("auto");
      setStatus(error instanceof Error ? error.message : "Auto-generation failed.");
    }
  }

  function exportSelectedMod() {
    if (!selectedSyncedMod) return;
    if (selectedHasErrors) {
      setStatus("Fix the selected mod's validation errors before exporting it.");
      return;
    }

    downloadJson(exportModDraft(selectedSyncedMod), modFilename(selectedSyncedMod, clampedSelectedIndex));
    setStatus("Exported the selected mod JSON.");
  }

  function exportAllMods() {
    if (anyValidationErrors) {
      setStatus("Fix mod validation errors before exporting Mods.json.");
      return;
    }

    downloadJson(exportModsJson(mods), "Mods.json");
    setStatus("Exported the full Mods.json file.");
  }

  async function copyAllModsJson() {
    if (anyValidationErrors) {
      setStatus("Fix mod validation errors before copying the full Mods.json payload.");
      return;
    }

    const didCopy = await copyText(JSON.stringify(exportModsJson(mods), null, 2));
    setStatus(didCopy ? "Copied the full Mods.json payload to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  async function copySelectedJson() {
    if (!selectedSyncedMod) return;
    if (selectedHasErrors) {
      setStatus("Fix the selected mod's validation errors before copying its JSON.");
      return;
    }

    const didCopy = await copyText(`,${JSON.stringify(exportModDraft(selectedSyncedMod), null, 2)}`);
    setStatus(didCopy ? "Copied the selected mod JSON to the clipboard with a leading comma." : "Clipboard copy failed in this browser context.");
  }

  async function copyExportPreview() {
    if (!selectedExportPreview) return;
    const didCopy = await copyText(selectedExportPreview);
    setStatus(didCopy ? "Copied the export preview JSON to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Mods" value={mods.length} active={activeSummaryFilter === "all"} onClick={() => applySummaryFilter("all")} />
        {MOD_SLOT_OPTIONS.map((slot) => (
          <SummaryCard
            key={slot}
            label={slot}
            value={modsBySlotCounts[slot]}
            active={activeSummaryFilter === slot}
            onClick={() => applySummaryFilter(slot)}
          />
        ))}
        <SummaryCard
          label="No Ability"
          value={modsWithoutAbilityCount}
          accent={modsWithoutAbilityCount ? "text-red-200" : undefined}
          active={activeSummaryFilter === "missing"}
          onClick={() => applySummaryFilter("missing")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <div className="space-y-6">
        <div className="card h-fit space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Mod Library</h2>
            <div className="text-xs text-white/50">
              {mods.length} mod(s) · {filteredMods.length} filtered · {MOD_SLOT_OPTIONS.length} slot(s)
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              className={`rounded px-2 py-2 text-xs whitespace-nowrap transition ${editorMode === "bulk" ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"}`}
              onClick={() => setEditorMode((current) => (current === "bulk" ? "editor" : "bulk"))}
            >
              {editorMode === "bulk" ? "Hide Bulk" : "Bulk Create"}
            </button>
            <button
              className={`rounded px-2 py-2 text-xs whitespace-nowrap transition ${editorMode === "auto" ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"}`}
              onClick={() => setEditorMode((current) => (current === "auto" ? "editor" : "auto"))}
            >
              {editorMode === "auto" ? "Hide Auto" : "Auto Generate"}
            </button>
            <button className="rounded bg-white/5 px-2 py-2 text-xs whitespace-nowrap hover:bg-white/10" onClick={addMod}>
              New
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
              disabled={anyValidationErrors}
              onClick={exportAllMods}
            >
              Export Mods.json
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <button
              className={`rounded border px-3 py-2 text-left transition ${
                issueFilter === "error"
                  ? "border-red-300/80 bg-red-500/20 text-red-50"
                  : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
              }`}
              onClick={() => setIssueFilter("error")}
            >
              <div className="label text-red-100/80">Errors</div>
              <div className="mt-1 text-lg font-semibold">{errorDraftCount}</div>
            </button>
            <button
              className={`rounded border px-3 py-2 text-left transition ${
                issueFilter === "warning"
                  ? "border-yellow-300/80 bg-yellow-500/20 text-yellow-50"
                  : "border-yellow-400/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
              }`}
              onClick={() => setIssueFilter("warning")}
            >
              <div className="label text-yellow-100/80">Warnings</div>
              <div className="mt-1 text-lg font-semibold">{warningDraftCount}</div>
            </button>
            <button
              className={`rounded border px-3 py-2 text-left transition ${
                abilityLinkFilter === "missing"
                  ? "border-accent/80 bg-accent/20 text-white"
                  : "border-accent/30 bg-accent/10 text-white/90 hover:bg-accent/15"
              }`}
              onClick={() => setAbilityLinkFilter("missing")}
            >
              <div className="label text-white/70">No Ability</div>
              <div className="mt-1 text-lg font-semibold">{modsWithoutAbilityCount}</div>
            </button>
            <button
              className="col-span-3 rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={resetFilters}
            >
              Reset Filter
            </button>
          </div>

          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filtered mods by name"
          />

          <div className="grid grid-cols-2 gap-2">
            <label>
              <div className="label mb-2">Rarity</div>
              <select className="select w-full" value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
                <option value="">All rarities</option>
                {Object.entries(RARITY_LABEL).map(([rarityValue, rarityLabel]) => (
                  <option key={`filter-rarity-${rarityValue}`} value={rarityValue}>
                    {rarityLabel}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="label mb-2">Mod Type</div>
              <select className="select w-full" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
                <option value="">All types</option>
                {MOD_SLOT_OPTIONS.map((slot) => (
                  <option key={`filter-slot-${slot}`} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="label mb-2">Level Min</div>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                step={1}
                value={levelMinFilter}
                onChange={(event) => setLevelMinFilter(event.target.value.trim() ? clampLevelInput(event.target.value) : "")}
                placeholder="1"
              />
            </label>
            <label>
              <div className="label mb-2">Level Max</div>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                step={1}
                value={levelMaxFilter}
                onChange={(event) => setLevelMaxFilter(event.target.value.trim() ? clampLevelInput(event.target.value) : "")}
                placeholder="100"
              />
            </label>
          </div>

          <div className="text-xs text-white/50">
            Showing {filteredMods.length} result{filteredMods.length === 1 ? "" : "s"}.
          </div>

          {status ? <div className="text-sm text-accent">{status}</div> : null}

          <div className="h-[21rem] space-y-2 overflow-auto pr-1">
            {filteredMods.length ? (
              filteredMods.map(({ mod, index }) => {
                const budget = buildModBudgetSummary(mod);
                const rarityValue = parseNumber(mod.rarity);
                const rarityColor = rarityValue !== undefined ? RARITY_COLOR[rarityValue] || "#FFFFFF" : "#FFFFFF";
                const iconSrc = buildIconSrc(mod.icon || DEFAULT_MOD_ICON, mod.id || "mod", mod.name || "Mod", sharedDataVersion);
                return (
                  <button
                    key={`${mod.id || "mod"}-${index}`}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      index === clampedSelectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={iconSrc} alt={mod.name || mod.id || "Mod"} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color: rarityColor }}>
                          {mod.name || "Untitled mod"}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-white/60">
                          <div className="truncate">
                            {mod.id || "missing-id"} · {mod.slot || "missing-slot"} · ilvl {budget.itemLevel ?? 0}
                          </div>
                          {!hasAttachedAbility(mod) ? (
                            <span className="shrink-0 rounded border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-red-100">
                              No Ability
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                No mods match the current filters.
              </div>
            )}
          </div>
        </div>

        {selectedSyncedMod ? <ValidationPanel messages={selectedValidation} noIssuesText="No validation issues for the selected mod." /> : null}

        {selectedSyncedMod ? <BudgetSummaryCard title="Budget Summary" summary={selectedBudget} compact /> : null}

        {selectedSyncedMod?.generatorMeta ? <GeneratorMetaCard mod={selectedSyncedMod} /> : null}
      </div>

      {!selectedSyncedMod && editorMode === "editor" ? null : (
        <div className="space-y-6">
          {editorMode === "bulk" ? (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bulk Create Mods</h2>
                  <div className="text-xs text-white/50">
                    Paste one title per line. Shared fields below will be copied to every new mod.
                  </div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                  {bulkTitles.length} title(s)
                </div>
              </div>

              <BudgetSummaryCard title="Bulk Budget Preview" summary={bulkBudget} />

              <div>
                <div className="label mb-2">Titles (one per line)</div>
                <textarea
                  className="input min-h-40"
                  value={bulkCreate.titles}
                  onChange={(event) => updateBulkCreate("titles", event.target.value)}
                  placeholder={"Basic Armor Panel\nIon Booster\nAssault Core"}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Slot"
                  value={bulkCreate.slot}
                  options={[
                    { value: "", label: "Leave blank" },
                    ...MOD_SLOT_OPTIONS.map((slot) => ({ value: slot, label: slot })),
                  ]}
                  onChange={(value) => updateBulkCreate("slot", value)}
                />
                <RarityField
                  label="Rarity"
                  value={bulkCreate.rarity}
                  onChange={(value) => updateBulkCreate("rarity", value, { syncAllStatValuesToMax: true })}
                  allowBlank
                />
                <Field
                  label="Required Level"
                  value={bulkCreate.levelRequirement}
                  inputMode="numeric"
                  step={1}
                  onChange={(value) => updateBulkCreate("levelRequirement", clampLevelInput(value), { syncAllStatValuesToMax: true })}
                  helpText="Required level is clamped between 1 and 100."
                />
                <Field
                  label="Calculated Item Level"
                  value={bulkBudget.itemLevel === undefined ? "" : String(bulkBudget.itemLevel)}
                  readOnly
                  helpText="Auto-calculated from rarity base, required level, stat values, and abilities."
                  onChange={() => {}}
                />
                <Field
                  label="Durability"
                  value={bulkCreate.durability}
                  inputMode="numeric"
                  step={1}
                  onChange={(value) => updateBulkCreate("durability", value)}
                />
                <Field
                  label="Calculated Sell Price"
                  value={bulkSellPrice === undefined ? "" : String(bulkSellPrice)}
                  readOnly
                  helpText="Auto-calculated as ceil(required level × rarity), with common using 0.5x."
                  onChange={() => {}}
                />
                <SelectField
                  label="Class Restriction"
                  value={bulkCreate.classRestriction}
                  options={CLASS_RESTRICTION_OPTIONS.map((value) => ({ value, label: value }))}
                  onChange={(value) => updateBulkCreate("classRestriction", value)}
                />
              </div>

              <ModIconField
                label="Icon"
                value={bulkCreate.icon}
                slot={bulkCreate.slot}
                onChange={(value) => updateBulkCreate("icon", value)}
                iconOptions={availableModIcons}
                loading={modIconsLoading}
                status={modIconStatus}
                version={sharedDataVersion}
                helpText="Choose from the local assets/mods catalog. The gallery narrows automatically to the selected slot."
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Shared Stats</div>
                    <div className="text-xs text-white/50">Up to {MOD_MAX_STATS} stat rows. These values are copied into every created mod.</div>
                  </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={bulkCreate.stats.length >= MOD_MAX_STATS}
                    onClick={() =>
                      setBulkCreate((current) =>
                        autoBalanceBulkCreateState(
                          {
                            ...current,
                            stats: [...current.stats, { key: "", value: "" }],
                          },
                          { syncAllStatValuesToMax: true },
                        ),
                      )
                    }
                  >
                    Add Stat
                  </button>
                </div>

                {bulkCreate.stats.length ? (
                  <div className="space-y-3">
                    {bulkCreate.stats.map((stat, statIndex) => (
                      <div key={`bulk-stat-${statIndex}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]">
                        <SelectField
                          label={statIndex === 0 ? "Stat Key" : " "}
                          value={stat.key}
                          options={buildStatOptions(stat.key)}
                          onChange={(value) =>
                            updateBulkStat(statIndex, (current) => ({ ...current, key: value }), {
                              fillBlankStatValues: true,
                              syncAllStatValuesToMax: true,
                            })
                          }
                        />
                        <Field
                          label={statIndex === 0 ? "Value" : " "}
                          value={stat.value}
                          inputMode="numeric"
                          step={getModStatBudgetConfig(stat.key)?.roundStep ?? 1}
                          onChange={(value) => updateBulkStat(statIndex, (current) => ({ ...current, value }))}
                        />
                        <div className="flex items-end">
                          <button
                            className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                            onClick={() =>
                              setBulkCreate((current) =>
                                autoBalanceBulkCreateState(
                                  {
                                    ...current,
                                    stats: current.stats.filter((_, currentIndex) => currentIndex !== statIndex),
                                  },
                                  { syncAllStatValuesToMax: true },
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                    No shared stats configured.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Shared Abilities</div>
                      <div className="text-xs text-white/50">Up to {MOD_MAX_ABILITIES} abilities. Slot cost applies to every created mod.</div>
                      <div className="text-xs text-white/50">The first ability is included for free. Each additional ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} of a full stat slot, plus any extra slot cost you enter.</div>
                    </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={bulkCreate.abilities.length >= MOD_MAX_ABILITIES}
                    onClick={() =>
                      setBulkCreate((current) =>
                        autoBalanceBulkCreateState(
                          {
                            ...current,
                            abilities: [...current.abilities, createModAbilityDraft()],
                          },
                          { syncAllStatValuesToMax: true },
                        ),
                      )
                    }
                  >
                    Add Ability
                  </button>
                </div>

                {bulkCreate.abilities.length ? (
                  <div className="space-y-3">
                    {bulkCreate.abilities.map((ability, abilityIndex) => (
                      <div key={`bulk-ability-${abilityIndex}`} className="space-y-3">
                        <AbilityPickerField
                          label={abilityIndex === 0 ? "Ability" : " "}
                          value={ability.id}
                          modSlot={bulkCreate.slot}
                          levelRequirement={bulkCreate.levelRequirement}
                          abilityOptions={availableAbilities}
                          version={sharedDataVersion}
                          onChange={(value) =>
                            updateBulkAbility(abilityIndex, (current) => ({ ...current, id: value }), {
                              syncAllStatValuesToMax: true,
                            })
                          }
                        />
                        <div className="grid gap-3 md:grid-cols-[180px,auto]">
                          <Field
                            label={abilityIndex === 0 ? "Extra Slot Cost" : " "}
                            value={ability.budgetCost}
                            inputMode="numeric"
                            step={0.01}
                            onChange={(value) =>
                              updateBulkAbility(abilityIndex, (current) => ({ ...current, budgetCost: value }), {
                                syncAllStatValuesToMax: true,
                              })
                            }
                          />
                          <div className="flex items-end">
                            <button
                              className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                              onClick={() =>
                                setBulkCreate((current) =>
                                  autoBalanceBulkCreateState(
                                    {
                                      ...current,
                                      abilities: current.abilities.filter((_, currentIndex) => currentIndex !== abilityIndex),
                                    },
                                    { syncAllStatValuesToMax: true },
                                  ),
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                    No shared abilities configured.
                  </div>
                )}
              </div>

              <div>
                <div className="label mb-2">Description</div>
                <textarea
                  className="input min-h-24"
                  value={bulkCreate.description}
                  onChange={(event) => updateBulkCreate("description", event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={createBulkMods}>
                  {bulkTitles.length ? `Create ${bulkTitles.length} Mods` : "Create Mods"}
                </button>
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => setBulkCreate(EMPTY_BULK_CREATE_STATE)}>
                  Clear
                </button>
              </div>

              <div className="text-xs text-white/50">
                Item level is generated from rarity base, required level, stat values, and abilities. Blank shared fields stay blank on the generated mods and surface as warnings later.
              </div>
            </div>
          ) : null}

          {editorMode === "auto" ? (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Auto Generate Mods</h2>
                  <div className="text-xs text-white/50">
                    Generate a batch from the slot, role, stat, and threat affinity config while keeping the existing mod budget system for final stat values.
                  </div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                  {autoGenerate.count || "0"} requested · {autoGenerate.allowedStats.length} stat option(s) · {autoGenerate.abilityPool.length} ability option(s)
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Count"
                  value={autoGenerate.count}
                  inputMode="numeric"
                  step={1}
                  onChange={(value) => updateAutoGenerate("count", value)}
                  helpText="Creates this many new mods in one batch."
                />
                <RarityField
                  label="Rarity"
                  value={autoGenerate.rarity}
                  onChange={(value) => updateAutoGenerate("rarity", value)}
                />
              </div>

              <div>
                <div className="label mb-2">Level Range</div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)]">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    value={autoGenerate.levelMin}
                    onChange={(event) => updateAutoGenerate("levelMin", event.target.value.trim() ? clampLevelInput(event.target.value) : "")}
                    placeholder="1"
                  />
                  <div className="flex items-center justify-center text-sm text-white/60">to</div>
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    value={autoGenerate.levelMax}
                    onChange={(event) => updateAutoGenerate("levelMax", event.target.value.trim() ? clampLevelInput(event.target.value) : "")}
                    placeholder="100"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">Allowed Slots</div>
                  <div className="text-xs text-white/50">
                    If multiple slots are checked, slot selection is biased by the selected role&apos;s slot affinity within this filtered pool.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {AUTO_MOD_SLOT_OPTIONS.map((option) => (
                    <CheckboxField
                      key={`auto-slot-${option.value}`}
                      label={option.label}
                      checked={autoGenerate.allowedSlots.includes(option.value)}
                      onChange={() => toggleAutoGenerateValue("allowedSlots", option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">Target Classes</div>
                  <div className="text-xs text-white/50">
                    These are the role ids from your generator config. Each generated mod targets one selected role; roles are not blended together.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {AUTO_MOD_ROLE_OPTIONS.map((option) => (
                    <CheckboxField
                      key={`auto-role-${option.value}`}
                      label={option.label}
                      checked={autoGenerate.allowedRoles.includes(option.value)}
                      onChange={() => toggleAutoGenerateValue("allowedRoles", option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">Allowed Stats</div>
                  <div className="text-xs text-white/50">
                    Uncheck any stats you want excluded from the procedural stat pool for this batch.
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {AUTO_MOD_STAT_OPTIONS.map((option) => (
                    <CheckboxField
                      key={`auto-stat-${option.value}`}
                      label={option.label}
                      checked={autoGenerate.allowedStats.includes(option.value)}
                      onChange={() => toggleAutoGenerateValue("allowedStats", option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Ability Pool</div>
                    <div className="text-xs text-white/50">
                      Pick the abilities that are allowed in this session. Generated mods usually stay stat-only, but any rolled ability is chosen from this bag.
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                    {availableAbilities.length} loaded
                  </div>
                </div>

                <input
                  className="input"
                  value={autoGenerate.abilitySearch}
                  onChange={(event) => updateAutoGenerate("abilitySearch", event.target.value)}
                  placeholder="Search abilities by name or id"
                />

                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredAbilityOptions.length ? (
                    filteredAbilityOptions.map((ability) => {
                      const abilityId = String(ability.id);
                      const checked = autoGenerate.abilityPool.includes(abilityId);
                      return (
                        <label
                          key={`auto-ability-${abilityId}`}
                          className={`flex items-start gap-3 rounded border px-3 py-3 text-sm transition ${
                            checked ? "border-accent bg-white/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                          }`}
                        >
                          <input
                            className="mt-1 h-4 w-4"
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAutoGenerateValue("abilityPool", abilityId)}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">{ability.name || abilityId}</div>
                            <div className="text-xs text-white/50">ID: {abilityId}</div>
                            {ability.description ? <div className="mt-1 text-xs text-white/60">{ability.description}</div> : null}
                            {ability.primaryModSlot || ability.secondaryModSlot ? (
                              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                                {ability.primaryModSlot ? (
                                  <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-white/65">Primary {ability.primaryModSlot}</span>
                                ) : null}
                                {ability.secondaryModSlot ? (
                                  <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-white/65">Secondary {ability.secondaryModSlot}</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                      No abilities match the current search.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={createAutoGeneratedMods}>
                  Generate {autoGenerate.count || "0"} Mods
                </button>
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => setAutoGenerate(EMPTY_AUTO_GENERATE_STATE)}>
                  Reset Auto Generator
                </button>
              </div>

              <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                Generated mods keep the current budget rules, export with the normal mod schema, keep game class restriction as <code>None</code>, and store the selected role/slot/debug output as authoring-only metadata on each generated mod.
              </div>
            </div>
          ) : null}

          {!selectedSyncedMod || editorMode !== "editor" ? null : (
            <>
              <div className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Mod Editor</h2>
                    <div className="text-xs text-white/50">Selected mod #{clampedSelectedIndex + 1}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={duplicateSelectedMod}>
                      Duplicate
                    </button>
                    <button
                      className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                      disabled={selectedHasErrors}
                      onClick={copySelectedJson}
                    >
                      Copy JSON
                    </button>
                    <button
                      className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                      disabled={anyValidationErrors}
                      onClick={copyAllModsJson}
                    >
                      Copy All Mods JSON
                    </button>
                    <button className="btn disabled:cursor-default disabled:opacity-40" disabled={selectedHasErrors} onClick={exportSelectedMod}>
                      Export Selected
                    </button>
                    <button className="btn disabled:cursor-default disabled:opacity-40" disabled={anyValidationErrors} onClick={exportAllMods}>
                      Export Mods.json
                    </button>
                    <button className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30" onClick={removeSelectedMod}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name" value={selectedSyncedMod.name} onChange={(value) => updateSelected((draft) => ({ ...draft, name: value }))} />
                  <Field
                    label="Mod ID"
                    value={selectedSyncedMod.id}
                    readOnly
                    helpText="New mods use the next available ID from the current mod list."
                    onChange={() => {}}
                  />
                  <SelectField
                    label="Slot"
                    value={selectedSyncedMod.slot}
                    options={[
                      { value: "", label: "Select slot" },
                      ...MOD_SLOT_OPTIONS.map((slot) => ({ value: slot, label: slot })),
                    ]}
                    onChange={(value) => updateSelected((draft) => ({ ...draft, slot: value }))}
                  />
                  <RarityField
                    label="Rarity"
                    value={selectedSyncedMod.rarity}
                    onChange={(value) => updateSelected((draft) => ({ ...draft, rarity: value }), { autoBalance: true, syncAllStatValuesToMax: true })}
                    allowBlank
                  />
                  <Field
                    label="Required Level"
                    value={selectedSyncedMod.levelRequirement}
                    inputMode="numeric"
                    step={1}
                    helpText="Required level is clamped between 1 and 100."
                    onChange={(value) =>
                      updateSelected(
                        (draft) => ({ ...draft, levelRequirement: clampLevelInput(value) }),
                        { autoBalance: true, syncAllStatValuesToMax: true },
                      )
                    }
                  />
                  <Field
                    label="Calculated Item Level"
                    value={selectedBudget?.itemLevel === undefined ? "" : String(selectedBudget.itemLevel)}
                    readOnly
                    helpText="Auto-calculated from rarity base, required level, stat values, and abilities."
                    onChange={() => {}}
                  />
                  <Field
                    label="Durability"
                    value={selectedSyncedMod.durability}
                    inputMode="numeric"
                    step={1}
                    onChange={(value) => updateSelected((draft) => ({ ...draft, durability: value }))}
                  />
                  <Field
                    label="Calculated Sell Price"
                    value={selectedSyncedMod.sellPrice}
                    readOnly
                    helpText="Auto-calculated as ceil(required level × rarity), with common using 0.5x."
                    onChange={() => {}}
                  />
                  <SelectField
                    label="Class Restriction"
                    value={selectedSyncedMod.classRestriction[0] ?? ""}
                    options={[
                      { value: "", label: "Select class restriction" },
                      ...CLASS_RESTRICTION_OPTIONS.map((value) => ({ value, label: value })),
                    ]}
                    onChange={(value) => updateSelected((draft) => ({ ...draft, classRestriction: value ? [value] : [] }))}
                  />
                </div>

                <ModIconField
                  label="Icon"
                  value={selectedSyncedMod.icon}
                  slot={selectedSyncedMod.slot}
                  onChange={(value) => updateSelected((draft) => ({ ...draft, icon: value }))}
                  iconOptions={availableModIcons}
                  loading={modIconsLoading}
                  status={modIconStatus}
                  version={sharedDataVersion}
                  helpText="Choose from the local assets/mods catalog. The gallery narrows automatically to the selected slot."
                />

                <div className="grid gap-3 md:grid-cols-4">
                  <CheckboxField
                    label="Stats Cap Override"
                    checked={selectedSyncedMod.statsCapOverride}
                    onChange={(checked) => updateSelected((draft) => ({ ...draft, statsCapOverride: checked }))}
                  />
                  <CheckboxField
                    label="Quest Reward"
                    checked={selectedSyncedMod.isQuestReward}
                    onChange={(checked) => updateSelected((draft) => ({ ...draft, isQuestReward: checked }))}
                  />
                  <CheckboxField
                    label="Dungeon Reward"
                    checked={selectedSyncedMod.isDungeonDrop}
                    onChange={(checked) => updateSelected((draft) => ({ ...draft, isDungeonDrop: checked }))}
                  />
                  <CheckboxField
                    label="Boss Drop"
                    checked={selectedSyncedMod.isBossDrop}
                    onChange={(checked) => updateSelected((draft) => ({ ...draft, isBossDrop: checked }))}
                  />
                </div>

                <div>
                  <div className="label mb-2">Description</div>
                  <textarea
                    className="input min-h-24"
                    value={selectedSyncedMod.description}
                    onChange={(event) => updateSelected((draft) => ({ ...draft, description: event.target.value }))}
                  />
                </div>
              </div>

              <div className="card space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Stats</h2>
                    <div className="text-xs text-white/50">
                      This rarity supports up to {selectedBudget?.supportedStatCounts.length ? Math.max(...selectedBudget.supportedStatCounts) : MOD_MAX_STATS} stats.
                      Fewer stats are valid. The first ability is free, and additional abilities consume slot capacity and lower the live stat caps automatically.
                    </div>
                  </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={selectedSyncedMod.stats.length >= selectedMaxStats}
                    onClick={() =>
                      updateSelected((draft) => ({
                        ...draft,
                        stats: [...draft.stats, { key: "", value: "" }],
                      }), { autoBalance: true, syncAllStatValuesToMax: true })
                    }
                  >
                    Add Stat
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedSyncedMod.stats.map((entry, statIndex) => {
                    const levelRequirement = parseNumber(selectedSyncedMod.levelRequirement);
                    const maxAtLevel = levelRequirement !== undefined ? getModStatMaxAtRequiredLevel(entry.key, levelRequirement) : undefined;
                    const slotIndex = entry.key.trim()
                      ? selectedSyncedMod.stats.slice(0, statIndex + 1).filter((stat) => stat.key.trim()).length - 1
                      : -1;
                    const statSummary =
                      slotIndex >= 0
                        ? selectedBudget?.stats.find((stat) => stat.slotIndex === slotIndex && stat.key === entry.key.trim())
                        : undefined;
                    const slotMultiplier = slotIndex >= 0 ? selectedBudget?.slotProfile?.[slotIndex] : undefined;
                    return (
                      <div key={`${entry.key || "stat"}-${statIndex}`} className="space-y-2">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]">
                          <SelectField
                            label={statIndex === 0 ? "Stat Key" : " "}
                            value={entry.key}
                            options={buildStatOptions(entry.key)}
                            onChange={(value) =>
                              updateStat(statIndex, (current) => ({
                                ...current,
                                key: value,
                              }), { fillBlankStatValues: true, syncAllStatValuesToMax: true })
                            }
                          />
                          <Field
                            label={statIndex === 0 ? "Value" : " "}
                            value={entry.value}
                            inputMode="numeric"
                            step={getModStatBudgetConfig(entry.key)?.roundStep ?? 1}
                            onChange={(value) => updateStat(statIndex, (current) => ({ ...current, value }))}
                          />
                          <div className="flex items-end">
                            <button
                              className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                              onClick={() =>
                                updateSelected((draft) => ({
                                  ...draft,
                                  stats: draft.stats.filter((_, currentIndex) => currentIndex !== statIndex),
                                }), { autoBalance: true, syncAllStatValuesToMax: true })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {entry.key.trim() ? (
                          <div className="text-xs text-white/50">
                            {maxAtLevel !== undefined ? `Base level max: ${maxAtLevel}.` : "Set required level to calculate the per-level stat max."}{" "}
                            {slotMultiplier !== undefined ? `Slot ${slotIndex + 1} profile share: ${slotMultiplier.toFixed(2)}.` : ""}
                            {statSummary?.adjustedSlotMultiplier !== undefined ? ` Current share after abilities: ${statSummary.adjustedSlotMultiplier.toFixed(2)}.` : ""}
                            {statSummary?.effectiveMaxValue !== undefined ? ` Default synced max: ${statSummary.effectiveMaxValue}.` : ""}
                            {statSummary?.currentMaxValue !== undefined ? ` Current max: ${statSummary.currentMaxValue}.` : ""}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Abilities</h2>
                    <div className="text-xs text-white/50">
                      Up to {MOD_MAX_ABILITIES} abilities. The first ability is included for free. Each additional ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} of a full stat slot, plus any extra slot cost you enter.
                    </div>
                  </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={selectedSyncedMod.abilities.length >= MOD_MAX_ABILITIES}
                    onClick={() =>
                      updateSelected((draft) => ({
                        ...draft,
                        abilities: [...draft.abilities, createModAbilityDraft()],
                      }), { autoBalance: true, syncAllStatValuesToMax: true })
                    }
                  >
                    Add Ability
                  </button>
                </div>

                {selectedSyncedMod.abilities.length ? (
                  <div className="space-y-3">
                    {selectedSyncedMod.abilities.map((ability, abilityIndex) => (
                      <div key={`${ability.id || "ability"}-${abilityIndex}`} className="space-y-3">
                        <AbilityPickerField
                          label={abilityIndex === 0 ? "Ability" : " "}
                          value={ability.id}
                          modSlot={selectedSyncedMod.slot}
                          levelRequirement={selectedSyncedMod.levelRequirement}
                          abilityOptions={availableAbilities}
                          version={sharedDataVersion}
                          onChange={(value) => updateSelected((draft) => ({
                            ...draft,
                            abilities: draft.abilities.map((currentAbility, currentIndex) =>
                              currentIndex === abilityIndex ? { ...currentAbility, id: value } : currentAbility,
                            ),
                          }), { autoBalance: true, syncAllStatValuesToMax: true })}
                        />
                        <div className="grid gap-3 md:grid-cols-[180px,auto]">
                          <Field
                            label={abilityIndex === 0 ? "Extra Slot Cost" : " "}
                            value={ability.budgetCost}
                            inputMode="numeric"
                            step={0.01}
                            onChange={(value) => updateSelected((draft) => ({
                              ...draft,
                              abilities: draft.abilities.map((currentAbility, currentIndex) =>
                                currentIndex === abilityIndex ? { ...currentAbility, budgetCost: value } : currentAbility,
                              ),
                            }), { autoBalance: true, syncAllStatValuesToMax: true })}
                          />
                          <div className="flex items-end">
                            <button
                              className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                              onClick={() =>
                                updateSelected((draft) => ({
                                  ...draft,
                                  abilities: draft.abilities.filter((_, currentIndex) => currentIndex !== abilityIndex),
                                }), { autoBalance: true, syncAllStatValuesToMax: true })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                    No abilities set on this mod.
                  </div>
                )}

                <div className="text-xs text-white/50">
                  Ability rows are authoring-only budget inputs. Exported `Mods.json` still writes only the ability ids array. The first ability is free, and each additional ability consumes at least {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} slot capacity.
                </div>
              </div>

              <div className="card space-y-4">
                <div>
                  <div className="label mb-2">Mod extra JSON (merged at export)</div>
                  <textarea
                    className="input min-h-32 font-mono text-sm"
                    value={selectedSyncedMod.extraJson}
                    onChange={(event) => updateSelected((draft) => ({ ...draft, extraJson: event.target.value }))}
                    placeholder='{"drop_table": "rare_mods"}'
                  />
                </div>
              </div>

              <div className="card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Export Preview</h2>
                  <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={copyExportPreview}>
                    Copy Preview JSON
                  </button>
                </div>
                <pre className="max-h-[70vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">
                  {selectedExportPreview}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function BudgetSummaryCard({
  title,
  summary,
  compact = false,
}: {
  title: string;
  summary: ReturnType<typeof calculateModBudgetSummary> | null;
  compact?: boolean;
}) {
  return (
    <div className={`rounded border border-white/10 bg-black/20 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {summary?.rarity !== undefined && Number.isFinite(summary.rarity) ? (
          <div className="text-xs font-medium" style={{ color: RARITY_COLOR[summary.rarity] || "#FFFFFF" }}>
            {RARITY_LABEL[summary.rarity] ?? `Rarity ${summary.rarity}`}
          </div>
        ) : null}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-white/60">
        <div className="rounded border border-white/10 bg-black/10 px-2 py-1">
          Supports up to {summary?.supportedStatCounts.length ? Math.max(...summary.supportedStatCounts) : "—"} stats
        </div>
        <div className="rounded border border-white/10 bg-black/10 px-2 py-1">
          Active stats: {summary?.activeStatCount ?? 0}
        </div>
        <div className="rounded border border-white/10 bg-black/10 px-2 py-1">
          Profile: {summary?.slotProfileLabel ?? "No active profile"}
        </div>
      </div>
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
        <Metric compact={compact} label="Required Level" value={summary?.requiredLevel ?? "—"} />
        <Metric compact={compact} label="Base Stat Max" value={formatBudget(summary?.baseStatMax)} />
        <Metric compact={compact} label="Rarity Capacity" value={formatBudget(summary?.rarityCapacityMultiplier)} />
        <Metric compact={compact} label="Target Budget" value={formatBudget(summary?.targetScore)} />
        <Metric compact={compact} label="Power Used" value={formatBudget(summary?.totalBudgetSpent)} />
        <Metric
          compact={compact}
          label="Budget Remaining"
          value={formatBudget(summary?.budgetRemaining)}
          highlight={summary?.budgetRemaining !== undefined && summary.budgetRemaining < 0}
        />
        <Metric compact={compact} label="Stat Power" value={formatBudget(summary?.totalStatBudget)} />
        <Metric compact={compact} label="Ability Power" value={formatBudget(summary?.totalAbilityBudget)} />
        <Metric compact={compact} label="Ability Slot Cost" value={formatBudget(summary?.abilitySlotCostTotal)} />
        <Metric compact={compact} label="Stat Capacity Left" value={formatBudget(summary?.statCapacityRemainingMultiplier)} />
        <Metric compact={compact} label="Calculated Item Level" value={summary?.itemLevel ?? "—"} />
      </div>
      <div className={`mt-3 text-xs text-white/50 ${compact ? "leading-5" : ""}`}>
        Full single-stat max is currently the required level. Slot profiles scale that max up or down, the first ability is included for free, and each additional ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} slot capacity before any extra slot cost.
      </div>
    </div>
  );
}

function GeneratorMetaCard({ mod }: { mod: ModDraft }) {
  const meta = mod.generatorMeta;
  if (!meta) return null;

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Generation Debug</h2>
        <div className="text-xs text-white/50">Authoring-only metadata captured when this mod was auto-generated.</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric compact label="Class" value={meta.roleId} />
        <Metric compact label="Slot" value={meta.slotId} />
        <Metric compact label="Level" value={meta.level} />
        <Metric compact label="Rarity" value={meta.rarity} />
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3 text-sm">
        <div className="label mb-2">Generated Name</div>
        <div className="font-medium text-white">{meta.naming?.displayName || mod.name || "—"}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/70">
            Source: {meta.naming?.source ? meta.naming.source.replace(/_/g, " ") : "legacy"}
          </span>
          {meta.naming?.threatSign ? (
            <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/70">Threat sign: {meta.naming.threatSign}</span>
          ) : null}
          {meta.naming?.collisionResolved ? (
            <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/70">Collision resolved</span>
          ) : null}
        </div>
        {meta.naming ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/65">
            {meta.naming.corePhrase ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Core Phrase: {meta.naming.corePhrase}</div> : null}
            {meta.naming.selectedPrefix ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Prefix: {meta.naming.selectedPrefix}</div> : null}
            {meta.naming.descriptor ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Descriptor: {meta.naming.descriptor}</div> : null}
            {meta.naming.modifier ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Modifier: {meta.naming.modifier}</div> : null}
            {meta.naming.baseTerm ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Base Term: {meta.naming.baseTerm}</div> : null}
            {meta.naming.component ? <div className="rounded border border-white/10 bg-black/20 px-2 py-2">Component: {meta.naming.component}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3 text-sm">
        <div className="label mb-2">Primary Stat</div>
        <div className="font-medium text-white">{meta.primaryStat}</div>
        <div className="mt-3 label mb-2">Allowed Stat Pool</div>
        <div className="flex flex-wrap gap-2">
          {meta.requestedStats.length ? (
            meta.requestedStats.map((statId) => (
              <span key={`requested-stat-${statId}`} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70">
                {statId}
              </span>
            ))
          ) : (
            <span className="text-xs text-white/50">All procedural stats were eligible.</span>
          )}
        </div>
        <div className="mt-3 label mb-2">Secondary Stats</div>
        <div className="flex flex-wrap gap-2">
          {meta.secondaryStats.length ? (
            meta.secondaryStats.map((statId) => (
              <span key={`secondary-${statId}`} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70">
                {statId}
              </span>
            ))
          ) : (
            <span className="text-xs text-white/50">None</span>
          )}
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3 text-sm">
        <div className="label mb-2">Ability Pool</div>
        <div className="flex flex-wrap gap-2">
          {meta.abilityPool.length ? (
            meta.abilityPool.map((abilityId) => (
              <span key={`ability-pool-${String(abilityId)}`} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70">
                {String(abilityId)}
              </span>
            ))
          ) : (
            <span className="text-xs text-white/50">No abilities were eligible for this batch.</span>
          )}
        </div>
        <div className="mt-3 label mb-2">Selected Abilities</div>
        <div className="flex flex-wrap gap-2">
          {meta.selectedAbilities.length ? (
            meta.selectedAbilities.map((abilityId) => (
              <span key={`selected-ability-${String(abilityId)}`} className="rounded border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent">
                {String(abilityId)}
              </span>
            ))
          ) : (
            <span className="text-xs text-white/50">No ability rolled onto this mod.</span>
          )}
        </div>
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3 text-sm">
        <div className="label mb-2">Final Rolled Stat Values</div>
        <div className="space-y-2">
          {Object.entries(meta.finalRolledStats).map(([statId, value]) => (
            <div key={`rolled-${statId}`} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-3 py-2">
              <span className="text-white/70">{statId}</span>
              <span className="font-medium text-white">{value}</span>
            </div>
          ))}
        </div>
        {meta.threatSign ? <div className="mt-3 text-xs text-white/50">Threat sign: {meta.threatSign}</div> : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`rounded border ${compact ? "px-2 py-2" : "px-3 py-2"} ${highlight ? "border-red-400/40 bg-red-500/10 text-red-100" : "border-white/10 bg-black/10"}`}>
      <div className="label">{label}</div>
      <div className={`mt-1 font-semibold ${compact ? "text-base" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function ValidationPanel({
  messages,
  noIssuesText,
}: {
  messages: ValidationMessage[];
  noIssuesText: string;
}) {
  return (
    <div className="card">
      <h2 className="mb-3 text-lg font-semibold">Validation</h2>
      {messages.length ? (
        <div className="space-y-2">
          {messages.map((message, index) => (
            <div
              key={`${message.message}-${index}`}
              className={`rounded border px-3 py-2 text-sm ${
                message.level === "error"
                  ? "border-red-400/40 bg-red-500/10 text-red-100"
                  : "border-yellow-400/40 bg-yellow-500/10 text-yellow-100"
              }`}
            >
              <div className="font-semibold uppercase">{message.level}</div>
              <div>{message.message}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/60">{noIssuesText}</div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  step,
  readOnly,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  step?: number | string;
  readOnly?: boolean;
  helpText?: string;
}) {
  return (
    <label>
      <div className="label mb-2">{label.trim() ? label : "\u00a0"}</div>
      <input
        className={`input ${readOnly ? "cursor-default text-white/70" : ""}`}
        type={inputMode === "numeric" ? "number" : "text"}
        value={value}
        step={inputMode === "numeric" ? step ?? 1 : undefined}
        inputMode={inputMode}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      {helpText ? <div className="mt-1 text-xs text-white/50">{helpText}</div> : null}
    </label>
  );
}

function ModIconField({
  label,
  value,
  slot,
  onChange,
  iconOptions,
  loading,
  status,
  version,
  helpText,
}: {
  label: string;
  value: string;
  slot: string;
  onChange: (value: string) => void;
  iconOptions: ModIconOption[];
  loading: boolean;
  status: string;
  version?: string;
  helpText?: string;
}) {
  const filteredOptions = filterModIconOptionsBySlot(iconOptions, slot);
  const selectedOption = iconOptions.find((option) => matchesModIconValue(option, value)) ?? null;
  const previewSrc = buildIconSrc(value || DEFAULT_MOD_ICON, selectedOption?.fileName || "mod", selectedOption?.fileName || "Mod icon", version);
  const slotLabel = slot.trim();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label mb-2">{label}</div>
          {helpText ? <div className="text-xs text-white/50">{helpText}</div> : null}
        </div>
        <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
          {loading
            ? "Loading icons…"
            : `${filteredOptions.length} icon option(s)${slotLabel ? ` for ${slotLabel}` : ""}`}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[96px,minmax(0,1fr)]">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt={selectedOption?.fileName || "Mod icon preview"} className="h-full w-full object-cover" />
        </div>
        <div className="space-y-2">
          <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="res://assets/mods/DEFAULT.png" />
          <div className="text-xs text-white/50">
            {selectedOption
              ? `Selected file: ${selectedOption.fileName}`
              : slotLabel
                ? `Showing icons that match the ${slotLabel} slot, plus shared defaults.`
                : "Select a slot to narrow the icon gallery, or choose from the full mod icon list."}
          </div>
        </div>
      </div>

      {status ? <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">{status}</div> : null}

      <div className="max-h-72 overflow-auto pr-1">
        {filteredOptions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOptions.map((option) => {
              const selected = matchesModIconValue(option, value);
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
                      <div className="truncate text-xs text-white/50">{option.slot ?? "Shared default"}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
            {slotLabel ? `No icons matched the ${slotLabel} slot in assets/mods.` : "No mod icons were found in assets/mods."}
          </div>
        )}
      </div>
    </div>
  );
}

function AbilityPickerField({
  label,
  value,
  modSlot,
  levelRequirement,
  onChange,
  abilityOptions,
  version,
}: {
  label: string;
  value: string;
  modSlot?: string;
  levelRequirement?: string;
  onChange: (value: string) => void;
  abilityOptions: AbilityOption[];
  version?: string;
}) {
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<(typeof ABILITY_DELIVERY_FILTER_OPTIONS)[number]["value"]>("all");
  const [linkFilter, setLinkFilter] = useState<(typeof ABILITY_LINK_FILTER_OPTIONS)[number]["value"]>("all");

  const normalizedValue = normalizeAbilityId(value);
  const selectedAbility = abilityOptions.find((option) => normalizeAbilityId(option.id) === normalizedValue) ?? null;
  const selectedAbilitySlotMatch = selectedAbility ? getAbilitySlotMatchType(selectedAbility, modSlot) : null;
  const currentLevel = parseNumber(levelRequirement ?? "");
  const filteredOptions = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return abilityOptions
      .filter((option) => {
        if (!searchValue) return true;
        const id = normalizeAbilityId(option.id).toLowerCase();
        const name = (option.name || "").toLowerCase();
        const description = (option.description || "").toLowerCase();
        return id.includes(searchValue) || name.includes(searchValue) || description.includes(searchValue);
      })
      .filter((option) => {
        if (deliveryFilter === "all") return true;
        return (option.deliveryType ?? "other") === deliveryFilter;
      })
      .filter((option) => {
        if (linkFilter === "all") return true;
        const hasLinkedEffects = (option.linkedEffectCount ?? 0) > 0;
        return linkFilter === "linked" ? hasLinkedEffects : !hasLinkedEffects;
      })
      .sort((left, right) => {
        const leftMatch = getAbilitySlotMatchType(left, modSlot);
        const rightMatch = getAbilitySlotMatchType(right, modSlot);
        const leftRank = leftMatch === "primary" ? 2 : leftMatch === "secondary" ? 1 : 0;
        const rightRank = rightMatch === "primary" ? 2 : rightMatch === "secondary" ? 1 : 0;
        if (leftRank !== rightRank) return rightRank - leftRank;

        const leftLabel = (left.name || normalizeAbilityId(left.id)).toLowerCase();
        const rightLabel = (right.name || normalizeAbilityId(right.id)).toLowerCase();
        return leftLabel.localeCompare(rightLabel);
      });
  }, [abilityOptions, deliveryFilter, linkFilter, modSlot, search]);
  const previewSrc = buildIconSrc(selectedAbility?.icon || DEFAULT_ABILITY_ICON, normalizedValue || "ability", selectedAbility?.name || "Ability", version);

  return (
    <div className="space-y-3">
      <div className="label mb-2">{label.trim() ? label : "\u00a0"}</div>
      <div className="grid gap-3 md:grid-cols-[88px,minmax(0,1fr)]">
        <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt={selectedAbility?.name || "Ability preview"} className="h-full w-full object-cover" />
        </div>
        <div className="space-y-2">
          <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Choose an ability below or enter an ID" />
          <div className="text-xs text-white/50">
            {selectedAbility ? (
              <>
                <span className="font-medium text-white/80">{selectedAbility.name || normalizeAbilityId(selectedAbility.id)}</span>
                {selectedAbility.description ? ` · ${selectedAbility.description}` : ""}
              </>
            ) : (
              "Click an ability card below to attach it to this mod."
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/70">
              Type: {selectedAbility?.deliveryType ? selectedAbility.deliveryType[0].toUpperCase() + selectedAbility.deliveryType.slice(1) : "Unknown"}
            </span>
            <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-white/70">
              Mods: {selectedAbility?.linkedModCount ?? 0}
            </span>
            {selectedAbility?.primaryModSlot ? (
              <span
                className={`rounded border px-2 py-1 ${
                  selectedAbilitySlotMatch === "primary" ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-black/20 text-white/70"
                }`}
              >
                Primary: {selectedAbility.primaryModSlot}
              </span>
            ) : null}
            {selectedAbility?.secondaryModSlot ? (
              <span
                className={`rounded border px-2 py-1 ${
                  selectedAbilitySlotMatch === "secondary" ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-black/20 text-white/70"
                }`}
              >
                Secondary: {selectedAbility.secondaryModSlot}
              </span>
            ) : null}
            {selectedAbility?.minimumModLevel ? (
              <span
                className={`rounded border px-2 py-1 ${
                  currentLevel !== undefined && currentLevel < selectedAbility.minimumModLevel
                    ? "border-yellow-400/40 bg-yellow-500/10 text-yellow-100"
                    : "border-white/10 bg-black/20 text-white/70"
                }`}
              >
                Min Mod Level: {selectedAbility.minimumModLevel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,180px]">
        <input
          className="input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search abilities by id, name, or description"
        />
        <select className="select w-full" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value as (typeof ABILITY_DELIVERY_FILTER_OPTIONS)[number]["value"])}>
          {ABILITY_DELIVERY_FILTER_OPTIONS.map((option) => (
            <option key={`ability-delivery-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className="select w-full" value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as (typeof ABILITY_LINK_FILTER_OPTIONS)[number]["value"])}>
          {ABILITY_LINK_FILTER_OPTIONS.map((option) => (
            <option key={`ability-link-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-h-72 overflow-auto pr-1">
        {filteredOptions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOptions.map((option) => {
              const selected = normalizeAbilityId(option.id) === normalizedValue;
              const minLevelMismatch =
                option.minimumModLevel !== null &&
                option.minimumModLevel !== undefined &&
                currentLevel !== undefined &&
                currentLevel < option.minimumModLevel;
              const slotMatch = getAbilitySlotMatchType(option, modSlot);
              return (
                <button
                  key={`ability-option-${normalizeAbilityId(option.id)}`}
                  type="button"
                  className={`rounded border p-2 text-left transition ${
                    selected ? "border-accent bg-white/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                  }`}
                  onClick={() => onChange(normalizeAbilityId(option.id))}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={buildIconSrc(option.icon || DEFAULT_ABILITY_ICON, normalizeAbilityId(option.id), option.name || "Ability", version)}
                        alt={option.name || normalizeAbilityId(option.id)}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{option.name || normalizeAbilityId(option.id)}</div>
                      <div className="truncate text-xs text-white/50">
                        {normalizeAbilityId(option.id)} · {option.deliveryType ?? "other"}
                      </div>
                      {option.description ? <div className="mt-1 line-clamp-2 text-xs text-white/60">{option.description}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                        {option.primaryModSlot ? (
                          <span
                            className={`rounded border px-2 py-0.5 ${
                              slotMatch === "primary"
                                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                                : "border-white/10 bg-black/20 text-white/65"
                            }`}
                          >
                            Primary {option.primaryModSlot}
                          </span>
                        ) : null}
                        {option.secondaryModSlot ? (
                          <span
                            className={`rounded border px-2 py-0.5 ${
                              slotMatch === "secondary"
                                ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                                : "border-white/10 bg-black/20 text-white/65"
                            }`}
                          >
                            Secondary {option.secondaryModSlot}
                          </span>
                        ) : null}
                        <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-white/65">
                          Mods: {option.linkedModCount ?? 0}
                        </span>
                        {option.minimumModLevel ? (
                          <span
                            className={`rounded border px-2 py-0.5 ${
                              minLevelMismatch
                                ? "border-yellow-400/40 bg-yellow-500/10 text-yellow-100"
                                : "border-white/10 bg-black/20 text-white/65"
                            }`}
                          >
                            Min {option.minimumModLevel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
            No abilities matched the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <div className="label mb-2">{label.trim() ? label : "\u00a0"}</div>
      <select className="select w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${label}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="rounded border border-white/10 bg-black/10 px-3 py-3">
      <div className="flex items-center gap-3">
        <input className="h-4 w-4" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
    </label>
  );
}

function RarityField({
  label,
  value,
  onChange,
  allowBlank = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowBlank?: boolean;
}) {
  const rarityNumber = Number(value);
  const selectedColor = Number.isFinite(rarityNumber) ? RARITY_COLOR[rarityNumber] || "#FFFFFF" : "#FFFFFF";

  return (
    <label>
      <div className="label mb-2">{label}</div>
      <select
        className="select w-full font-medium"
        value={value}
        style={{ color: selectedColor }}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowBlank ? (
          <option value="" style={{ color: "#FFFFFF" }}>
            Select rarity
          </option>
        ) : null}
        {Object.entries(RARITY_LABEL).map(([rarityValue, rarityLabel]) => (
          <option key={rarityValue} value={rarityValue} style={{ color: RARITY_COLOR[Number(rarityValue)] || "#FFFFFF" }}>
            {rarityValue} · {rarityLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildStatOptions(currentKey: string) {
  const options = ALL_STATS.map((stat) => ({
    value: stat,
    label: stat,
  }));

  if (currentKey.trim() && !options.some((option) => option.value === currentKey)) {
    options.unshift({ value: currentKey, label: `${currentKey} (custom)` });
  }

  return [{ value: "", label: "Select stat" }, ...options];
}

function formatBudget(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
