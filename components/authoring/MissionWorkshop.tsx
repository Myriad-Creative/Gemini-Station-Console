"use client";

import type { InputHTMLAttributes } from "react";
import { KeyboardEvent, useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import type { ValidationMessage } from "@lib/authoring";
import type { NormalizedMission } from "@lib/mission-lab/types";
import {
  MISSION_MODES,
  MISSION_OBJECTIVE_TYPES,
  MISSION_PREREQUISITE_STATES,
  MissionConversationBeatDraft,
  MissionConversationDraft,
  MissionConversationResponseDraft,
  MissionDraft,
  MissionObjectiveDraft,
  MissionPrerequisiteDraft,
  MissionStepDraft,
  createMissionConversationBeatDraft,
  createMissionConversationDraft,
  createMissionConversationResponseDraft,
  createMissionDraft,
  createMissionObjectiveDraft,
  createMissionStepDraft,
  duplicateMissionConversationDraft,
  duplicateMissionDraft,
  duplicateMissionObjectiveDraft,
  duplicateMissionStepDraft,
  exportMissionDraft,
  missionFilename,
  validateMissionDrafts,
} from "@lib/mission-authoring";
import type { Item, Mob, Mod } from "@lib/types";

const FILTER_ALL = "__all__";

const MODE_LABELS: Record<string, string> = {
  single: "Single",
  sequential: "Sequential",
  all: "All",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  talk: "Talk",
  scan: "Scan",
  collect: "Collect",
  kill: "Kill",
  sell: "Sell",
  buy: "Buy",
  travel: "Travel",
  explore: "Explore",
  hail: "Hail",
  repair: "Repair",
};

type LookupOption = {
  id: string;
  label: string;
  meta?: string;
};

export default function MissionWorkshop({
  missions,
  onChange,
  knownMissionIds,
  consoleMissionCount,
  referenceMissions = [],
}: {
  missions: MissionDraft[];
  onChange: (next: MissionDraft[]) => void;
  knownMissionIds: string[];
  consoleMissionCount: number;
  referenceMissions?: NormalizedMission[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState(FILTER_ALL);
  const [levelFilter, setLevelFilter] = useState(FILTER_ALL);
  const [arcFilter, setArcFilter] = useState(FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(FILTER_ALL);
  const [modeFilter, setModeFilter] = useState(FILTER_ALL);
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [mobs, setMobs] = useState<Mob[]>([]);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (selectedIndex <= missions.length - 1) return;
    setSelectedIndex(Math.max(0, missions.length - 1));
  }, [missions.length, selectedIndex]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      try {
        const [itemsResponse, modsResponse, mobsResponse] = await Promise.all([
          fetch("/api/items"),
          fetch("/api/mods"),
          fetch("/api/mobs"),
        ]);

        const itemsJson = await itemsResponse.json().catch(() => ({ data: [] }));
        const modsJson = await modsResponse.json().catch(() => ({ data: [] }));
        const mobsJson = await mobsResponse.json().catch(() => ({ data: [] }));
        if (cancelled) return;

        setItems(Array.isArray(itemsJson.data) ? itemsJson.data : []);
        setMods(Array.isArray(modsJson.data) ? modsJson.data : []);
        setMobs(Array.isArray(mobsJson.data) ? mobsJson.data : []);
      } catch {
        if (cancelled) return;
        setItems([]);
        setMods([]);
        setMobs([]);
      }
    }

    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const itemOptions = useMemo(() => items.map((item) => itemToLookupOption(item)), [items]);
  const modOptions = useMemo(() => mods.map((mod) => modToLookupOption(mod)), [mods]);
  const mobOptions = useMemo(() => mobs.map((mob) => mobToLookupOption(mob)), [mobs]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, missions.length - 1)));
  const selectedMission = missions[clampedSelectedIndex] ?? null;

  const validation = useMemo(() => validateMissionDrafts(missions, knownMissionIds), [knownMissionIds, missions]);
  const selectedValidation = useMemo(
    () => validation.filter((message) => message.draftIndex === clampedSelectedIndex),
    [clampedSelectedIndex, validation],
  );

  const factionOptions = useMemo(
    () => buildSortedOptions([...missions.map((mission) => mission.faction), ...referenceMissions.map((mission) => mission.faction ?? "")]),
    [missions, referenceMissions],
  );
  const levelOptions = useMemo(
    () =>
      buildSortedOptions([
        ...missions.map((mission) => mission.level),
        ...referenceMissions.map((mission) => (mission.level == null ? "" : String(mission.level))),
      ]),
    [missions, referenceMissions],
  );
  const arcOptions = useMemo(
    () => buildSortedOptions([...missions.flatMap((mission) => mission.arcs), ...referenceMissions.flatMap((mission) => mission.arcs)]),
    [missions, referenceMissions],
  );
  const tagOptions = useMemo(
    () => buildSortedOptions([...missions.flatMap((mission) => mission.tags), ...referenceMissions.flatMap((mission) => mission.tags)]),
    [missions, referenceMissions],
  );
  const modeOptions = useMemo(
    () =>
      buildSortedOptions([
        ...missions.flatMap((mission) => mission.steps.map((step) => step.mode)),
        ...referenceMissions.map((mission) => mission.primaryMode ?? ""),
      ]),
    [missions, referenceMissions],
  );
  const missionClassOptions = useMemo(
    () => buildSortedOptions([...missions.map((mission) => mission.missionClass), ...referenceMissions.map((mission) => mission.class ?? "")]),
    [missions, referenceMissions],
  );
  const conversationIdOptions = useMemo(
    () => buildSortedOptions(selectedMission?.conversations.map((conversation) => conversation.id) ?? []),
    [selectedMission],
  );

  const filteredMissions = useMemo(() => {
    return missions
      .map((mission, index) => ({ mission, index }))
      .filter(({ mission }) => {
        const modes = mission.steps.map((step) => step.mode.trim().toLowerCase()).filter(Boolean);
        const target = [
          mission.id,
          mission.title,
          mission.faction,
          mission.missionClass,
          mission.meta.author,
          mission.meta.notes,
          mission.description,
          mission.descriptionComplete,
          mission.giver_id,
          mission.turn_in_to,
          mission.arcs.join(" "),
          mission.tags.join(" "),
          modes.join(" "),
        ]
          .join(" ")
          .toLowerCase();

        if (deferredSearch && !target.includes(deferredSearch)) return false;
        if (factionFilter !== FILTER_ALL && mission.faction.trim() !== factionFilter) return false;
        if (levelFilter !== FILTER_ALL && mission.level.trim() !== levelFilter) return false;
        if (arcFilter !== FILTER_ALL && !mission.arcs.includes(arcFilter)) return false;
        if (tagFilter !== FILTER_ALL && !mission.tags.includes(tagFilter)) return false;
        if (modeFilter !== FILTER_ALL && !modes.includes(modeFilter)) return false;
        return true;
      });
  }, [arcFilter, deferredSearch, factionFilter, levelFilter, missions, modeFilter, tagFilter]);

  const errorCount = validation.filter((message) => message.level === "error").length;
  const warningCount = validation.length - errorCount;
  const hasActiveFilters =
    factionFilter !== FILTER_ALL ||
    levelFilter !== FILTER_ALL ||
    arcFilter !== FILTER_ALL ||
    tagFilter !== FILTER_ALL ||
    modeFilter !== FILTER_ALL;

  const exportedJson = useMemo(
    () => (selectedMission ? JSON.stringify(exportMissionDraft(selectedMission), null, 2) : ""),
    [selectedMission],
  );

  function setMissionAt(index: number, next: MissionDraft) {
    onChange(missions.map((mission, missionIndex) => (missionIndex === index ? next : mission)));
  }

  function updateSelected(updater: (draft: MissionDraft) => MissionDraft) {
    if (!selectedMission) return;
    setMissionAt(clampedSelectedIndex, updater(selectedMission));
  }

  function updateStep(stepIndex: number, updater: (step: MissionStepDraft) => MissionStepDraft) {
    updateSelected((draft) => ({
      ...draft,
      steps: draft.steps.map((step, index) => (index === stepIndex ? updater(step) : step)),
    }));
  }

  function updateObjective(
    stepIndex: number,
    objectiveIndex: number,
    updater: (objective: MissionObjectiveDraft) => MissionObjectiveDraft,
  ) {
    updateStep(stepIndex, (step) => ({
      ...step,
      objectives: step.objectives.map((objective, index) => (index === objectiveIndex ? updater(objective) : objective)),
    }));
  }

  function updateConversation(
    conversationIndex: number,
    updater: (conversation: MissionConversationDraft) => MissionConversationDraft,
  ) {
    updateSelected((draft) => ({
      ...draft,
      conversations: draft.conversations.map((conversation, index) =>
        index === conversationIndex ? updater(conversation) : conversation,
      ),
    }));
  }

  function updateBeat(
    conversationIndex: number,
    beatIndex: number,
    updater: (beat: MissionConversationBeatDraft) => MissionConversationBeatDraft,
  ) {
    updateConversation(conversationIndex, (conversation) => ({
      ...conversation,
      beats: conversation.beats.map((beat, index) => (index === beatIndex ? updater(beat) : beat)),
    }));
  }

  function updateResponse(
    conversationIndex: number,
    beatIndex: number,
    responseIndex: number,
    updater: (response: MissionConversationResponseDraft) => MissionConversationResponseDraft,
  ) {
    updateBeat(conversationIndex, beatIndex, (beat) => ({
      ...beat,
      responses: beat.responses.map((response, index) => (index === responseIndex ? updater(response) : response)),
    }));
  }

  function addMission() {
    const next = [...missions, createMissionDraft()];
    onChange(next);
    setSelectedIndex(next.length - 1);
    setStatus("Created a new mission draft.");
  }

  function duplicateSelectedMission() {
    if (!selectedMission) return;
    const next = [...missions];
    next.splice(clampedSelectedIndex + 1, 0, duplicateMissionDraft(selectedMission));
    onChange(next);
    setSelectedIndex(clampedSelectedIndex + 1);
    setStatus("Duplicated the selected mission draft.");
  }

  function removeSelectedMission() {
    const next = missions.filter((_, index) => index !== clampedSelectedIndex);
    onChange(next.length ? next : [createMissionDraft()]);
    setSelectedIndex(Math.max(0, clampedSelectedIndex - 1));
    setStatus("Deleted the selected mission draft.");
  }

  async function copySelectedJson() {
    if (!selectedMission) return;
    const copied = await copyText(exportedJson);
    setStatus(copied ? "Copied the selected mission JSON to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  function saveSelectedJson() {
    if (!selectedMission) return;
    downloadJson(exportMissionDraft(selectedMission), missionFilename(selectedMission, clampedSelectedIndex));
    setStatus("Saved the selected mission JSON file.");
  }

  function resetFilters() {
    setFactionFilter(FILTER_ALL);
    setLevelFilter(FILTER_ALL);
    setArcFilter(FILTER_ALL);
    setTagFilter(FILTER_ALL);
    setModeFilter(FILTER_ALL);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="card h-fit space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Mission Library</h2>
            <div className="text-xs text-white/50">
              {missions.length} draft(s) · {filteredMissions.length} shown · {consoleMissionCount} shared mission id(s) available for prerequisites
            </div>
          </div>

          <button className="btn w-full justify-center" onClick={addMission}>
            New Mission
          </button>

          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mission id, title, faction, arc, tag, or notes"
          />

          <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Filters</div>
              <button
                className="text-xs text-white/60 transition hover:text-white disabled:cursor-default disabled:opacity-40"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                Reset
              </button>
            </div>
            <div className="grid gap-3">
              <SelectField label="Faction" value={factionFilter} options={factionOptions} onChange={setFactionFilter} allLabel="All factions" />
              <SelectField label="Level" value={levelFilter} options={levelOptions} onChange={setLevelFilter} allLabel="All levels" />
              <SelectField label="Arc" value={arcFilter} options={arcOptions} onChange={setArcFilter} allLabel="All arcs" />
              <SelectField label="Tag" value={tagFilter} options={tagOptions} onChange={setTagFilter} allLabel="All tags" />
              <SelectField label="Mode" value={modeFilter} options={modeOptions} onChange={setModeFilter} allLabel="All modes" />
            </div>
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

          <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
            {filteredMissions.length ? (
              filteredMissions.map(({ mission, index }) => {
                const firstMode = mission.steps[0]?.mode.trim().toLowerCase() || "single";
                return (
                  <button
                    key={`${mission.id || "mission"}-${index}`}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      index === clampedSelectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <div className="truncate font-medium">{mission.title || "Untitled mission"}</div>
                    <div className="truncate text-xs text-white/60">{mission.id || "missing-id"}</div>
                    <div className="mt-1 truncate text-[11px] text-white/45">
                      {(mission.faction.trim() || "No faction") + " · "}Level {mission.level.trim() || "?"}
                      {mission.arcs.length ? ` · ${mission.arcs[0]}` : ""}
                      {firstMode ? ` · ${MODE_LABELS[firstMode] ?? firstMode}` : ""}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/50">
                No mission drafts match the current filters.
              </div>
            )}
          </div>
        </div>

        <ValidationPanel messages={selectedValidation} noIssuesText="No validation issues for the selected mission." />
      </div>

      {!selectedMission ? null : (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Mission Creator</h2>
                <div className="text-xs text-white/50">
                  Runtime-aligned mission authoring with conversations, objective-specific fields, searchable rewards, and mission JSON export.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={duplicateSelectedMission}>
                  Duplicate
                </button>
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={copySelectedJson}>
                  Copy JSON
                </button>
                <button className="btn" onClick={saveSelectedJson}>
                  Save JSON File
                </button>
                <button className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30" onClick={removeSelectedMission}>
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Mission Basics</h3>
              <div className="text-sm text-white/60">
                Mission ids must start with <code>mission.</code>. Level is the minimum required level to accept the mission.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mission ID" value={selectedMission.id} onChange={(value) => updateSelected((draft) => ({ ...draft, id: value }))} />
              <Field label="Title" value={selectedMission.title} onChange={(value) => updateSelected((draft) => ({ ...draft, title: value }))} />
              <Field
                label="Level"
                value={selectedMission.level}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, level: value }))}
              />
              <Field
                label="Image Header Path"
                value={selectedMission.image}
                onChange={(value) => updateSelected((draft) => ({ ...draft, image: value }))}
                placeholder="res://assets/missions/header_data_fragments.png"
              />
              <LookupIdField
                label="Giver ID"
                value={selectedMission.giver_id}
                onChange={(value) => updateSelected((draft) => ({ ...draft, giver_id: value }))}
                options={mobOptions}
                placeholder="Search mob name or id"
              />
              <LookupIdField
                label="Turn In To"
                value={selectedMission.turn_in_to}
                onChange={(value) => updateSelected((draft) => ({ ...draft, turn_in_to: value }))}
                options={mobOptions}
                placeholder="Search mob name or id"
              />
              <DatalistField
                label="Faction"
                value={selectedMission.faction}
                onChange={(value) => updateSelected((draft) => ({ ...draft, faction: value }))}
                options={factionOptions}
                placeholder="none"
              />
              <DatalistField
                label="Class"
                value={selectedMission.missionClass}
                onChange={(value) => updateSelected((draft) => ({ ...draft, missionClass: value }))}
                options={missionClassOptions}
                placeholder="Optional mission class"
              />
            </div>

            <CheckboxField
              label="Repeatable Mission"
              checked={selectedMission.repeatable}
              onChange={(checked) => updateSelected((draft) => ({ ...draft, repeatable: checked }))}
            />

            <TextAreaField
              label="Mission Description"
              value={selectedMission.description}
              onChange={(value) => updateSelected((draft) => ({ ...draft, description: value }))}
              placeholder="Top-level description. Keep this filled for ALL-mode missions and as a general fallback."
            />
            <TextAreaField
              label="Description Complete"
              value={selectedMission.descriptionComplete}
              onChange={(value) => updateSelected((draft) => ({ ...draft, descriptionComplete: value }))}
              placeholder="Text shown when the mission is complete and ready to turn in."
            />
            <Field
              label="Legacy Progress Label Fallback"
              value={selectedMission.progressLabel}
              onChange={(value) => updateSelected((draft) => ({ ...draft, progressLabel: value }))}
              placeholder="Optional top-level HUD progress label fallback"
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <TokenEditor
                label="Arcs"
                values={selectedMission.arcs}
                suggestions={arcOptions}
                placeholder="Add arc"
                emptyText="No arcs attached yet."
                onChange={(next) => updateSelected((draft) => ({ ...draft, arcs: next }))}
              />
              <TokenEditor
                label="Tags"
                values={selectedMission.tags}
                suggestions={tagOptions}
                placeholder="Add tag"
                emptyText="No tags attached yet."
                onChange={(next) => updateSelected((draft) => ({ ...draft, tags: next }))}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <TextAreaField
                label="Authoring Notes"
                value={selectedMission.meta.notes}
                onChange={(value) =>
                  updateSelected((draft) => ({
                    ...draft,
                    meta: { ...draft.meta, notes: value },
                  }))
                }
                placeholder="Notes for authoring, TODOs, edge cases, location notes, quest hooks..."
              />
              <Field
                label="Author"
                value={selectedMission.meta.author}
                onChange={(value) =>
                  updateSelected((draft) => ({
                    ...draft,
                    meta: { ...draft.meta, author: value },
                  }))
                }
                placeholder="Author name"
              />
            </div>
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <div className="card space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Rewards</h3>
                <div className="text-sm text-white/60">
                  Search items and mods by name or id, then attach their ids to the mission rewards.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Credits"
                  value={selectedMission.rewards.credits}
                  inputMode="numeric"
                  onChange={(value) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, credits: value },
                    }))
                  }
                />
                <Field
                  label="XP"
                  value={selectedMission.rewards.xp}
                  inputMode="numeric"
                  onChange={(value) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, xp: value },
                    }))
                  }
                />
              </div>

              <LookupIdListEditor
                label="Reward Items"
                values={selectedMission.rewards.itemIds}
                options={itemOptions}
                placeholder="Search item name or id"
                emptyText="No reward items attached."
                onChange={(next) =>
                  updateSelected((draft) => ({
                    ...draft,
                    rewards: { ...draft.rewards, itemIds: next },
                  }))
                }
              />

              <LookupIdListEditor
                label="Reward Mods"
                values={selectedMission.rewards.modIds}
                options={modOptions}
                placeholder="Search mod name or id"
                emptyText="No reward mods attached."
                onChange={(next) =>
                  updateSelected((draft) => ({
                    ...draft,
                    rewards: { ...draft.rewards, modIds: next },
                  }))
                }
              />

              <TokenEditor
                label="Reputation Entries"
                values={selectedMission.rewards.reputationEntries}
                suggestions={[]}
                placeholder='Add scalar or JSON reputation entry'
                emptyText="No reputation entries attached."
                onChange={(next) =>
                  updateSelected((draft) => ({
                    ...draft,
                    rewards: { ...draft.rewards, reputationEntries: next },
                  }))
                }
              />
            </div>

            <div className="card space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Prerequisites</h3>
                <div className="text-sm text-white/60">Mission-to-mission links are explicit prerequisites. State defaults to turned_in.</div>
              </div>

              <PrerequisiteEditor
                prerequisites={selectedMission.prerequisites}
                missionId={selectedMission.id}
                options={knownMissionIds}
                onChange={(next) => updateSelected((draft) => ({ ...draft, prerequisites: next }))}
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Steps and Objectives</h3>
                <div className="text-sm text-white/60">
                  Each step has a mode and a shared step description. Objective fields vary by type. Talk objectives link into the conversation library below.
                </div>
              </div>
              <button
                className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() =>
                  updateSelected((draft) => ({
                    ...draft,
                    steps: [...draft.steps, createMissionStepDraft("single")],
                  }))
                }
              >
                Add Step
              </button>
            </div>

            <div className="space-y-4">
              {selectedMission.steps.map((step, stepIndex) => (
                <MissionStepEditor
                  key={step.key}
                  step={step}
                  stepIndex={stepIndex}
                  totalSteps={selectedMission.steps.length}
                  itemOptions={itemOptions}
                  mobOptions={mobOptions}
                  conversationOptions={conversationIdOptions}
                  onChange={(nextStep) => updateStep(stepIndex, () => nextStep)}
                  onAddObjective={() =>
                    updateStep(stepIndex, (current) => ({
                      ...current,
                      objectives: [...current.objectives, createMissionObjectiveDraft("talk")],
                    }))
                  }
                  onMoveUp={() =>
                    updateSelected((draft) => {
                      const next = [...draft.steps];
                      [next[stepIndex - 1], next[stepIndex]] = [next[stepIndex], next[stepIndex - 1]];
                      return { ...draft, steps: next };
                    })
                  }
                  onMoveDown={() =>
                    updateSelected((draft) => {
                      const next = [...draft.steps];
                      [next[stepIndex + 1], next[stepIndex]] = [next[stepIndex], next[stepIndex + 1]];
                      return { ...draft, steps: next };
                    })
                  }
                  onDuplicate={() =>
                    updateSelected((draft) => {
                      const next = [...draft.steps];
                      next.splice(stepIndex + 1, 0, duplicateMissionStepDraft(step));
                      return { ...draft, steps: next };
                    })
                  }
                  onRemove={() =>
                    updateSelected((draft) => ({
                      ...draft,
                      steps: draft.steps.length === 1
                        ? [createMissionStepDraft("single")]
                        : draft.steps.filter((_, index) => index !== stepIndex),
                    }))
                  }
                  onUpdateObjective={(objectiveIndex, updater) => updateObjective(stepIndex, objectiveIndex, updater)}
                  onMoveObjectiveUp={(objectiveIndex) =>
                    updateStep(stepIndex, (current) => {
                      const next = [...current.objectives];
                      [next[objectiveIndex - 1], next[objectiveIndex]] = [next[objectiveIndex], next[objectiveIndex - 1]];
                      return { ...current, objectives: next };
                    })
                  }
                  onMoveObjectiveDown={(objectiveIndex) =>
                    updateStep(stepIndex, (current) => {
                      const next = [...current.objectives];
                      [next[objectiveIndex + 1], next[objectiveIndex]] = [next[objectiveIndex], next[objectiveIndex + 1]];
                      return { ...current, objectives: next };
                    })
                  }
                  onDuplicateObjective={(objectiveIndex) =>
                    updateStep(stepIndex, (current) => {
                      const next = [...current.objectives];
                      next.splice(objectiveIndex + 1, 0, duplicateMissionObjectiveDraft(current.objectives[objectiveIndex]));
                      return { ...current, objectives: next };
                    })
                  }
                  onRemoveObjective={(objectiveIndex) =>
                    updateStep(stepIndex, (current) => ({
                      ...current,
                      objectives:
                        current.objectives.length === 1
                          ? [createMissionObjectiveDraft("talk")]
                          : current.objectives.filter((_, index) => index !== objectiveIndex),
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Conversations</h3>
                <div className="text-sm text-white/60">
                  Build conversation ids, beats, and player responses here. Talk objectives should reference the appropriate conversation_id.
                </div>
              </div>
              <button
                className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() =>
                  updateSelected((draft) => ({
                    ...draft,
                    conversations: [...draft.conversations, createMissionConversationDraft(`step${draft.conversations.length + 1}`)],
                  }))
                }
              >
                Add Conversation
              </button>
            </div>

            {selectedMission.conversations.length ? (
              <div className="space-y-4">
                {selectedMission.conversations.map((conversation, conversationIndex) => (
                  <div key={conversation.key} className="rounded border border-white/10 bg-white/5 p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{conversation.id.trim() || `Conversation ${conversationIndex + 1}`}</div>
                        <div className="text-xs text-white/50">{conversation.beats.length} beat(s)</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                          onClick={() =>
                            updateSelected((draft) => {
                              const existingIds = draft.conversations.map((entry) => entry.id);
                              const next = [...draft.conversations];
                              next.splice(
                                conversationIndex + 1,
                                0,
                                duplicateMissionConversationDraft(draft.conversations[conversationIndex], existingIds),
                              );
                              return { ...draft, conversations: next };
                            })
                          }
                        >
                          Duplicate
                        </button>
                        <button
                          className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30"
                          onClick={() =>
                            updateSelected((draft) => ({
                              ...draft,
                              conversations: draft.conversations.filter((_, index) => index !== conversationIndex),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <Field
                      label="Conversation ID"
                      value={conversation.id}
                      onChange={(value) => updateConversation(conversationIndex, (current) => ({ ...current, id: value }))}
                      placeholder="step1"
                    />

                    <div className="mt-4 space-y-3">
                      {conversation.beats.map((beat, beatIndex) => (
                        <div key={beat.key} className="rounded border border-white/10 bg-black/20 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold">Beat {beatIndex + 1}</div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                disabled={beatIndex === 0}
                                onClick={() =>
                                  updateConversation(conversationIndex, (current) => {
                                    const next = [...current.beats];
                                    [next[beatIndex - 1], next[beatIndex]] = [next[beatIndex], next[beatIndex - 1]];
                                    return { ...current, beats: next };
                                  })
                                }
                              >
                                Move Up
                              </button>
                              <button
                                className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                disabled={beatIndex === conversation.beats.length - 1}
                                onClick={() =>
                                  updateConversation(conversationIndex, (current) => {
                                    const next = [...current.beats];
                                    [next[beatIndex + 1], next[beatIndex]] = [next[beatIndex], next[beatIndex + 1]];
                                    return { ...current, beats: next };
                                  })
                                }
                              >
                                Move Down
                              </button>
                              <button
                                className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30"
                                onClick={() =>
                                  updateConversation(conversationIndex, (current) => ({
                                    ...current,
                                    beats:
                                      current.beats.length === 1
                                        ? [createMissionConversationBeatDraft()]
                                        : current.beats.filter((_, index) => index !== beatIndex),
                                  }))
                                }
                              >
                                Remove
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Field
                              label="Speaker"
                              value={beat.speaker}
                              onChange={(value) => updateBeat(conversationIndex, beatIndex, (current) => ({ ...current, speaker: value }))}
                              placeholder="jerry_leroy"
                            />
                          </div>

                          <TextAreaField
                            label="Dialogue Text"
                            value={beat.text}
                            onChange={(value) => updateBeat(conversationIndex, beatIndex, (current) => ({ ...current, text: value }))}
                            placeholder="What this speaker says in this beat."
                          />

                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="label">Responses</div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() =>
                                    updateBeat(conversationIndex, beatIndex, (current) => ({
                                      ...current,
                                      responses: [...current.responses, createMissionConversationResponseDraft()],
                                    }))
                                  }
                                >
                                  Add Response
                                </button>
                                <button
                                  className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() =>
                                    updateConversation(conversationIndex, (current) => {
                                      const next = [...current.beats];
                                      next.splice(beatIndex + 1, 0, createMissionConversationBeatDraft());
                                      return { ...current, beats: next };
                                    })
                                  }
                                >
                                  Add Beat
                                </button>
                              </div>
                            </div>

                            {beat.responses.length ? (
                              <div className="space-y-2">
                                {beat.responses.map((response, responseIndex) => (
                                  <div key={response.key} className="flex gap-2">
                                    <input
                                      className="input"
                                      value={response.text}
                                      onChange={(event) =>
                                        updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                          ...current,
                                          text: event.target.value,
                                        }))
                                      }
                                      placeholder="Player response text"
                                    />
                                    <button
                                      className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                                      onClick={() =>
                                        updateBeat(conversationIndex, beatIndex, (current) => ({
                                          ...current,
                                          responses: current.responses.filter((_, index) => index !== responseIndex),
                                        }))
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/50">
                                No player responses on this beat.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">
                No conversations yet. Add one, then reference it from a talk objective.
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="mb-3 text-lg font-semibold">Export Preview</h3>
            <pre className="max-h-[70vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">{exportedJson}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function MissionStepEditor({
  step,
  stepIndex,
  totalSteps,
  itemOptions,
  mobOptions,
  conversationOptions,
  onChange,
  onAddObjective,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onUpdateObjective,
  onMoveObjectiveUp,
  onMoveObjectiveDown,
  onDuplicateObjective,
  onRemoveObjective,
}: {
  step: MissionStepDraft;
  stepIndex: number;
  totalSteps: number;
  itemOptions: LookupOption[];
  mobOptions: LookupOption[];
  conversationOptions: string[];
  onChange: (next: MissionStepDraft) => void;
  onAddObjective: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpdateObjective: (objectiveIndex: number, updater: (objective: MissionObjectiveDraft) => MissionObjectiveDraft) => void;
  onMoveObjectiveUp: (objectiveIndex: number) => void;
  onMoveObjectiveDown: (objectiveIndex: number) => void;
  onDuplicateObjective: (objectiveIndex: number) => void;
  onRemoveObjective: (objectiveIndex: number) => void;
}) {
  const normalizedMode = step.mode.trim().toLowerCase();
  const modeHelpText =
    normalizedMode === "all"
      ? "All objectives are active at the same time. Use the step description as the mission popup summary instead of relying on each objective description."
      : normalizedMode === "sequential"
        ? "Sequential objectives are completed in order. Each objective description drives the popup while that objective is active."
        : "Single mode should contain exactly one objective.";

  return (
    <div className="rounded border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Step {stepIndex + 1}</div>
          <div className="text-xs text-white/50">{MODE_LABELS[normalizedMode] ?? "Single"} mode · {step.objectives.length} objective(s)</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40" disabled={stepIndex === 0} onClick={onMoveUp}>
            Move Up
          </button>
          <button
            className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            disabled={stepIndex === totalSteps - 1}
            onClick={onMoveDown}
          >
            Move Down
          </button>
          <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Mode" value={normalizedMode} options={Array.from(MISSION_MODES)} onChange={(value) => onChange({ ...step, mode: value })} />
      </div>

      <TextAreaField
        label="Step Description"
        value={step.description}
        onChange={(value) => onChange({ ...step, description: value })}
        helperText={modeHelpText}
        placeholder="Shared step description. For ALL-mode steps this is the main summary text used in the popup."
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="label">Objectives</div>
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={onAddObjective}>
          Add Objective
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {step.objectives.map((objective, objectiveIndex) => (
          <MissionObjectiveEditor
            key={objective.key}
            objective={objective}
            objectiveIndex={objectiveIndex}
            totalObjectives={step.objectives.length}
            mode={normalizedMode}
            itemOptions={itemOptions}
            mobOptions={mobOptions}
            conversationOptions={conversationOptions}
            onChange={(next) => onUpdateObjective(objectiveIndex, () => next)}
            onMoveUp={() => onMoveObjectiveUp(objectiveIndex)}
            onMoveDown={() => onMoveObjectiveDown(objectiveIndex)}
            onDuplicate={() => onDuplicateObjective(objectiveIndex)}
            onRemove={() => onRemoveObjective(objectiveIndex)}
          />
        ))}
      </div>
    </div>
  );
}

function MissionObjectiveEditor({
  objective,
  objectiveIndex,
  totalObjectives,
  mode,
  itemOptions,
  mobOptions,
  conversationOptions,
  onChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: {
  objective: MissionObjectiveDraft;
  objectiveIndex: number;
  totalObjectives: number;
  mode: string;
  itemOptions: LookupOption[];
  mobOptions: LookupOption[];
  conversationOptions: string[];
  onChange: (next: MissionObjectiveDraft) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const type = objective.type.trim().toLowerCase();
  const usesMultiTarget = type === "collect" || type === "kill";
  const usesMobTarget = type === "talk" || type === "scan" || type === "collect" || type === "kill" || type === "sell" || type === "buy" || type === "hail" || type === "repair";

  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Objective {objectiveIndex + 1} · {OBJECTIVE_LABELS[type] ?? "Objective"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40" disabled={objectiveIndex === 0} onClick={onMoveUp}>
            Move Up
          </button>
          <button
            className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
            disabled={objectiveIndex === totalObjectives - 1}
            onClick={onMoveDown}
          >
            Move Down
          </button>
          <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          label="Objective Type"
          value={type}
          options={Array.from(MISSION_OBJECTIVE_TYPES)}
          onChange={(value) => onChange({ ...createMissionObjectiveDraft(value as typeof MISSION_OBJECTIVE_TYPES[number]), ...objective, type: value })}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {usesMultiTarget ? (
          <div className="md:col-span-2">
            <LookupIdListEditor
              label="Target IDs"
              values={objective.targetIds}
              options={mobOptions}
              placeholder="Search mob name or id"
              emptyText="No target ids attached."
              onChange={(next) => onChange({ ...objective, targetIds: next })}
            />
          </div>
        ) : null}

        {!usesMultiTarget && usesMobTarget ? (
          <LookupIdField
            label="Target ID"
            value={objective.targetIds[0] ?? ""}
            onChange={(value) => onChange({ ...objective, targetIds: value.trim() ? [value] : [] })}
            options={mobOptions}
            placeholder="Search mob name or id"
          />
        ) : null}

        {type === "travel" ? (
          <Field
            label="Target Zone ID"
            value={objective.targetIds[0] ?? ""}
            onChange={(value) => onChange({ ...objective, targetIds: value.trim() ? [value] : [] })}
            placeholder="10_terran_one"
          />
        ) : null}

        {type === "talk" ? (
          <>
            <Field
              label="Contact ID"
              value={objective.contactId}
              onChange={(value) => onChange({ ...objective, contactId: value })}
              placeholder="jerry_leroy"
            />
            <DatalistField
              label="Conversation ID"
              value={objective.conversationId}
              onChange={(value) => onChange({ ...objective, conversationId: value })}
              options={conversationOptions}
              placeholder="step1"
            />
          </>
        ) : null}

        {(type === "scan" || type === "collect" || type === "kill" || type === "buy" || type === "sell") ? (
          <Field
            label="Count"
            value={objective.count}
            inputMode="numeric"
            onChange={(value) => onChange({ ...objective, count: value })}
          />
        ) : null}

        {(type === "collect" || type === "buy" || type === "sell") ? (
          <LookupIdField
            label="Item ID"
            value={objective.itemId}
            onChange={(value) => onChange({ ...objective, itemId: value })}
            options={itemOptions}
            placeholder="Search item name or id"
          />
        ) : null}

        {type === "collect" ? (
          <Field
            label="Drop Chance"
            value={objective.dropChance}
            onChange={(value) => onChange({ ...objective, dropChance: value })}
            placeholder="1.0"
          />
        ) : null}

        {type === "travel" ? (
          <Field
            label="Seconds In Zone"
            value={objective.seconds}
            inputMode="numeric"
            onChange={(value) => onChange({ ...objective, seconds: value })}
          />
        ) : null}

        {type === "explore" ? (
          <>
            <Field label="Sector ID" value={objective.sectorId} onChange={(value) => onChange({ ...objective, sectorId: value })} placeholder="1,0" />
            <Field label="Region" value={objective.region} onChange={(value) => onChange({ ...objective, region: value })} placeholder="18" />
          </>
        ) : null}
      </div>

      {type === "repair" ? (
        <div className="mt-4">
          <CheckboxField
            label="Must Fully Repair Target"
            checked={objective.fullRepair}
            onChange={(checked) => onChange({ ...objective, fullRepair: checked })}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <TextAreaField
          label="Description"
          value={objective.description}
          onChange={(value) => onChange({ ...objective, description: value })}
          helperText={
            mode === "all"
              ? "This still exports, but ALL-mode missions should rely on the step description summary instead of individual objective descriptions."
              : "This description is used in the mission popup while this objective is active."
          }
          placeholder="What the player sees in the mission popup."
        />
        <Field
          label="Objective"
          value={objective.objective}
          onChange={(value) => onChange({ ...objective, objective: value })}
          placeholder="Short popup objective text"
        />
        <Field
          label="Progress Label"
          value={objective.progressLabel}
          onChange={(value) => onChange({ ...objective, progressLabel: value })}
          placeholder="HUD completion label"
        />
      </div>
    </div>
  );
}

function PrerequisiteEditor({
  prerequisites,
  missionId,
  options,
  onChange,
}: {
  prerequisites: MissionPrerequisiteDraft[];
  missionId: string;
  options: string[];
  onChange: (next: MissionPrerequisiteDraft[]) => void;
}) {
  const listId = useId();
  const availableOptions = options.filter((option) => option !== missionId.trim());

  function updateAt(index: number, next: MissionPrerequisiteDraft) {
    onChange(prerequisites.map((entry, currentIndex) => (currentIndex === index ? next : entry)));
  }

  return (
    <div className="space-y-3">
      {prerequisites.length ? (
        prerequisites.map((prerequisite, index) => (
          <div key={prerequisite.key} className="grid gap-3 md:grid-cols-[minmax(0,1fr),160px,auto]">
            <div>
              <div className="label mb-2">Mission ID</div>
              <input
                className="input"
                list={listId}
                value={prerequisite.id}
                onChange={(event) => updateAt(index, { ...prerequisite, id: event.target.value })}
                placeholder="mission.some_id"
              />
            </div>
            <SelectField
              label="State"
              value={prerequisite.state}
              options={Array.from(MISSION_PREREQUISITE_STATES)}
              onChange={(value) => updateAt(index, { ...prerequisite, state: value })}
            />
            <div className="flex items-end">
              <button
                className="w-full rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30"
                onClick={() => onChange(prerequisites.filter((_, currentIndex) => currentIndex !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">
          No prerequisites linked yet.
        </div>
      )}

      <button
        className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        onClick={() =>
          onChange([
            ...prerequisites,
            {
              key: `prerequisite_${Date.now()}_${prerequisites.length}`,
              id: "",
              state: "turned_in",
            },
          ])
        }
      >
        Add Prerequisite
      </button>

      <datalist id={listId}>
        {availableOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function TokenEditor({
  label,
  values,
  suggestions,
  placeholder,
  emptyText,
  onChange,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  placeholder: string;
  emptyText: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const nextValue = raw.trim();
    if (!nextValue) return;
    const resolved = resolveStringSuggestion(nextValue, suggestions);
    if (values.includes(resolved)) {
      setDraft("");
      return;
    }
    onChange([...values, resolved]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(draft);
  }

  return (
    <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
      <div className="label">{label}</div>

      {values.length ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <button
              key={value}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              onClick={() => onChange(values.filter((entry) => entry !== value))}
              title="Remove value"
            >
              {value} ×
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/50">{emptyText}</div>
      )}

      <div className="flex gap-2">
        <input
          className="input"
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => commit(draft)}>
          Add
        </button>
      </div>

      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function LookupIdListEditor({
  label,
  values,
  options,
  placeholder,
  emptyText,
  onChange,
}: {
  label: string;
  values: string[];
  options: LookupOption[];
  placeholder: string;
  emptyText: string;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const nextValue = resolveLookupValue(raw, options);
    if (!nextValue || values.includes(nextValue)) {
      setDraft("");
      return;
    }
    onChange([...values, nextValue]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(draft);
  }

  return (
    <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
      <div className="label">{label}</div>

      {values.length ? (
        <div className="space-y-2">
          {values.map((value) => {
            const option = options.find((entry) => entry.id === value);
            return (
              <div key={value} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{option?.label ?? value}</div>
                  <div className="text-xs text-white/50">
                    {value}
                    {option?.meta ? ` · ${option.meta}` : ""}
                  </div>
                </div>
                <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={() => onChange(values.filter((entry) => entry !== value))}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-white/50">{emptyText}</div>
      )}

      <div className="flex gap-2">
        <input
          className="input"
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => commit(draft)}>
          Add
        </button>
      </div>

      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.id} label={option.meta ? `${option.label} · ${option.meta}` : option.label} />
        ))}
      </datalist>
    </div>
  );
}

function LookupIdField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: LookupOption[];
  placeholder: string;
  onChange: (next: string) => void;
}) {
  const listId = useId();
  const selected = options.find((option) => option.id === value.trim());

  return (
    <div className="space-y-2">
      <div className="label">{label}</div>
      <input className="input" list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.id} label={option.meta ? `${option.label} · ${option.meta}` : option.label} />
        ))}
      </datalist>
      <div className="text-xs text-white/50">
        {selected ? `${selected.label}${selected.meta ? ` · ${selected.meta}` : ""}` : "Use id directly or search by name through the datalist."}
      </div>
    </div>
  );
}

function DatalistField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const listId = useId();

  return (
    <div className="space-y-2">
      <div className="label">{label}</div>
      <input className="input" list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  helperText?: string;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <textarea className="input min-h-24" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {helperText ? <div className="text-xs text-white/50">{helperText}</div> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  allLabel?: string;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel ? <option value={FILTER_ALL}>{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {MODE_LABELS[option] ?? OBJECTIVE_LABELS[option] ?? option}
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
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-white/80">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
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
    <div className="card h-fit space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Validation</h2>
        <div className="text-xs text-white/50">Live mission checks against the current runtime-aligned authoring model.</div>
      </div>

      {messages.length ? (
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.level}-${message.message}-${index}`}
              className={`rounded border px-4 py-3 ${
                message.level === "error" ? "border-red-400/40 bg-red-500/10 text-red-50" : "border-yellow-400/40 bg-yellow-500/10 text-yellow-50"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.25em] opacity-80">{message.level}</div>
              <div className="mt-1 text-sm leading-6">{message.message}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">{noIssuesText}</div>
      )}
    </div>
  );
}

function buildSortedOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return left.localeCompare(right);
  });
}

function resolveStringSuggestion(value: string, suggestions: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const exact = suggestions.find((entry) => entry.toLowerCase() === trimmed.toLowerCase());
  return exact ?? trimmed;
}

function resolveLookupValue(value: string, options: LookupOption[]) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const exactId = options.find((option) => option.id.toLowerCase() === trimmed.toLowerCase());
  if (exactId) return exactId.id;
  const exactLabel = options.find((option) => option.label.toLowerCase() === trimmed.toLowerCase());
  if (exactLabel) return exactLabel.id;
  return trimmed;
}

function itemToLookupOption(item: Item): LookupOption {
  return {
    id: String(item.id),
    label: item.name || String(item.id),
    meta: `Level ${item.levelRequirement} · Rarity ${item.rarity}`,
  };
}

function modToLookupOption(mod: Mod): LookupOption {
  return {
    id: String(mod.id),
    label: mod.name || String(mod.id),
    meta: `${mod.slot} · Level ${mod.levelRequirement} · Rarity ${mod.rarity}`,
  };
}

function mobToLookupOption(mob: Mob): LookupOption {
  return {
    id: String(mob.id),
    label: mob.displayName?.trim() || String(mob.id),
    meta: [mob.level != null ? `Level ${mob.level}` : "", mob.faction?.trim() || ""].filter(Boolean).join(" · "),
  };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
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
