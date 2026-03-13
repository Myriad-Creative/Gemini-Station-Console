"use client";

import { ChangeEvent, HTMLAttributes, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ModDraft,
  ModStatDraft,
  ValidationMessage,
  createModDraft,
  csvFromList,
  duplicateModDraft,
  exportModDraft,
  exportModsJson,
  listFromCsv,
  modFilename,
  normalizeImportedModCollection,
  validateModDrafts,
} from "@lib/authoring";

export default function ModWorkshop({
  mods,
  onChange,
  slotOptions,
  consoleModCount,
}: {
  mods: ModDraft[];
  onChange: (next: ModDraft[]) => void;
  slotOptions: string[];
  consoleModCount: number;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (selectedIndex <= mods.length - 1) return;
    setSelectedIndex(Math.max(0, mods.length - 1));
  }, [mods.length, selectedIndex]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, mods.length - 1)));
  const selectedMod = mods[clampedSelectedIndex] ?? null;

  const validation = useMemo(() => validateModDrafts(mods), [mods]);
  const filteredMods = useMemo(() => {
    return mods
      .map((mod, index) => ({ mod, index }))
      .filter(({ mod }) => {
        if (!deferredSearch) return true;
        const target = `${mod.id} ${mod.name} ${mod.slot}`.toLowerCase();
        return target.includes(deferredSearch);
      });
  }, [deferredSearch, mods]);
  const selectedValidation = useMemo(() => {
    return validation.filter((message) => message.draftIndex === clampedSelectedIndex);
  }, [clampedSelectedIndex, validation]);

  const errorCount = validation.filter((message) => message.level === "error").length;
  const warningCount = validation.length - errorCount;

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

  async function importModsJson(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
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
              {mods.length} draft(s) · {slotOptions.length} known slot(s) · {consoleModCount} console mod seed(s)
            </div>
          </div>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={addMod}>
            New
          </button>
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
          <div className="rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-100">
            <div className="label text-red-100/80">Errors</div>
            <div className="mt-1 text-lg font-semibold">{errorCount}</div>
          </div>
          <div className="rounded border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-yellow-100">
            <div className="label text-yellow-100/80">Warnings</div>
            <div className="mt-1 text-lg font-semibold">{warningCount}</div>
          </div>
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

      {!selectedMod ? null : (
        <div className="space-y-6">
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
              <Field
                label="Slot"
                value={selectedMod.slot}
                datalistId="mod-slot-options"
                onChange={(value) => updateSelected((draft) => ({ ...draft, slot: value }))}
              />
              <Field
                label="Rarity"
                value={selectedMod.rarity}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, rarity: value }))}
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
              <Field
                label="Class Restrictions (comma separated)"
                value={csvFromList(selectedMod.classRestriction)}
                onChange={(value) => updateSelected((draft) => ({ ...draft, classRestriction: listFromCsv(value) }))}
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

            <datalist id="mod-slot-options">
              {slotOptions.map((slot) => (
                <option key={slot} value={slot} />
              ))}
            </datalist>

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
                  <Field
                    label={statIndex === 0 ? "Stat Key" : " "}
                    value={entry.key}
                    onChange={(value) => updateStat(statIndex, (current) => ({ ...current, key: value }))}
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
  datalistId,
  inputMode,
  readOnly,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  datalistId?: string;
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
        list={datalistId}
        inputMode={inputMode}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
      {helpText ? <div className="mt-1 text-xs text-white/50">{helpText}</div> : null}
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
