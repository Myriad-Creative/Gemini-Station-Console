"use client";

import { ChangeEvent, HTMLAttributes, startTransition, useEffect, useMemo, useState } from "react";
import { ALL_STATS, CLASS_RESTRICTION_OPTIONS, MOD_SLOT_OPTIONS, RARITY_COLOR, RARITY_LABEL } from "@lib/constants";
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
  normalizeImportedModCollection,
  parseNumber,
  syncDerivedModFields,
  validateModDrafts,
} from "@lib/authoring";
import { parseLooseJson } from "@lib/json";
import {
  MOD_BASE_ABILITY_SLOT_COST,
  MOD_MAX_ABILITIES,
  MOD_MAX_STATS,
  calculateModBudgetSummary,
  getModStatBudgetConfig,
  getModStatMaxAtRequiredLevel,
} from "@lib/mod-budget";

type IssueFilter = "all" | "error" | "warning";

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

export default function ModWorkshop({
  mods,
  onChange,
  consoleModCount,
}: {
  mods: ModDraft[];
  onChange: (next: ModDraft[]) => void;
  consoleModCount: number;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [rarityFilter, setRarityFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [levelMinFilter, setLevelMinFilter] = useState("");
  const [levelMaxFilter, setLevelMaxFilter] = useState("");
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkCreate, setBulkCreate] = useState<BulkCreateState>(EMPTY_BULK_CREATE_STATE);

  useEffect(() => {
    if (selectedIndex <= mods.length - 1) return;
    setSelectedIndex(Math.max(0, mods.length - 1));
  }, [mods.length, selectedIndex]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, mods.length - 1)));
  const deferredSearch = search.trim().toLowerCase();
  const selectedMod = mods[clampedSelectedIndex] ?? null;
  const selectedSyncedMod = useMemo(() => (selectedMod ? syncDerivedModFields(selectedMod) : null), [selectedMod]);
  const selectedBudget = useMemo(() => (selectedSyncedMod ? buildModBudgetSummary(selectedSyncedMod) : null), [selectedSyncedMod]);

  const bulkTitles = useMemo(() => listFromLines(bulkCreate.titles), [bulkCreate.titles]);
  const bulkBudget = useMemo(
    () =>
      calculateModBudgetSummary({
        requiredLevel: parseNumber(clampLevelInput(bulkCreate.levelRequirement)),
        rarity: parseNumber(bulkCreate.rarity),
        stats: bulkCreate.stats.map((entry) => ({
          key: entry.key.trim(),
          value: parseNumber(entry.value),
        })),
        abilities: bulkCreate.abilities.map((entry) => ({
          id: entry.id.trim(),
          budgetCost: parseNumber(entry.budgetCost),
        })),
      }),
    [bulkCreate],
  );
  const bulkSellPrice = useMemo(
    () => calculateDerivedSellPrice(bulkCreate.levelRequirement, bulkCreate.rarity),
    [bulkCreate.levelRequirement, bulkCreate.rarity],
  );

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
      });
  }, [deferredSearch, issueFilter, issueFlagsByIndex, levelMaxFilter, levelMinFilter, mods, rarityFilter, slotFilter]);

  const selectedValidation = useMemo(() => validation.filter((message) => message.draftIndex === clampedSelectedIndex), [clampedSelectedIndex, validation]);
  const selectedHasErrors = useMemo(
    () => selectedValidation.some((message) => message.level === "error"),
    [selectedValidation],
  );
  const anyValidationErrors = useMemo(() => validation.some((message) => message.level === "error"), [validation]);
  const errorDraftCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((entry) => entry.error).length, [issueFlagsByIndex]);
  const warningDraftCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((entry) => entry.warning).length, [issueFlagsByIndex]);
  const selectedMaxStats = useMemo(
    () => (selectedBudget?.supportedStatCounts.length ? Math.max(...selectedBudget.supportedStatCounts) : MOD_MAX_STATS),
    [selectedBudget],
  );
  const hasActiveFilters = Boolean(issueFilter !== "all" || search.trim() || rarityFilter || slotFilter || levelMinFilter || levelMaxFilter);

  useEffect(() => {
    if (!filteredMods.length) return;
    if (filteredMods.some(({ index }) => index === clampedSelectedIndex)) return;
    setSelectedIndex(filteredMods[0].index);
  }, [clampedSelectedIndex, filteredMods]);

  function resetFilters() {
    setIssueFilter("all");
    setSearch("");
    setRarityFilter("");
    setSlotFilter("");
    setLevelMinFilter("");
    setLevelMaxFilter("");
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

  function updateBulkCreate<K extends keyof BulkCreateState>(key: K, value: BulkCreateState[K]) {
    setBulkCreate((current) => ({ ...current, [key]: value }));
  }

  function updateBulkAbility(abilityIndex: number, updater: (ability: ModAbilityDraft) => ModAbilityDraft) {
    setBulkCreate((current) => ({
      ...current,
      abilities: current.abilities.map((ability, currentIndex) => (currentIndex === abilityIndex ? updater(ability) : ability)),
    }));
  }

  function updateBulkStat(statIndex: number, updater: (stat: ModStatDraft) => ModStatDraft) {
    setBulkCreate((current) => ({
      ...current,
      stats: current.stats.map((stat, currentIndex) => (currentIndex === statIndex ? updater(stat) : stat)),
    }));
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
    setStatus("Created a new mod draft.");
  }

  function duplicateSelectedMod() {
    if (!selectedSyncedMod) return;
    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const next = [...mods];
    next.splice(clampedSelectedIndex + 1, 0, duplicateModDraft(selectedSyncedMod, existingIds));
    onChange(next);
    setSelectedIndex(clampedSelectedIndex + 1);
    setStatus("Duplicated the selected mod draft.");
  }

  function removeSelectedMod() {
    const next = mods.filter((_, modIndex) => modIndex !== clampedSelectedIndex);
    onChange(next.length ? next : [createModDraft()]);
    setSelectedIndex(Math.max(0, clampedSelectedIndex - 1));
    setStatus("Deleted the selected mod draft.");
  }

  function createBulkMods() {
    if (!bulkTitles.length) {
      setStatus("Paste at least one mod title before creating bulk mods.");
      setShowBulkCreate(true);
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
    setStatus(`Created ${created.length} mod draft(s) from the bulk title list.`);
  }

  async function importModsJson(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseLooseJson(text);
      const imported = normalizeImportedModCollection(parsed);
      if (imported.length) {
        startTransition(() => {
          onChange(imported.map((mod) => syncDerivedModFields(mod)));
          setSelectedIndex(0);
        });
        setStatus(`Imported ${imported.length} mod draft(s) from ${file.name}.`);
      } else {
        setStatus("No mod entries were found in the selected JSON file.");
      }
    } catch {
      setStatus("The selected file could not be parsed as Mods.json.");
    }

    input.value = "";
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
    setStatus("Exported the full Mods.json draft.");
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

    const didCopy = await copyText(JSON.stringify(exportModDraft(selectedSyncedMod), null, 2));
    setStatus(didCopy ? "Copied the selected mod JSON to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="card h-fit space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Mod Library</h2>
              <div className="text-xs text-white/50">
                {mods.length} draft(s) · {filteredMods.length} filtered · {MOD_SLOT_OPTIONS.length} slot(s) · {consoleModCount} console mod seed(s)
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className={`rounded px-3 py-2 text-sm transition ${showBulkCreate ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"}`}
                onClick={() => setShowBulkCreate((current) => !current)}
              >
                {showBulkCreate ? "Hide Bulk" : "Bulk Create"}
              </button>
              <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={addMod}>
                New
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              Import Mods.json
              <input className="hidden" type="file" accept=".json,application/json" onChange={importModsJson} />
            </label>
            <button
              className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
              disabled={anyValidationErrors}
              onClick={exportAllMods}
            >
              Export Mods.json
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
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
              className="col-span-2 rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
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
                return (
                  <button
                    key={`${mod.id || "mod"}-${index}`}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      index === clampedSelectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <div className="truncate font-medium" style={{ color: rarityColor }}>
                      {mod.name || "Untitled mod"}
                    </div>
                    <div className="truncate text-xs text-white/60">
                      {mod.id || "missing-id"} · {mod.slot || "missing-slot"} · ilvl {budget.itemLevel ?? 0}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                No mod drafts match the current filters.
              </div>
            )}
          </div>
        </div>

        {selectedSyncedMod ? <ValidationPanel messages={selectedValidation} noIssuesText="No validation issues for the selected mod." /> : null}

        {selectedSyncedMod ? <BudgetSummaryCard title="Budget Summary" summary={selectedBudget} compact /> : null}
      </div>

      {!selectedSyncedMod && !showBulkCreate ? null : (
        <div className="space-y-6">
          {showBulkCreate ? (
            <div className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bulk Create Mods</h2>
                  <div className="text-xs text-white/50">
                    Paste one title per line. Shared fields below will be copied to every new draft.
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
                <RarityField label="Rarity" value={bulkCreate.rarity} onChange={(value) => updateBulkCreate("rarity", value)} allowBlank />
                <Field
                  label="Required Level"
                  value={bulkCreate.levelRequirement}
                  inputMode="numeric"
                  step={1}
                  onChange={(value) => updateBulkCreate("levelRequirement", clampLevelInput(value))}
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
                <Field label="Icon" value={bulkCreate.icon} onChange={(value) => updateBulkCreate("icon", value)} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Shared Stats</div>
                    <div className="text-xs text-white/50">Up to {MOD_MAX_STATS} stat rows. These values are copied into every created draft.</div>
                  </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={bulkCreate.stats.length >= MOD_MAX_STATS}
                    onClick={() =>
                      setBulkCreate((current) => ({
                        ...current,
                        stats: [...current.stats, { key: "", value: "" }],
                      }))
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
                          onChange={(value) => updateBulkStat(statIndex, (current) => ({ ...current, key: value }))}
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
                              setBulkCreate((current) => ({
                                ...current,
                                stats: current.stats.filter((_, currentIndex) => currentIndex !== statIndex),
                              }))
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
                    <div className="text-xs text-white/50">Up to {MOD_MAX_ABILITIES} abilities. Slot cost applies to every created draft.</div>
                    <div className="text-xs text-white/50">Each ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} of a full stat slot, plus any extra slot cost you enter.</div>
                  </div>
                  <button
                    className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                    disabled={bulkCreate.abilities.length >= MOD_MAX_ABILITIES}
                    onClick={() =>
                      setBulkCreate((current) => ({
                        ...current,
                        abilities: [...current.abilities, createModAbilityDraft()],
                      }))
                    }
                  >
                    Add Ability
                  </button>
                </div>

                {bulkCreate.abilities.length ? (
                  <div className="space-y-3">
                    {bulkCreate.abilities.map((ability, abilityIndex) => (
                      <div key={`bulk-ability-${abilityIndex}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]">
                        <Field
                          label={abilityIndex === 0 ? "Ability ID" : " "}
                          value={ability.id}
                          onChange={(value) => updateBulkAbility(abilityIndex, (current) => ({ ...current, id: value }))}
                        />
                        <Field
                          label={abilityIndex === 0 ? "Extra Slot Cost" : " "}
                          value={ability.budgetCost}
                          inputMode="numeric"
                          step={0.01}
                          onChange={(value) => updateBulkAbility(abilityIndex, (current) => ({ ...current, budgetCost: value }))}
                        />
                        <div className="flex items-end">
                          <button
                            className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                            onClick={() =>
                              setBulkCreate((current) => ({
                                ...current,
                                abilities: current.abilities.filter((_, currentIndex) => currentIndex !== abilityIndex),
                              }))
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

          {!selectedSyncedMod ? null : (
            <>
              <div className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Mod Editor</h2>
                    <div className="text-xs text-white/50">Selected draft #{clampedSelectedIndex + 1}</div>
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
                    label="Mod ID (Auto-generated)"
                    value={selectedSyncedMod.id}
                    readOnly
                    helpText={selectedSyncedMod.id ? "Auto-generated from the previous mod id." : "Will be generated from the previous mod id."}
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
                  <Field label="Icon" value={selectedSyncedMod.icon} onChange={(value) => updateSelected((draft) => ({ ...draft, icon: value }))} />
                </div>

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
                      Fewer stats are valid. Abilities consume slot capacity and lower the live stat caps automatically.
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
                      Up to {MOD_MAX_ABILITIES} abilities. Each ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} of a full stat slot, plus any extra slot cost you enter.
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
                      <div key={`${ability.id || "ability"}-${abilityIndex}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]">
                        <Field
                          label={abilityIndex === 0 ? "Ability ID" : " "}
                          value={ability.id}
                          onChange={(value) => updateSelected((draft) => ({
                            ...draft,
                            abilities: draft.abilities.map((currentAbility, currentIndex) =>
                              currentIndex === abilityIndex ? { ...currentAbility, id: value } : currentAbility,
                            ),
                          }), { autoBalance: true, syncAllStatValuesToMax: true })}
                        />
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
                    ))}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                    No abilities set on this mod.
                  </div>
                )}

                <div className="text-xs text-white/50">
                  Ability rows are authoring-only budget inputs. Exported `Mods.json` still writes only the ability ids array, but every ability now consumes at least {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} slot capacity.
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
                <h2 className="mb-3 text-lg font-semibold">Export Preview</h2>
                <pre className="max-h-[70vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">
                  {JSON.stringify(exportModDraft(selectedSyncedMod), null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
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
        Full single-stat max is currently the required level. Slot profiles scale that max up or down, and each ability consumes {MOD_BASE_ABILITY_SLOT_COST.toFixed(2)} slot capacity before any extra slot cost.
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
