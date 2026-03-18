"use client";

import { ChangeEvent, HTMLAttributes, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { CLASS_RESTRICTION_OPTIONS, MOD_SLOT_OPTIONS, MOD_STAT_DEFAULTS, RARITY_COLOR, RARITY_LABEL } from "@lib/constants";
import {
  BulkModTemplateDraft,
  ModDraft,
  ModStatDraft,
  ValidationMessage,
  createBulkModDrafts,
  createModDraft,
  csvFromList,
  duplicateModDraft,
  exportModDraft,
  exportModsJson,
  listFromCsv,
  listFromLines,
  modFilename,
  normalizeImportedModCollection,
  validateModDrafts,
} from "@lib/authoring";
import { parseLooseJson } from "@lib/json";

type IssueFilter = "all" | "error" | "warning";

type BulkCreateState = {
  titles: string;
  slot: string;
  rarity: string;
  levelRequirement: string;
  itemLevel: string;
  durability: string;
  sellPrice: string;
  classRestriction: string;
  abilities: string;
  icon: string;
  description: string;
};

const EMPTY_BULK_CREATE_STATE: BulkCreateState = {
  titles: "",
  slot: "",
  rarity: "",
  levelRequirement: "",
  itemLevel: "",
  durability: "",
  sellPrice: "",
  classRestriction: "",
  abilities: "",
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
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkCreate, setBulkCreate] = useState<BulkCreateState>(EMPTY_BULK_CREATE_STATE);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (selectedIndex <= mods.length - 1) return;
    setSelectedIndex(Math.max(0, mods.length - 1));
  }, [mods.length, selectedIndex]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, mods.length - 1)));
  const selectedMod = mods[clampedSelectedIndex] ?? null;

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
      .map((mod, index) => ({ mod, index }))
      .filter(({ mod }) => {
        if (!deferredSearch) return true;
        const target = `${mod.id} ${mod.name} ${mod.slot}`.toLowerCase();
        return target.includes(deferredSearch);
      })
      .filter(({ index }) => {
        if (issueFilter === "all") return true;
        const flags = issueFlagsByIndex.get(index);
        return issueFilter === "error" ? !!flags?.error : !!flags?.warning;
      });
  }, [deferredSearch, issueFilter, issueFlagsByIndex, mods]);
  const selectedValidation = useMemo(() => {
    return validation.filter((message) => message.draftIndex === clampedSelectedIndex);
  }, [clampedSelectedIndex, validation]);

  const errorDraftCount = useMemo(() => {
    return Array.from(issueFlagsByIndex.values()).filter((entry) => entry.error).length;
  }, [issueFlagsByIndex]);
  const warningDraftCount = useMemo(() => {
    return Array.from(issueFlagsByIndex.values()).filter((entry) => entry.warning).length;
  }, [issueFlagsByIndex]);
  const statDefaults = useMemo(() => Object.fromEntries(MOD_STAT_DEFAULTS.map((entry) => [entry.key, entry.defaultValue])), []);
  const bulkTitles = useMemo(() => listFromLines(bulkCreate.titles), [bulkCreate.titles]);

  useEffect(() => {
    if (!filteredMods.length) return;
    if (filteredMods.some(({ index }) => index === clampedSelectedIndex)) return;
    setSelectedIndex(filteredMods[0].index);
  }, [clampedSelectedIndex, filteredMods]);

  function setModAt(index: number, next: ModDraft) {
    onChange(mods.map((mod, modIndex) => (modIndex === index ? next : mod)));
  }

  function updateSelected(updater: (draft: ModDraft) => ModDraft) {
    if (!selectedMod) return;
    setModAt(clampedSelectedIndex, updater(selectedMod));
  }

  function updateStat(statIndex: number, updater: (stat: ModStatDraft) => ModStatDraft) {
    updateSelected((draft) => ({
      ...draft,
      stats: draft.stats.map((stat, currentIndex) => (currentIndex === statIndex ? updater(stat) : stat)),
    }));
  }

  function updateBulkCreate<K extends keyof BulkCreateState>(key: K, value: BulkCreateState[K]) {
    setBulkCreate((current) => ({ ...current, [key]: value }));
  }

  function addMod() {
    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const previousId = selectedMod?.id.trim() || existingIds[existingIds.length - 1];
    const newDraft = createModDraft(existingIds, previousId);
    const insertAt = selectedMod ? clampedSelectedIndex + 1 : mods.length;
    const next = [...mods];
    next.splice(insertAt, 0, newDraft);
    onChange(next);
    setSelectedIndex(insertAt);
    setStatus("Created a new mod draft.");
  }

  function duplicateSelectedMod() {
    if (!selectedMod) return;
    const existingIds = mods.map((mod) => mod.id.trim()).filter(Boolean);
    const next = [...mods];
    next.splice(clampedSelectedIndex + 1, 0, duplicateModDraft(selectedMod, existingIds));
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
    const previousId = selectedMod?.id.trim() || existingIds[existingIds.length - 1];
    const template: BulkModTemplateDraft = {
      slot: bulkCreate.slot,
      classRestriction: listFromCsv(bulkCreate.classRestriction),
      levelRequirement: bulkCreate.levelRequirement,
      itemLevel: bulkCreate.itemLevel,
      rarity: bulkCreate.rarity,
      durability: bulkCreate.durability,
      sellPrice: bulkCreate.sellPrice,
      abilities: listFromCsv(bulkCreate.abilities),
      icon: bulkCreate.icon,
      description: bulkCreate.description,
    };

    const created = createBulkModDrafts(bulkTitles, template, existingIds, previousId);
    const insertAt = selectedMod ? clampedSelectedIndex + 1 : mods.length;
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
          onChange(imported);
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
    if (!selectedMod) return;
    downloadJson(exportModDraft(selectedMod), modFilename(selectedMod, clampedSelectedIndex));
    setStatus("Exported the selected mod JSON.");
  }

  function exportAllMods() {
    downloadJson(exportModsJson(mods), "Mods.json");
    setStatus("Exported the full Mods.json draft.");
  }

  async function copyAllModsJson() {
    const didCopy = await copyText(JSON.stringify(exportModsJson(mods), null, 2));
    setStatus(didCopy ? "Copied the full Mods.json payload to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  async function copySelectedJson() {
    if (!selectedMod) return;
    const didCopy = await copyText(JSON.stringify(exportModDraft(selectedMod), null, 2));
    setStatus(didCopy ? "Copied the selected mod JSON to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
      <div className="card h-fit space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Mod Library</h2>
            <div className="text-xs text-white/50">
              {mods.length} draft(s) · {MOD_SLOT_OPTIONS.length} slot(s) · {consoleModCount} console mod seed(s)
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

        <input
          className="input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search mod id, name, or slot"
        />

        <div className="flex flex-wrap gap-2">
          <label className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
            Import Mods.json
            <input className="hidden" type="file" accept=".json,application/json" onChange={importModsJson} />
          </label>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={exportAllMods}>
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
            disabled={issueFilter === "all"}
            onClick={() => setIssueFilter("all")}
          >
            Reset Filter
          </button>
        </div>

        <div className="text-xs text-white/50">
          Errors = invalid values entered into fields. Warnings = blank required fields that still need to be filled.
        </div>

        {status ? <div className="text-sm text-accent">{status}</div> : null}

        <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
          {filteredMods.length ? (
            filteredMods.map(({ mod, index }) => (
              <button
                key={`${mod.id || "mod"}-${index}`}
                className={`w-full rounded border px-3 py-2 text-left transition ${
                  index === clampedSelectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setSelectedIndex(index)}
              >
                <div className="truncate font-medium">{mod.name || "Untitled mod"}</div>
                <div className="truncate text-xs text-white/60">
                  {mod.id || "missing-id"} · {mod.slot || "missing-slot"}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
              No mod drafts match the current search.
            </div>
          )}
        </div>
      </div>

      {!selectedMod && !showBulkCreate ? null : (
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
                  label="Level Requirement"
                  value={bulkCreate.levelRequirement}
                  inputMode="numeric"
                  onChange={(value) => updateBulkCreate("levelRequirement", value)}
                />
                <Field
                  label="Item Level"
                  value={bulkCreate.itemLevel}
                  inputMode="numeric"
                  onChange={(value) => updateBulkCreate("itemLevel", value)}
                />
                <Field
                  label="Durability"
                  value={bulkCreate.durability}
                  inputMode="numeric"
                  onChange={(value) => updateBulkCreate("durability", value)}
                />
                <Field
                  label="Sell Price"
                  value={bulkCreate.sellPrice}
                  inputMode="numeric"
                  onChange={(value) => updateBulkCreate("sellPrice", value)}
                />
                <SelectField
                  label="Class Restriction"
                  value={bulkCreate.classRestriction}
                  options={[
                    { value: "", label: "Select class restriction" },
                    ...CLASS_RESTRICTION_OPTIONS.map((value) => ({ value, label: value })),
                  ]}
                  onChange={(value) => updateBulkCreate("classRestriction", value)}
                />
                <Field
                  label="Abilities (comma separated)"
                  value={bulkCreate.abilities}
                  onChange={(value) => updateBulkCreate("abilities", value)}
                />
                <Field label="Icon" value={bulkCreate.icon} onChange={(value) => updateBulkCreate("icon", value)} />
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
                <button
                  className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  onClick={() => setBulkCreate(EMPTY_BULK_CREATE_STATE)}
                >
                  Clear
                </button>
              </div>

              <div className="text-xs text-white/50">
                Blank shared fields stay blank on the generated mods and will surface as warnings until you fill them in.
              </div>
            </div>
          ) : null}

          {!selectedMod ? null : (
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
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={copySelectedJson}>
                  Copy JSON
                </button>
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={copyAllModsJson}>
                  Copy All Mods JSON
                </button>
                <button className="btn" onClick={exportSelectedMod}>
                  Export Selected
                </button>
                <button className="btn" onClick={exportAllMods}>
                  Export Mods.json
                </button>
                <button className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30" onClick={removeSelectedMod}>
                  Delete
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Mod ID (Auto-generated)"
                value={selectedMod.id}
                readOnly
                helpText={selectedMod.id ? `Auto-generated from the previous mod id.` : `Will be generated from the previous mod id.`}
                onChange={() => {}}
              />
              <Field label="Name" value={selectedMod.name} onChange={(value) => updateSelected((draft) => ({ ...draft, name: value }))} />
              <SelectField
                label="Slot"
                value={selectedMod.slot}
                options={[
                  { value: "", label: "Select slot" },
                  ...MOD_SLOT_OPTIONS.map((slot) => ({ value: slot, label: slot })),
                ]}
                onChange={(value) => updateSelected((draft) => ({ ...draft, slot: value }))}
              />
              <RarityField
                label="Rarity"
                value={selectedMod.rarity}
                onChange={(value) => updateSelected((draft) => ({ ...draft, rarity: value }))}
                allowBlank
              />
              <Field
                label="Level Requirement"
                value={selectedMod.levelRequirement}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, levelRequirement: value }))}
              />
              <Field
                label="Item Level"
                value={selectedMod.itemLevel}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, itemLevel: value }))}
              />
              <Field
                label="Durability"
                value={selectedMod.durability}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, durability: value }))}
              />
              <Field
                label="Sell Price"
                value={selectedMod.sellPrice}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, sellPrice: value }))}
              />
              <SelectField
                label="Class Restriction"
                value={selectedMod.classRestriction[0] ?? ""}
                options={[
                  { value: "", label: "Select class restriction" },
                  ...CLASS_RESTRICTION_OPTIONS.map((value) => ({ value, label: value })),
                ]}
                onChange={(value) =>
                  updateSelected((draft) => ({
                    ...draft,
                    classRestriction: value ? [value] : [],
                  }))
                }
              />
              <Field
                label="Abilities (comma separated)"
                value={csvFromList(selectedMod.abilities)}
                onChange={(value) => updateSelected((draft) => ({ ...draft, abilities: listFromCsv(value) }))}
              />
              <Field
                label="Icon"
                value={selectedMod.icon}
                onChange={(value) => updateSelected((draft) => ({ ...draft, icon: value }))}
              />
            </div>

            <div>
              <div className="label mb-2">Description</div>
              <textarea
                className="input min-h-24"
                value={selectedMod.description}
                onChange={(event) => updateSelected((draft) => ({ ...draft, description: event.target.value }))}
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Stats</h2>
                <div className="text-xs text-white/50">Stats export as a numeric object map when key and value are both valid.</div>
              </div>
              <button
                className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() =>
                  updateSelected((draft) => ({
                    ...draft,
                    stats: [...draft.stats, { key: "", value: "" }],
                  }))
                }
              >
                Add Stat
              </button>
            </div>

            <div className="space-y-3">
              {selectedMod.stats.map((entry, statIndex) => (
                <div key={`${entry.key || "stat"}-${statIndex}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px,auto]">
                  <SelectField
                    label={statIndex === 0 ? "Stat Key" : " "}
                    value={entry.key}
                    options={[
                      { value: "", label: "Select stat" },
                      ...MOD_STAT_DEFAULTS.map((stat) => ({
                        value: stat.key,
                        label: `${stat.key} (${stat.defaultValue})`,
                      })),
                    ]}
                    onChange={(value) =>
                      updateStat(statIndex, (current) => ({
                        ...current,
                        key: value,
                        value: current.value.trim() ? current.value : statDefaults[value] ?? current.value,
                      }))
                    }
                  />
                  <Field
                    label={statIndex === 0 ? "Value" : " "}
                    value={entry.value}
                    inputMode="numeric"
                    onChange={(value) => updateStat(statIndex, (current) => ({ ...current, value }))}
                  />
                  <div className="flex items-end">
                    <button
                      className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                      onClick={() =>
                        updateSelected((draft) => ({
                          ...draft,
                          stats: draft.stats.filter((_, currentIndex) => currentIndex !== statIndex),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="label mb-2">Mod extra JSON (merged at export)</div>
              <textarea
                className="input min-h-32 font-mono text-sm"
                value={selectedMod.extraJson}
                onChange={(event) => updateSelected((draft) => ({ ...draft, extraJson: event.target.value }))}
                placeholder='{"drop_table": "rare_mods"}'
              />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),340px]">
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold">Export Preview</h2>
              <pre className="max-h-[70vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">
                {JSON.stringify(exportModDraft(selectedMod), null, 2)}
              </pre>
            </div>

            <ValidationPanel messages={selectedValidation} noIssuesText="No validation issues for the selected mod." />
          </div>
          </>
        )}
        </div>
      )}
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
  readOnly,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  readOnly?: boolean;
  helpText?: string;
}) {
  return (
    <label>
      <div className="label mb-2">{label.trim() ? label : "\u00a0"}</div>
      <input
        className={`input ${readOnly ? "cursor-default text-white/70" : ""}`}
        value={value}
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
