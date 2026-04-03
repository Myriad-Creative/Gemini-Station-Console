"use client";

import { useEffect, useMemo, useState } from "react";
import { duplicateIdMap, insertAfterIndex, removeAtIndex, setAtIndex } from "@lib/data-tools/common";
import {
  cloneTutorialArea,
  cloneTutorialEntry,
  cloneTutorialGroup,
  createBlankTutorialArea,
  createBlankTutorialEntriesWorkspace,
  createBlankTutorialEntry,
  createBlankTutorialGroup,
  createBlankTutorialTriggersWorkspace,
  importTutorialEntriesWorkspace,
  importTutorialTriggersWorkspace,
  stringifySingleTutorialEntry,
  stringifyTutorialEntriesFile,
  stringifyTutorialTriggersFile,
} from "@lib/data-tools/tutorial";
import type {
  TutorialAreaTriggerDraft,
  TutorialEntriesWorkspace,
  TutorialEntryDraft,
  TutorialTriggerGroupDraft,
  TutorialTriggersWorkspace,
} from "@lib/data-tools/types";
import { copyToClipboard, downloadTextFile, JsonTextArea, Section, StatusBanner, SummaryCard } from "@components/data-tools/shared";

type StatusTone = "neutral" | "success" | "error";
type TutorialTab = "entries" | "triggers";
type TriggerMode = "groups" | "events" | "areas";

function loadSharedText(kind: string) {
  return fetch(`/api/settings/data/source?kind=${kind}`).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.text) return null;
    return payload.text as string;
  });
}

function StringArrayEditor({
  label,
  values,
  placeholder,
  addLabel,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  addLabel: string;
  onChange: (nextValue: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="label">{label}</div>
        <button type="button" className="rounded border border-white/10 px-2 py-1 text-xs text-white/75 hover:bg-white/5" onClick={() => onChange([...values, ""])}>
          {addLabel}
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <input
              className="input"
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))}
            />
            <button type="button" className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10" onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TutorialDataManager() {
  const [entriesWorkspace, setEntriesWorkspace] = useState<TutorialEntriesWorkspace | null>(null);
  const [triggersWorkspace, setTriggersWorkspace] = useState<TutorialTriggersWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<TutorialTab>("entries");
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("groups");
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [selectedTriggerGroupKey, setSelectedTriggerGroupKey] = useState<string | null>(null);
  const [selectedEventGroupKey, setSelectedEventGroupKey] = useState<string | null>(null);
  const [selectedAreaKey, setSelectedAreaKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Loading shared tutorial data from Settings…",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [entriesText, triggersText] = await Promise.all([loadSharedText("tutorialEntries"), loadSharedText("tutorialTriggers")]);
        if (cancelled) return;
        const nextEntries = entriesText ? importTutorialEntriesWorkspace(entriesText, "Shared uploaded data") : createBlankTutorialEntriesWorkspace();
        const nextTriggers = triggersText ? importTutorialTriggersWorkspace(triggersText, "Shared uploaded data") : createBlankTutorialTriggersWorkspace();
        setEntriesWorkspace(nextEntries);
        setTriggersWorkspace(nextTriggers);
        setSelectedEntryKey(nextEntries.entries[0]?.key ?? null);
        setSelectedTriggerGroupKey(nextTriggers.groups[0]?.key ?? null);
        setSelectedEventGroupKey(nextTriggers.eventGroups[0]?.key ?? null);
        setSelectedAreaKey(nextTriggers.areas[0]?.key ?? null);
        setStatus({
          tone: entriesText || triggersText ? "success" : "neutral",
          message:
            entriesText || triggersText
              ? "Loaded tutorial entries and trigger config from the shared uploaded /data workspace."
              : "No shared tutorial data was found. This editor started with blank entry and trigger workspaces.",
        });
      } catch (error) {
        if (cancelled) return;
        setEntriesWorkspace(createBlankTutorialEntriesWorkspace());
        setTriggersWorkspace(createBlankTutorialTriggersWorkspace());
        setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const entryDuplicates = useMemo(() => duplicateIdMap(entriesWorkspace?.entries ?? []), [entriesWorkspace]);
  const entryList = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (entriesWorkspace?.entries ?? []).filter((entry) =>
      query ? [entry.id, entry.title, entry.category, ...entry.tags].join(" ").toLowerCase().includes(query) : true,
    );
  }, [entriesWorkspace, search]);
  const groupDuplicates = useMemo(() => duplicateIdMap(triggersWorkspace?.groups ?? []), [triggersWorkspace]);
  const eventDuplicates = useMemo(() => duplicateIdMap(triggersWorkspace?.eventGroups ?? []), [triggersWorkspace]);
  const areaDuplicates = useMemo(() => duplicateIdMap(triggersWorkspace?.areas ?? []), [triggersWorkspace]);

  useEffect(() => {
    if (!entriesWorkspace?.entries.length) return;
    if (!selectedEntryKey || !entriesWorkspace.entries.some((entry) => entry.key === selectedEntryKey)) setSelectedEntryKey(entriesWorkspace.entries[0].key);
  }, [entriesWorkspace, selectedEntryKey]);

  useEffect(() => {
    if (!triggersWorkspace) return;
    if (triggersWorkspace.groups.length && (!selectedTriggerGroupKey || !triggersWorkspace.groups.some((group) => group.key === selectedTriggerGroupKey))) {
      setSelectedTriggerGroupKey(triggersWorkspace.groups[0].key);
    }
    if (triggersWorkspace.eventGroups.length && (!selectedEventGroupKey || !triggersWorkspace.eventGroups.some((group) => group.key === selectedEventGroupKey))) {
      setSelectedEventGroupKey(triggersWorkspace.eventGroups[0].key);
    }
    if (triggersWorkspace.areas.length && (!selectedAreaKey || !triggersWorkspace.areas.some((area) => area.key === selectedAreaKey))) {
      setSelectedAreaKey(triggersWorkspace.areas[0].key);
    }
  }, [selectedAreaKey, selectedEventGroupKey, selectedTriggerGroupKey, triggersWorkspace]);

  const selectedEntry = entriesWorkspace?.entries.find((entry) => entry.key === selectedEntryKey) ?? entryList[0] ?? null;
  const selectedGroup = triggersWorkspace?.groups.find((group) => group.key === selectedTriggerGroupKey) ?? triggersWorkspace?.groups[0] ?? null;
  const selectedEventGroup = triggersWorkspace?.eventGroups.find((group) => group.key === selectedEventGroupKey) ?? triggersWorkspace?.eventGroups[0] ?? null;
  const selectedArea = triggersWorkspace?.areas.find((area) => area.key === selectedAreaKey) ?? triggersWorkspace?.areas[0] ?? null;

  function updateEntry(nextEntry: TutorialEntryDraft) {
    if (!entriesWorkspace || !selectedEntry) return;
    const index = entriesWorkspace.entries.findIndex((entry) => entry.key === selectedEntry.key);
    if (index < 0) return;
    setEntriesWorkspace({ ...entriesWorkspace, entries: setAtIndex(entriesWorkspace.entries, index, nextEntry) });
  }

  function updateTriggerGroup(kind: "groups" | "events", nextGroup: TutorialTriggerGroupDraft) {
    if (!triggersWorkspace) return;
    const collection = kind === "groups" ? triggersWorkspace.groups : triggersWorkspace.eventGroups;
    const selected = kind === "groups" ? selectedGroup : selectedEventGroup;
    if (!selected) return;
    const index = collection.findIndex((group) => group.key === selected.key);
    if (index < 0) return;
    const nextCollection = setAtIndex(collection, index, nextGroup);
    setTriggersWorkspace({
      ...triggersWorkspace,
      [kind === "groups" ? "groups" : "eventGroups"]: nextCollection,
    });
  }

  function updateArea(nextArea: TutorialAreaTriggerDraft) {
    if (!triggersWorkspace || !selectedArea) return;
    const index = triggersWorkspace.areas.findIndex((area) => area.key === selectedArea.key);
    if (index < 0) return;
    setTriggersWorkspace({ ...triggersWorkspace, areas: setAtIndex(triggersWorkspace.areas, index, nextArea) });
  }

  async function handleCopy(kind: "entries" | "triggers" | "currentEntry") {
    const value =
      kind === "entries"
        ? entriesWorkspace
          ? stringifyTutorialEntriesFile(entriesWorkspace)
          : ""
        : kind === "triggers"
          ? triggersWorkspace
            ? stringifyTutorialTriggersFile(triggersWorkspace)
            : ""
          : selectedEntry
            ? stringifySingleTutorialEntry(selectedEntry)
            : "";
    if (!value) return;
    await copyToClipboard(value);
    setStatus({
      tone: "success",
      message:
        kind === "currentEntry"
          ? "Copied the current tutorial entry JSON."
          : `Copied ${kind === "entries" ? "info_entries.json" : "info_triggers.json"} to the clipboard.`,
    });
  }

  function handleDownload(kind: "entries" | "triggers") {
    const filename = kind === "entries" ? "info_entries.json" : "info_triggers.json";
    const contents =
      kind === "entries"
        ? entriesWorkspace
          ? stringifyTutorialEntriesFile(entriesWorkspace)
          : ""
        : triggersWorkspace
          ? stringifyTutorialTriggersFile(triggersWorkspace)
          : "";
    if (!contents) return;
    downloadTextFile(filename, contents);
    setStatus({ tone: "success", message: `Downloaded ${filename}.` });
  }

  function addTriggerItem(kind: TriggerMode) {
    if (!triggersWorkspace) return;
    if (kind === "groups") {
      const next = createBlankTutorialGroup(triggersWorkspace.groups.map((group) => group.id));
      const index = selectedGroup ? triggersWorkspace.groups.findIndex((group) => group.key === selectedGroup.key) : null;
      setTriggersWorkspace({ ...triggersWorkspace, groups: insertAfterIndex(triggersWorkspace.groups, index, next) });
      setSelectedTriggerGroupKey(next.key);
      return;
    }
    if (kind === "events") {
      const next = createBlankTutorialGroup(triggersWorkspace.eventGroups.map((group) => group.id));
      const index = selectedEventGroup ? triggersWorkspace.eventGroups.findIndex((group) => group.key === selectedEventGroup.key) : null;
      setTriggersWorkspace({ ...triggersWorkspace, eventGroups: insertAfterIndex(triggersWorkspace.eventGroups, index, next) });
      setSelectedEventGroupKey(next.key);
      return;
    }
    const next = createBlankTutorialArea(triggersWorkspace.areas.map((area) => area.id));
    const index = selectedArea ? triggersWorkspace.areas.findIndex((area) => area.key === selectedArea.key) : null;
    setTriggersWorkspace({ ...triggersWorkspace, areas: insertAfterIndex(triggersWorkspace.areas, index, next) });
    setSelectedAreaKey(next.key);
  }

  function cloneTriggerItem(kind: TriggerMode) {
    if (!triggersWorkspace) return;
    if (kind === "groups" && selectedGroup) {
      const next = cloneTutorialGroup(selectedGroup, triggersWorkspace.groups.map((group) => group.id));
      const index = triggersWorkspace.groups.findIndex((group) => group.key === selectedGroup.key);
      setTriggersWorkspace({ ...triggersWorkspace, groups: insertAfterIndex(triggersWorkspace.groups, index, next) });
      setSelectedTriggerGroupKey(next.key);
      return;
    }
    if (kind === "events" && selectedEventGroup) {
      const next = cloneTutorialGroup(selectedEventGroup, triggersWorkspace.eventGroups.map((group) => group.id));
      const index = triggersWorkspace.eventGroups.findIndex((group) => group.key === selectedEventGroup.key);
      setTriggersWorkspace({ ...triggersWorkspace, eventGroups: insertAfterIndex(triggersWorkspace.eventGroups, index, next) });
      setSelectedEventGroupKey(next.key);
      return;
    }
    if (kind === "areas" && selectedArea) {
      const next = cloneTutorialArea(selectedArea, triggersWorkspace.areas.map((area) => area.id));
      const index = triggersWorkspace.areas.findIndex((area) => area.key === selectedArea.key);
      setTriggersWorkspace({ ...triggersWorkspace, areas: insertAfterIndex(triggersWorkspace.areas, index, next) });
      setSelectedAreaKey(next.key);
    }
  }

  function deleteTriggerItem(kind: TriggerMode) {
    if (!triggersWorkspace) return;
    if (kind === "groups" && selectedGroup) {
      const index = triggersWorkspace.groups.findIndex((group) => group.key === selectedGroup.key);
      if (index < 0) return;
      const next = removeAtIndex(triggersWorkspace.groups, index);
      setTriggersWorkspace({ ...triggersWorkspace, groups: next });
      setSelectedTriggerGroupKey(next[0]?.key ?? null);
      return;
    }
    if (kind === "events" && selectedEventGroup) {
      const index = triggersWorkspace.eventGroups.findIndex((group) => group.key === selectedEventGroup.key);
      if (index < 0) return;
      const next = removeAtIndex(triggersWorkspace.eventGroups, index);
      setTriggersWorkspace({ ...triggersWorkspace, eventGroups: next });
      setSelectedEventGroupKey(next[0]?.key ?? null);
      return;
    }
    if (kind === "areas" && selectedArea) {
      const index = triggersWorkspace.areas.findIndex((area) => area.key === selectedArea.key);
      if (index < 0) return;
      const next = removeAtIndex(triggersWorkspace.areas, index);
      setTriggersWorkspace({ ...triggersWorkspace, areas: next });
      setSelectedAreaKey(next[0]?.key ?? null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Tutorial</h1>
        <p className="max-w-4xl text-white/65">
          Manage tutorial codex entries and their trigger mappings from the shared uploaded <code>/data</code> workspace.
        </p>
      </div>

      <StatusBanner tone={status.tone} message={status.message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Entries" value={entriesWorkspace?.entries.length ?? 0} />
        <SummaryCard label="Trigger Groups" value={triggersWorkspace?.groups.length ?? 0} />
        <SummaryCard label="Event Groups" value={triggersWorkspace?.eventGroups.length ?? 0} />
        <SummaryCard label="Areas" value={triggersWorkspace?.areas.length ?? 0} />
      </div>

      <div className="flex flex-wrap gap-3">
        {([
          ["entries", "Info Entries"],
          ["triggers", "Info Triggers"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${activeTab === tab ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "entries" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Section title="Tutorial Entry Library" description="Search, create, clone, delete, and export tutorial entries.">
            <div className="space-y-2">
              <div className="label">Search</div>
              <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by id, title, category, or tag" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn justify-center"
                onClick={() => {
                  if (!entriesWorkspace) return;
                  const next = createBlankTutorialEntry(entriesWorkspace.entries.map((entry) => entry.id));
                  const index = selectedEntry ? entriesWorkspace.entries.findIndex((entry) => entry.key === selectedEntry.key) : null;
                  setEntriesWorkspace({ ...entriesWorkspace, entries: insertAfterIndex(entriesWorkspace.entries, index, next) });
                  setSelectedEntryKey(next.key);
                }}
              >
                New
              </button>
              <button
                type="button"
                className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
                onClick={() => {
                  if (!entriesWorkspace || !selectedEntry) return;
                  const next = cloneTutorialEntry(selectedEntry, entriesWorkspace.entries.map((entry) => entry.id));
                  const index = entriesWorkspace.entries.findIndex((entry) => entry.key === selectedEntry.key);
                  setEntriesWorkspace({ ...entriesWorkspace, entries: insertAfterIndex(entriesWorkspace.entries, index, next) });
                  setSelectedEntryKey(next.key);
                }}
              >
                Clone
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("currentEntry")}>
                Copy Current
              </button>
              <button
                type="button"
                className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20"
                onClick={() => {
                  if (!entriesWorkspace || !selectedEntry) return;
                  const index = entriesWorkspace.entries.findIndex((entry) => entry.key === selectedEntry.key);
                  if (index < 0) return;
                  const next = removeAtIndex(entriesWorkspace.entries, index);
                  setEntriesWorkspace({ ...entriesWorkspace, entries: next.length ? next : [createBlankTutorialEntry()] });
                  setSelectedEntryKey(next[0]?.key ?? null);
                }}
              >
                Delete
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("entries")}>
                Copy info_entries.json
              </button>
              <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => handleDownload("entries")}>
                Download info_entries.json
              </button>
            </div>

            <div className="space-y-2">
              {entryList.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left ${entry.key === selectedEntryKey ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                  onClick={() => setSelectedEntryKey(entry.key)}
                >
                  <div className="font-medium text-white">{entry.id || "Untitled"}</div>
                  <div className="text-sm text-white/55">{entry.title || "No title yet"}</div>
                </button>
              ))}
            </div>
          </Section>

          {selectedEntry ? (
            <Section title="Tutorial Entry Editor" description="Edit the entry shown by the in-game codex and tutorial prompt system.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="label">Entry ID</div>
                  <input className="input" value={selectedEntry.id} onChange={(event) => updateEntry({ ...selectedEntry, id: event.target.value })} />
                </div>
                <div>
                  <div className="label">Title</div>
                  <input className="input" value={selectedEntry.title} onChange={(event) => updateEntry({ ...selectedEntry, title: event.target.value })} />
                </div>
                <div>
                  <div className="label">Image</div>
                  <input className="input" value={selectedEntry.image} onChange={(event) => updateEntry({ ...selectedEntry, image: event.target.value })} />
                </div>
                <div>
                  <div className="label">Category</div>
                  <input className="input" value={selectedEntry.category} onChange={(event) => updateEntry({ ...selectedEntry, category: event.target.value })} />
                </div>
                <div>
                  <div className="label">Order</div>
                  <input className="input" value={selectedEntry.order} onChange={(event) => updateEntry({ ...selectedEntry, order: event.target.value })} />
                </div>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                  <span>Show Once</span>
                  <input type="checkbox" checked={selectedEntry.showOnce} onChange={(event) => updateEntry({ ...selectedEntry, showOnce: event.target.checked })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                  <span>Pause Game</span>
                  <input type="checkbox" checked={selectedEntry.pauseGame} onChange={(event) => updateEntry({ ...selectedEntry, pauseGame: event.target.checked })} />
                </label>
              </div>

              {entryDuplicates.has(selectedEntry.id.trim()) ? (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This tutorial entry ID is duplicated in the current workspace.</div>
              ) : null}

              <div className="space-y-2">
                <div className="label">Body</div>
                <textarea className="input min-h-[200px]" value={selectedEntry.body} onChange={(event) => updateEntry({ ...selectedEntry, body: event.target.value })} />
              </div>
              <StringArrayEditor label="Tags" values={selectedEntry.tags} placeholder="tag" addLabel="Add Tag" onChange={(nextValue) => updateEntry({ ...selectedEntry, tags: nextValue })} />
              <JsonTextArea label="Extra JSON" value={selectedEntry.extraJson} onChange={(nextValue) => updateEntry({ ...selectedEntry, extraJson: nextValue })} />
            </Section>
          ) : null}
        </div>
      ) : triggersWorkspace ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {([
              ["groups", "Root Trigger Groups"],
              ["events", "Event Trigger Groups"],
              ["areas", "Area Triggers"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`rounded-full border px-4 py-2 text-sm ${triggerMode === mode ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
                onClick={() => setTriggerMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Section title="Trigger Library" description="Create, clone, delete, and export root groups, event groups, and area triggers.">
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn justify-center" onClick={() => addTriggerItem(triggerMode)}>
                  New
                </button>
                <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => cloneTriggerItem(triggerMode)}>
                  Clone
                </button>
                <button type="button" className="rounded bg-red-500/15 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20" onClick={() => deleteTriggerItem(triggerMode)}>
                  Delete
                </button>
                <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => void handleCopy("triggers")}>
                  Copy info_triggers.json
                </button>
                <button type="button" className="rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 sm:col-span-2" onClick={() => handleDownload("triggers")}>
                  Download info_triggers.json
                </button>
              </div>

              <div className="space-y-2">
                {(triggerMode === "groups" ? triggersWorkspace.groups : triggerMode === "events" ? triggersWorkspace.eventGroups : triggersWorkspace.areas).map((entry) => {
                  const key = entry.key;
                  const active = triggerMode === "groups" ? key === selectedTriggerGroupKey : triggerMode === "events" ? key === selectedEventGroupKey : key === selectedAreaKey;
                  const duplicateMap = triggerMode === "groups" ? groupDuplicates : triggerMode === "events" ? eventDuplicates : areaDuplicates;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left ${active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                      onClick={() =>
                        triggerMode === "groups"
                          ? setSelectedTriggerGroupKey(key)
                          : triggerMode === "events"
                            ? setSelectedEventGroupKey(key)
                            : setSelectedAreaKey(key)
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{entry.id || "Untitled"}</div>
                          <div className="text-sm text-white/55">
                            {"infoIds" in entry ? `${entry.infoIds.length} linked entries` : "Area trigger"}
                          </div>
                        </div>
                        {duplicateMap.has(entry.id.trim()) ? <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-100">Duplicate ID</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            {triggerMode !== "areas" && (triggerMode === "groups" ? selectedGroup : selectedEventGroup) ? (
              <Section title={triggerMode === "groups" ? "Root Trigger Group Editor" : "Event Trigger Group Editor"} description="These groups map trigger ids to tutorial entry ids.">
                <div>
                  <div className="label">Trigger ID</div>
                  <input
                    className="input"
                    value={(triggerMode === "groups" ? selectedGroup : selectedEventGroup)!.id}
                    onChange={(event) =>
                      updateTriggerGroup(triggerMode === "groups" ? "groups" : "events", {
                        ...(triggerMode === "groups" ? selectedGroup : selectedEventGroup)!,
                        id: event.target.value,
                      })
                    }
                  />
                </div>

                {(triggerMode === "groups" ? groupDuplicates : eventDuplicates).has((triggerMode === "groups" ? selectedGroup : selectedEventGroup)!.id.trim()) ? (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This trigger group ID is duplicated in the current workspace.</div>
                ) : null}

                <StringArrayEditor
                  label="Info Entry IDs"
                  values={(triggerMode === "groups" ? selectedGroup : selectedEventGroup)!.infoIds}
                  placeholder="tutorial_entry_id"
                  addLabel="Add Entry"
                  onChange={(nextValue) =>
                    updateTriggerGroup(triggerMode === "groups" ? "groups" : "events", {
                      ...(triggerMode === "groups" ? selectedGroup : selectedEventGroup)!,
                      infoIds: nextValue,
                    })
                  }
                />
              </Section>
            ) : null}

            {triggerMode === "areas" && selectedArea ? (
              <Section title="Area Trigger Editor" description="Edit positional area-based tutorial triggers.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label">Area Trigger ID</div>
                    <input className="input" value={selectedArea.id} onChange={(event) => updateArea({ ...selectedArea, id: event.target.value })} />
                  </div>
                  <div>
                    <div className="label">Radius</div>
                    <input className="input" value={selectedArea.radius} onChange={(event) => updateArea({ ...selectedArea, radius: event.target.value })} />
                  </div>
                  <div>
                    <div className="label">Position X</div>
                    <input className="input" value={selectedArea.positionX} onChange={(event) => updateArea({ ...selectedArea, positionX: event.target.value })} />
                  </div>
                  <div>
                    <div className="label">Position Y</div>
                    <input className="input" value={selectedArea.positionY} onChange={(event) => updateArea({ ...selectedArea, positionY: event.target.value })} />
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                    <span>Once</span>
                    <input type="checkbox" checked={selectedArea.once} onChange={(event) => updateArea({ ...selectedArea, once: event.target.checked })} />
                  </label>
                </div>

                {areaDuplicates.has(selectedArea.id.trim()) ? (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">This area trigger ID is duplicated in the current workspace.</div>
                ) : null}

                <StringArrayEditor label="Info Entry IDs" values={selectedArea.infoIds} placeholder="tutorial_entry_id" addLabel="Add Entry" onChange={(nextValue) => updateArea({ ...selectedArea, infoIds: nextValue })} />
                <JsonTextArea label="Extra JSON" value={selectedArea.extraJson} onChange={(nextValue) => updateArea({ ...selectedArea, extraJson: nextValue })} />
              </Section>
            ) : null}
          </div>

          <Section title="Trigger Root Extra JSON" description="Preserve extra top-level keys on info_triggers.json outside groups, events, and areas.">
            <JsonTextArea label="Extra JSON" value={triggersWorkspace.extraJson} onChange={(nextValue) => setTriggersWorkspace({ ...triggersWorkspace, extraJson: nextValue })} />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
