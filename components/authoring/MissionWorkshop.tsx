"use client";

import type { InputHTMLAttributes } from "react";
import { KeyboardEvent, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DismissibleStatusBanner,
  EMPTY_TIMED_STATUS,
  StatusBanner,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import type { ValidationMessage } from "@lib/authoring";
import { buildIconSrc } from "@lib/icon-src";
import { parseLooseJson } from "@lib/json";
import type { NormalizedMission } from "@lib/mission-lab/types";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import {
  MISSION_MODES,
  MISSION_OBJECTIVE_TYPES,
  MISSION_PREREQUISITE_STATES,
  MissionConversationBeatDraft,
  MissionConversationDraft,
  MissionConversationResponseDraft,
  MissionDraft,
  MissionEscortAmbushDraft,
  MissionObjectiveDraft,
  MissionPrerequisiteDraft,
  MissionResponseBooleanState,
  MissionRewardItemDraft,
  MissionRewardModDraft,
  MissionStepDraft,
  createMissionConversationBeatDraft,
  createMissionConversationDraft,
  createMissionConversationResponseDraft,
  createMissionDraft,
  createMissionEscortAmbushDraft,
  createMissionObjectiveDraft,
  createMissionStepDraft,
  duplicateMissionConversationDraft,
  duplicateMissionDraft,
  duplicateMissionObjectiveDraft,
  duplicateMissionStepDraft,
  exportMissionDraft,
  generateMissionIdFromTitle,
  normalizeMissionIdValue,
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
  acquire: "Acquire",
  deliver: "Deliver",
  escort: "Escort",
  kill: "Kill",
  mine: "Mine",
  sell: "Sell",
  buy: "Buy",
  travel: "Travel",
  explore: "Explore",
  hail: "Hail",
  repair: "Repair",
  status_applied: "Status Applied",
  ability_success: "Ability Success",
};

type LookupOption = {
  id: string;
  label: string;
  meta?: string;
};

type MissionHeaderImageOption = {
  fileName: string;
  resPath: string;
  label: string;
};

type IssueFilter = "all" | "error" | "warning";

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
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState(FILTER_ALL);
  const [levelFilter, setLevelFilter] = useState(FILTER_ALL);
  const [arcFilter, setArcFilter] = useState(FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(FILTER_ALL);
  const [modeFilter, setModeFilter] = useState(FILTER_ALL);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [status, setStatus] = useState<TimedStatusState>(EMPTY_TIMED_STATUS);
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [commsOptions, setCommsOptions] = useState<LookupOption[]>([]);
  const [abilityOptions, setAbilityOptions] = useState<LookupOption[]>([]);
  const [statusEffectOptions, setStatusEffectOptions] = useState<LookupOption[]>([]);
  const [mineableAsteroidOptions, setMineableAsteroidOptions] = useState<LookupOption[]>([]);
  const [zoneOptions, setZoneOptions] = useState<LookupOption[]>([]);
  const [factionCatalogOptions, setFactionCatalogOptions] = useState<string[]>([]);
  const [classCatalogOptions, setClassCatalogOptions] = useState<string[]>([]);
  const [missionHeaderOptions, setMissionHeaderOptions] = useState<MissionHeaderImageOption[]>([]);
  const [objectivesCollapsed, setObjectivesCollapsed] = useState(false);
  const [collapsedObjectiveKeys, setCollapsedObjectiveKeys] = useState<Set<string>>(() => new Set());
  const [conversationsCollapsed, setConversationsCollapsed] = useState(false);
  const [collapsedConversationBeatKeys, setCollapsedConversationBeatKeys] = useState<Set<string>>(() => new Set());
  const [savingToGameFolder, setSavingToGameFolder] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const beatTextAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const responseInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingBeatFocusKey, setPendingBeatFocusKey] = useState<string | null>(null);
  const [pendingResponseFocusKey, setPendingResponseFocusKey] = useState<string | null>(null);
  const clearStatus = () => setStatus(EMPTY_TIMED_STATUS);
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  useEffect(() => {
    if (selectedIndex <= missions.length - 1) return;
    setSelectedIndex(Math.max(0, missions.length - 1));
  }, [missions.length, selectedIndex]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogs() {
      try {
        const [
          itemsResponse,
          modsResponse,
          mobsResponse,
          commsResponse,
          environmentalElementsResponse,
          zonesResponse,
          taxonomyResponse,
          missionHeaderResponse,
          abilityDatabaseResponse,
        ] = await Promise.all([
          fetch("/api/items"),
          fetch("/api/mods"),
          fetch("/api/mobs"),
          fetch("/api/settings/data/source?kind=comms"),
          fetch("/api/settings/data/source?kind=environmentalElements"),
          fetch("/api/settings/data/source?kind=zones"),
          fetch("/api/taxonomy"),
          fetch("/api/mission-header-images"),
          fetch("/api/abilities/database"),
        ]);

        const itemsJson = await itemsResponse.json().catch(() => ({ data: [] }));
        const modsJson = await modsResponse.json().catch(() => ({ data: [] }));
        const mobsJson = await mobsResponse.json().catch(() => ({ data: [] }));
        const commsJson = await commsResponse.json().catch(() => ({ ok: false, text: "" }));
        const environmentalElementsJson = await environmentalElementsResponse.json().catch(() => ({ ok: false, text: "" }));
        const zonesJson = await zonesResponse.json().catch(() => ({ ok: false, text: "" }));
        const taxonomyJson = await taxonomyResponse.json().catch(() => ({ ok: false, factions: [], classes: [] }));
        const missionHeaderJson = await missionHeaderResponse.json().catch(() => ({ ok: false, data: [] }));
        const abilityDatabaseJson = await abilityDatabaseResponse.json().catch(() => ({ ok: false, database: null }));
        if (cancelled) return;

        setItems(Array.isArray(itemsJson.data) ? itemsJson.data : []);
        setMods(Array.isArray(modsJson.data) ? modsJson.data : []);
        setMobs(Array.isArray(mobsJson.data) ? mobsJson.data : []);
        setCommsOptions(commsJson.ok && typeof commsJson.text === "string" ? parseCommsLookupOptions(commsJson.text) : []);
        setAbilityOptions(abilityDatabaseJson.ok ? parseAbilityLookupOptions(abilityDatabaseJson.database?.abilities) : []);
        setStatusEffectOptions(abilityDatabaseJson.ok ? parseStatusEffectLookupOptions(abilityDatabaseJson.database?.statusEffects) : []);
        setMineableAsteroidOptions(
          environmentalElementsJson.ok && typeof environmentalElementsJson.text === "string"
            ? parseMineableAsteroidLookupOptions(environmentalElementsJson.text)
            : [],
        );
        setZoneOptions(zonesJson.ok && typeof zonesJson.text === "string" ? parseZoneLookupOptions(zonesJson.text) : []);
        setFactionCatalogOptions(
          taxonomyJson.ok && Array.isArray(taxonomyJson.factions)
            ? taxonomyJson.factions.map((entry: { name?: unknown }) => String(entry.name ?? "").trim()).filter(Boolean)
            : [],
        );
        setClassCatalogOptions(taxonomyJson.ok && Array.isArray(taxonomyJson.classes) ? taxonomyJson.classes.map((entry: unknown) => String(entry).trim()).filter(Boolean) : []);
        setMissionHeaderOptions(missionHeaderJson.ok && Array.isArray(missionHeaderJson.data) ? missionHeaderJson.data : []);
      } catch {
        if (cancelled) return;
        setItems([]);
        setMods([]);
        setMobs([]);
        setCommsOptions([]);
        setAbilityOptions([]);
        setStatusEffectOptions([]);
        setMineableAsteroidOptions([]);
        setZoneOptions([]);
        setFactionCatalogOptions([]);
        setClassCatalogOptions([]);
        setMissionHeaderOptions([]);
      }
    }

    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const itemOptions = useMemo(() => items.map((item) => itemToLookupOption(item)), [items]);
  const modOptions = useMemo(() => mods.map((mod) => modToLookupOption(mod)), [mods]);
  const mobOptions = useMemo(() => mobs.map((mob) => mobToLookupOption(mob)), [mobs]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, missions.length - 1)));
  const selectedMission = missions[clampedSelectedIndex] ?? null;

  const validation = useMemo(() => validateMissionDrafts(missions, knownMissionIds), [knownMissionIds, missions]);
  const issueFlagsByIndex = useMemo(() => {
    const next = new Map<number, { error: boolean; warning: boolean }>();
    for (const message of validation) {
      if (typeof message.draftIndex !== "number") continue;
      const current = next.get(message.draftIndex) ?? { error: false, warning: false };
      if (message.level === "error") current.error = true;
      if (message.level === "warning") current.warning = true;
      next.set(message.draftIndex, current);
    }
    return next;
  }, [validation]);
  const selectedValidation = useMemo(
    () => validation.filter((message) => message.draftIndex === clampedSelectedIndex),
    [clampedSelectedIndex, validation],
  );

  const factionOptions = useMemo(() => buildSortedOptions(factionCatalogOptions), [factionCatalogOptions]);
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
  const missionClassOptions = useMemo(() => buildSortedOptions(classCatalogOptions), [classCatalogOptions]);
  const conversationIdOptions = useMemo(
    () => buildSortedOptions(selectedMission?.conversations.map((conversation) => conversation.id) ?? []),
    [selectedMission],
  );
  const missionDialogueOptions = useMemo(
    () => buildMissionDialogueOptions(selectedMission?.dialogParticipants ?? [], commsOptions),
    [commsOptions, selectedMission],
  );

  useEffect(() => {
    if (!pendingBeatFocusKey) return;
    const frame = window.requestAnimationFrame(() => {
      const target = beatTextAreaRefs.current[pendingBeatFocusKey];
      if (target) {
        target.focus();
        const length = target.value.length;
        target.setSelectionRange(length, length);
        setPendingBeatFocusKey(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [missions, pendingBeatFocusKey]);

  useEffect(() => {
    if (!pendingResponseFocusKey) return;
    const frame = window.requestAnimationFrame(() => {
      const target = responseInputRefs.current[pendingResponseFocusKey];
      if (target) {
        target.focus();
        const length = target.value.length;
        target.setSelectionRange(length, length);
        setPendingResponseFocusKey(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [missions, pendingResponseFocusKey]);

  const filteredMissions = useMemo(() => {
    return missions
      .map((mission, index) => ({ mission, index }))
      .filter(({ mission, index }) => {
        const modes = mission.steps.map((step) => step.mode.trim().toLowerCase()).filter(Boolean);
        const target = [
          mission.id,
          mission.title,
          mission.faction,
          mission.missionClass,
          mission.meta.author,
          mission.meta.notes,
          mission.meta.dateCreated,
          mission.meta.lastEditDate,
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
        if (issueFilter !== "all") {
          const flags = issueFlagsByIndex.get(index);
          if (issueFilter === "error" && !flags?.error) return false;
          if (issueFilter === "warning" && !flags?.warning) return false;
        }
        return true;
      });
  }, [arcFilter, deferredSearch, factionFilter, issueFilter, issueFlagsByIndex, levelFilter, missions, modeFilter, tagFilter]);

  const errorCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((flags) => flags.error).length, [issueFlagsByIndex]);
  const warningCount = useMemo(() => Array.from(issueFlagsByIndex.values()).filter((flags) => flags.warning).length, [issueFlagsByIndex]);
  const hasActiveFilters =
    issueFilter !== "all" ||
    factionFilter !== FILTER_ALL ||
    levelFilter !== FILTER_ALL ||
    arcFilter !== FILTER_ALL ||
    tagFilter !== FILTER_ALL ||
    modeFilter !== FILTER_ALL;

  const exportedJson = useMemo(
    () => (selectedMission ? JSON.stringify(exportMissionDraft(selectedMission), null, 2) : ""),
    [selectedMission],
  );
  const selectedMissionUsesAllMode = selectedMission?.steps.some((step) => step.mode.trim().toLowerCase() === "all") ?? false;

  function setMissionAt(index: number, next: MissionDraft) {
    onChange(missions.map((mission, missionIndex) => (missionIndex === index ? next : mission)));
  }

  function updateSelected(updater: (draft: MissionDraft) => MissionDraft) {
    if (!selectedMission) return;
    setMissionAt(clampedSelectedIndex, updater(selectedMission));
  }

  function updateSelectedMissionId(value: string) {
    updateSelected((draft) => ({ ...draft, id: normalizeMissionIdValue(value) }));
  }

  function updateSelectedMissionTitle(value: string) {
    updateSelected((draft) => {
      const currentId = draft.id.trim();
      const currentAutoId = generateMissionIdFromTitle(draft.title, knownMissionIds, currentId);
      const nextAutoId = generateMissionIdFromTitle(value, knownMissionIds, currentId);
      const shouldAutoUpdateId = !currentId || currentId === "mission." || currentId === currentAutoId;
      return {
        ...draft,
        title: value,
        id: shouldAutoUpdateId ? nextAutoId : draft.id,
      };
    });
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

  function toggleObjectiveCollapsed(objectiveKey: string) {
    setCollapsedObjectiveKeys((current) => {
      const next = new Set(current);
      if (next.has(objectiveKey)) next.delete(objectiveKey);
      else next.add(objectiveKey);
      return next;
    });
  }

  function toggleConversationBeatCollapsed(beatKey: string) {
    setCollapsedConversationBeatKeys((current) => {
      const next = new Set(current);
      if (next.has(beatKey)) next.delete(beatKey);
      else next.add(beatKey);
      return next;
    });
  }

  function queueBeatFocus(beatKey: string) {
    setPendingBeatFocusKey(beatKey);
  }

  function addBeatAfter(conversationIndex: number, beatIndex: number, speaker: string) {
    const nextBeat = createMissionConversationBeatDraft(speaker);
    updateConversation(conversationIndex, (current) => {
      const next = [...current.beats];
      next.splice(beatIndex + 1, 0, nextBeat);
      return { ...current, beats: next };
    });
    queueBeatFocus(nextBeat.key);
  }

  function addResponse(conversationIndex: number, beatIndex: number) {
    const nextResponse = createMissionConversationResponseDraft();
    updateBeat(conversationIndex, beatIndex, (current) => ({
      ...current,
      responses: [...current.responses, nextResponse],
    }));
    setPendingResponseFocusKey(nextResponse.key);
  }

  function addMission() {
    const next = [...missions, createMissionDraft()];
    onChange(next);
    setSelectedIndex(next.length - 1);
    setStatus({ tone: "success", message: "Created a new mission draft.", dismissAfterMs: 4000 });
  }

  function duplicateSelectedMission() {
    if (!selectedMission) return;
    const next = [...missions];
    next.splice(clampedSelectedIndex + 1, 0, duplicateMissionDraft(selectedMission));
    onChange(next);
    setSelectedIndex(clampedSelectedIndex + 1);
    setStatus({ tone: "success", message: "Duplicated the selected mission draft.", dismissAfterMs: 4000 });
  }

  function removeSelectedMission() {
    const next = missions.filter((_, index) => index !== clampedSelectedIndex);
    onChange(next.length ? next : [createMissionDraft()]);
    setSelectedIndex(Math.max(0, clampedSelectedIndex - 1));
    setStatus({ tone: "success", message: "Deleted the selected mission draft.", dismissAfterMs: 4000 });
  }

  async function copySelectedJson() {
    if (!selectedMission) return;
    const copied = await copyText(exportedJson);
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the selected mission JSON to the clipboard." : "Clipboard copy failed in this browser context.",
      dismissAfterMs: copied ? 5000 : null,
    });
  }

  async function saveSelectedJson() {
    if (!selectedMission) return;
    clearStatus();
    setSavingToGameFolder(true);
    try {
      const response = await fetch("/api/missions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: selectedMission, index: clampedSelectedIndex, knownMissionIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        savedPath?: string;
        mission?: MissionDraft;
        duplicateMissionPaths?: string[];
      };
      if (!response.ok || !payload.ok) {
        setStatus({
          tone: "error",
          message: payload.error || "Could not save the selected mission into the game mission folder.",
          dismissAfterMs: null,
        });
        return;
      }
      if (payload.mission) {
        setMissionAt(clampedSelectedIndex, payload.mission);
      }
      setStatus({
        tone: payload.duplicateMissionPaths?.length ? "error" : "success",
        message: `Saved the selected mission into the game mission folder${payload.savedPath ? `: ${payload.savedPath}` : "."}${
          payload.duplicateMissionPaths?.length ? ` Duplicate files still exist for this mission id: ${payload.duplicateMissionPaths.join(", ")}` : ""
        }`,
        dismissAfterMs: payload.duplicateMissionPaths?.length ? null : 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save the selected mission into the game mission folder.",
        dismissAfterMs: null,
      });
    } finally {
      setSavingToGameFolder(false);
    }
  }

  function resetFilters() {
    setIssueFilter("all");
    setFactionFilter(FILTER_ALL);
    setLevelFilter(FILTER_ALL);
    setArcFilter(FILTER_ALL);
    setTagFilter(FILTER_ALL);
    setModeFilter(FILTER_ALL);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl text-sm text-white/55">
          {selectedMission ? (
            <span>
              Editing <span className="font-medium text-white">{selectedMission.title || selectedMission.id || "Untitled mission"}</span>
            </span>
          ) : (
            <span>Select or create a mission draft before saving to the game folder.</span>
          )}
        </div>
        <button
          className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40"
          disabled={!selectedMission || savingToGameFolder}
          onClick={() => void saveSelectedJson()}
        >
          {savingToGameFolder ? "Saving..." : "Save to game folder"}
        </button>
      </div>

      {status.message ? (
        status.tone === "neutral" ? (
          <StatusBanner tone={status.tone} message={status.message} />
        ) : (
          <DismissibleStatusBanner tone={status.tone} message={status.message} onDismiss={clearStatus} countdownSeconds={statusCountdown} />
        )
      ) : null}

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
            <button
              type="button"
              className={`rounded border px-3 py-2 text-left transition ${
                issueFilter === "error"
                  ? "border-red-300/60 bg-red-500/20 text-red-50"
                  : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
              }`}
              onClick={() => setIssueFilter((current) => (current === "error" ? "all" : "error"))}
            >
              <div className="label text-red-100/80">Errors</div>
              <div className="mt-1 text-lg font-semibold">{errorCount}</div>
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-2 text-left transition ${
                issueFilter === "warning"
                  ? "border-yellow-300/60 bg-yellow-500/20 text-yellow-50"
                  : "border-yellow-400/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
              }`}
              onClick={() => setIssueFilter((current) => (current === "warning" ? "all" : "warning"))}
            >
              <div className="label text-yellow-100/80">Warnings</div>
              <div className="mt-1 text-lg font-semibold">{warningCount}</div>
            </button>
          </div>

          {issueFilter !== "all" ? (
            <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65">
              Filtering missions with {issueFilter === "error" ? "errors" : "warnings"}.
            </div>
          ) : null}

          <div className="max-h-[52vh] space-y-2 overflow-auto pr-1">
            {filteredMissions.length ? (
              filteredMissions.map(({ mission, index }) => {
                const firstMode = mission.steps[0]?.mode.trim().toLowerCase() || "single";
                const flags = issueFlagsByIndex.get(index);
                const hasErrors = Boolean(flags?.error);
                const hasWarnings = Boolean(flags?.warning);
                return (
                  <button
                    key={`${mission.id || "mission"}-${index}`}
                    className={`w-full rounded border px-3 py-2 text-left transition ${
                      index === clampedSelectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 truncate font-medium">{mission.title || "Untitled mission"}</div>
                      <div className="flex shrink-0 gap-2 text-[11px]">
                        {hasErrors ? <span className="rounded bg-red-400/15 px-2 py-1 text-red-100">Errors</span> : null}
                        {!hasErrors && hasWarnings ? <span className="rounded bg-yellow-300/15 px-2 py-1 text-yellow-100">Warnings</span> : null}
                      </div>
                    </div>
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
                Mission ids auto-generate from the title as lowercase underscores and must start with <code>mission.</code>. Level is the minimum required
                level to accept the mission.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mission ID" value={selectedMission.id} onChange={updateSelectedMissionId} />
              <Field label="Title" value={selectedMission.title} onChange={updateSelectedMissionTitle} />
              <Field
                label="Level"
                value={selectedMission.level}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, level: value }))}
              />
              <MissionHeaderImageSelect
                value={selectedMission.image}
                options={missionHeaderOptions}
                version={sharedDataVersion}
                onChange={(value) => updateSelected((draft) => ({ ...draft, image: value }))}
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
              <SelectField
                label="Faction"
                value={selectedMission.faction}
                onChange={(value) => updateSelected((draft) => ({ ...draft, faction: value }))}
                options={factionOptions}
                allLabel="Select faction"
                allValue=""
              />
              <SelectField
                label="Class"
                value={selectedMission.missionClass}
                onChange={(value) => updateSelected((draft) => ({ ...draft, missionClass: value }))}
                options={missionClassOptions}
                allLabel="Select class"
                allValue=""
              />
            </div>

            <CheckboxField
              label="Repeatable Mission"
              checked={selectedMission.repeatable}
              onChange={(checked) => updateSelected((draft) => ({ ...draft, repeatable: checked }))}
            />

            {selectedMissionUsesAllMode ? (
              <TextAreaField
                label="Mission Description"
                value={selectedMission.description}
                onChange={(value) => updateSelected((draft) => ({ ...draft, description: value }))}
                helperText="Fallback summary for ALL-mode steps when the step description is blank."
                placeholder="Top-level fallback description for ALL-mode missions."
              />
            ) : null}
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
              <Field
                label="Date Created"
                value={selectedMission.meta.dateCreated ?? ""}
                onChange={(value) =>
                  updateSelected((draft) => ({
                    ...draft,
                    meta: { ...draft.meta, dateCreated: value },
                  }))
                }
                placeholder="2026-05-12T00:00:00.000Z"
              />
              <Field
                label="Last Edit Date"
                value={selectedMission.meta.lastEditDate ?? ""}
                onChange={(value) =>
                  updateSelected((draft) => ({
                    ...draft,
                    meta: { ...draft.meta, lastEditDate: value },
                  }))
                }
                placeholder="Updated automatically when saved"
              />
            </div>
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <div className="card space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Rewards</h3>
                <div className="text-sm text-white/60">
                  Search items and mods by name or id, then attach them to the mission rewards. Item rewards can include a quantity and each item or mod can hide its reward icon.
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

              <div className="grid gap-3 rounded border border-white/10 bg-white/5 p-3 md:grid-cols-2">
                <CheckboxField
                  label="Hide all item reward icons"
                  checked={selectedMission.rewards.hideItemRewards}
                  onChange={(checked) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, hideItemRewards: checked },
                    }))
                  }
                />
                <CheckboxField
                  label="Hide item reward icons until complete"
                  checked={selectedMission.rewards.hideItemRewardsUntilComplete}
                  onChange={(checked) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, hideItemRewardsUntilComplete: checked },
                    }))
                  }
                />
                <CheckboxField
                  label="Hide all mod reward icons"
                  checked={selectedMission.rewards.hideModRewards}
                  onChange={(checked) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, hideModRewards: checked },
                    }))
                  }
                />
                <CheckboxField
                  label="Hide mod reward icons until complete"
                  checked={selectedMission.rewards.hideModRewardsUntilComplete}
                  onChange={(checked) =>
                    updateSelected((draft) => ({
                      ...draft,
                      rewards: { ...draft.rewards, hideModRewardsUntilComplete: checked },
                    }))
                  }
                />
              </div>

              <RewardItemListEditor
                label="Reward Items"
                values={selectedMission.rewards.itemRewards}
                options={itemOptions}
                placeholder="Search item name or id"
                emptyText="No reward items attached."
                onChange={(next) =>
                  updateSelected((draft) => ({
                    ...draft,
                    rewards: { ...draft.rewards, itemRewards: next },
                  }))
                }
              />

              <RewardModListEditor
                label="Reward Mods"
                values={selectedMission.rewards.modRewards}
                options={modOptions}
                placeholder="Search mod name or id"
                emptyText="No reward mods attached."
                onChange={(next) =>
                  updateSelected((draft) => ({
                    ...draft,
                    rewards: { ...draft.rewards, modRewards: next },
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
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => setObjectivesCollapsed((value) => !value)}>
                  {objectivesCollapsed ? "Expand Section" : "Collapse Section"}
                </button>
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
            </div>

            {objectivesCollapsed ? null : <div className="space-y-4">
              {selectedMission.steps.map((step, stepIndex) => (
                <MissionStepEditor
                  key={step.key}
                  step={step}
                  stepIndex={stepIndex}
                  totalSteps={selectedMission.steps.length}
                  itemOptions={itemOptions}
                  abilityOptions={abilityOptions}
                  statusEffectOptions={statusEffectOptions}
                  mobOptions={mobOptions}
                  mineableAsteroidOptions={mineableAsteroidOptions}
                  zoneOptions={zoneOptions}
                  conversationOptions={conversationIdOptions}
                  collapsedObjectiveKeys={collapsedObjectiveKeys}
                  onChange={(nextStep) => updateStep(stepIndex, () => nextStep)}
                  onToggleObjectiveCollapse={toggleObjectiveCollapsed}
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
            </div>}
          </div>

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Conversations</h3>
                <div className="text-sm text-white/60">
                  Build conversation ids, beats, and player responses here. Talk objectives should reference the appropriate conversation_id.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => setConversationsCollapsed((value) => !value)}>
                  {conversationsCollapsed ? "Expand Section" : "Collapse Section"}
                </button>
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
            </div>

            {conversationsCollapsed ? null : selectedMission.conversations.length ? (
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

                    <div className="mt-4">
                      <LookupIdListEditor
                        label="Mission Dialogue Contacts"
                        values={selectedMission.dialogParticipants}
                        options={commsOptions}
                        placeholder="Search comms contact name or id"
                        emptyText="No dialogue contacts selected for this mission yet."
                        helperText="This is an authoring-only mission speaker pool. Speaker dropdowns below use only the contacts selected here."
                        onChange={(next) => updateSelected((draft) => ({ ...draft, dialogParticipants: next }))}
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      {conversation.beats.map((beat, beatIndex) => (
                        <div key={beat.key} className="rounded border border-white/10 bg-black/20 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold">Beat {beatIndex + 1}</div>
                            <div className="flex flex-wrap gap-2">
                              <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={() => toggleConversationBeatCollapsed(beat.key)}>
                                {collapsedConversationBeatKeys.has(beat.key) ? "Expand" : "Collapse"}
                              </button>
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

                          {collapsedConversationBeatKeys.has(beat.key) ? null : (
                            <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <SelectLookupField
                              label="Speaker"
                              value={beat.speaker}
                              options={buildSpeakerOptions(missionDialogueOptions, beat.speaker)}
                              placeholder="Select a mission dialogue contact"
                              onChange={(value) => {
                                updateBeat(conversationIndex, beatIndex, (current) => ({ ...current, speaker: value }));
                                queueBeatFocus(beat.key);
                              }}
                            />
                          </div>

                          <TextAreaField
                            label="Dialogue Text"
                            value={beat.text}
                            onChange={(value) => updateBeat(conversationIndex, beatIndex, (current) => ({ ...current, text: value }))}
                            placeholder="What this speaker says in this beat."
                            textareaRef={(node) => {
                              beatTextAreaRefs.current[beat.key] = node;
                            }}
                          />

                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="label">Responses</div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => addBeatAfter(conversationIndex, beatIndex, beat.speaker)}
                                >
                                  Add Beat
                                </button>
                                <button
                                  className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => addResponse(conversationIndex, beatIndex)}
                                >
                                  Add Response
                                </button>
                              </div>
                            </div>

                            {beat.responses.length ? (
                              <div className="space-y-2">
                                {beat.responses.map((response, responseIndex) => (
                                  <div key={response.key} className="space-y-3 rounded-lg border border-white/10 bg-black/15 p-3">
                                    <div className="flex gap-2">
                                      <input
                                        className="input"
                                        value={response.text}
                                        ref={(node) => {
                                          responseInputRefs.current[response.key] = node;
                                        }}
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

                                    <div className="grid gap-3 md:grid-cols-3">
                                      <Field
                                        label="Mission Action"
                                        value={response.missionAction}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            missionAction: value,
                                            missionActionKey: current.missionActionKey || "mission_action",
                                          }))
                                        }
                                        placeholder="start_escort"
                                      />
                                      <ResponseBooleanStateField
                                        label="Complete On Response"
                                        value={response.completeOnResponse}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            completeOnResponse: value,
                                          }))
                                        }
                                      />
                                      <ResponseBooleanStateField
                                        label="Complete Objective"
                                        value={response.completeObjective}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            completeObjective: value,
                                          }))
                                        }
                                      />
                                      <ResponseBooleanStateField
                                        label="Advance Objective"
                                        value={response.advanceObjective}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            advanceObjective: value,
                                          }))
                                        }
                                      />
                                      <ResponseBooleanStateField
                                        label="Defer Completion"
                                        value={response.deferCompletion}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            deferCompletion: value,
                                          }))
                                        }
                                      />
                                      <ResponseBooleanStateField
                                        label="Defer Objective Completion"
                                        value={response.deferObjectiveCompletion}
                                        onChange={(value) =>
                                          updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                            ...current,
                                            deferObjectiveCompletion: value,
                                          }))
                                        }
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/50">
                                No player responses on this beat.
                              </div>
                            )}
                          </div>
                            </>
                          )}
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
    </div>
  );
}

function MissionStepEditor({
  step,
  stepIndex,
  totalSteps,
  itemOptions,
  abilityOptions,
  statusEffectOptions,
  mobOptions,
  mineableAsteroidOptions,
  zoneOptions,
  conversationOptions,
  collapsedObjectiveKeys,
  onChange,
  onAddObjective,
  onToggleObjectiveCollapse,
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
  abilityOptions: LookupOption[];
  statusEffectOptions: LookupOption[];
  mobOptions: LookupOption[];
  mineableAsteroidOptions: LookupOption[];
  zoneOptions: LookupOption[];
  conversationOptions: string[];
  collapsedObjectiveKeys: Set<string>;
  onChange: (next: MissionStepDraft) => void;
  onAddObjective: () => void;
  onToggleObjectiveCollapse: (objectiveKey: string) => void;
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

      {normalizedMode === "all" ? (
        <TextAreaField
          label="Step Description"
          value={step.description}
          onChange={(value) => onChange({ ...step, description: value })}
          helperText={modeHelpText}
          placeholder="Main summary text used in the mission popup while this ALL-mode step is active."
        />
      ) : null}

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
            abilityOptions={abilityOptions}
            statusEffectOptions={statusEffectOptions}
            mobOptions={mobOptions}
            mineableAsteroidOptions={mineableAsteroidOptions}
            zoneOptions={zoneOptions}
            conversationOptions={conversationOptions}
            collapsed={collapsedObjectiveKeys.has(objective.key)}
            onChange={(next) => onUpdateObjective(objectiveIndex, () => next)}
            onToggleCollapse={() => onToggleObjectiveCollapse(objective.key)}
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
  abilityOptions,
  statusEffectOptions,
  mobOptions,
  mineableAsteroidOptions,
  zoneOptions,
  conversationOptions,
  collapsed,
  onChange,
  onToggleCollapse,
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
  abilityOptions: LookupOption[];
  statusEffectOptions: LookupOption[];
  mobOptions: LookupOption[];
  mineableAsteroidOptions: LookupOption[];
  zoneOptions: LookupOption[];
  conversationOptions: string[];
  collapsed: boolean;
  onChange: (next: MissionObjectiveDraft) => void;
  onToggleCollapse: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const type = objective.type.trim().toLowerCase();
  const usesMultiTarget = type === "collect" || type === "kill" || type === "mine";
  const usesMobTarget =
    type === "talk" ||
    type === "scan" ||
    type === "collect" ||
    type === "deliver" ||
    type === "kill" ||
    type === "mine" ||
    type === "sell" ||
    type === "buy" ||
    type === "hail" ||
    type === "repair" ||
    type === "status_applied" ||
    type === "ability_success";
  const targetOptions = type === "mine" ? mineableAsteroidOptions : mobOptions;
  const targetPlaceholder = type === "mine" ? "Search mineable asteroid or id" : "Search mob name or id";
  const targetTypePlaceholder = type === "mine" ? "mineable_asteroid" : "ship";

  return (
    <div className="rounded border border-white/10 bg-black/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Objective {objectiveIndex + 1} · {OBJECTIVE_LABELS[type] ?? "Objective"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={onToggleCollapse}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
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

      {collapsed ? null : (
        <>
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
              options={targetOptions}
              placeholder={targetPlaceholder}
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
            options={targetOptions}
            placeholder={targetPlaceholder}
          />
        ) : null}

        {(type === "scan" || type === "mine" || type === "status_applied" || type === "ability_success") ? (
          <div className="md:col-span-2">
            <TokenEditor
              label="Target Tags"
              values={objective.targetTags}
              suggestions={[]}
              placeholder="ore_item_89"
              emptyText="No tag filters attached."
              onChange={(next) => onChange({ ...objective, targetTags: next })}
            />
          </div>
        ) : null}

        {(type === "scan" || type === "mine" || type === "status_applied" || type === "ability_success") ? (
          <Field
            label="Target Type"
            value={objective.targetType}
            onChange={(value) => onChange({ ...objective, targetType: value })}
            placeholder={targetTypePlaceholder}
          />
        ) : null}

        {type === "scan" ? (
          <>
            <div className="md:col-span-2">
              <LookupIdListEditor
                label="Required Player Status Effects"
                values={objective.requiredPlayerStatusEffectIds}
                options={statusEffectOptions}
                placeholder="Search status effect name or id"
                emptyText="No player status effect required."
                onChange={(next) => onChange({ ...objective, requiredPlayerStatusEffectIds: next })}
              />
            </div>
            <div className="md:col-span-2">
              <LookupIdListEditor
                label="Target Status Effects"
                values={objective.statusEffectIds}
                options={statusEffectOptions}
                placeholder="Search status effect name or id"
                emptyText="No target status effect filter attached."
                onChange={(next) => onChange({ ...objective, statusEffectIds: next })}
              />
            </div>
          </>
        ) : null}

        {type === "status_applied" ? (
          <>
            <div className="md:col-span-2">
              <LookupIdListEditor
                label="Status Effects"
                values={objective.statusEffectIds}
                options={statusEffectOptions}
                placeholder="Search status effect name or id"
                emptyText="No status effect selected."
                onChange={(next) => onChange({ ...objective, statusEffectIds: next })}
              />
            </div>
            <div className="md:col-span-2">
              <LookupIdListEditor
                label="Ability Filters"
                values={objective.abilityIds}
                options={abilityOptions}
                placeholder="Search ability name or id"
                emptyText="No ability filter attached."
                onChange={(next) => onChange({ ...objective, abilityIds: next })}
              />
            </div>
          </>
        ) : null}

        {type === "ability_success" ? (
          <div className="md:col-span-2">
            <LookupIdListEditor
              label="Abilities"
              values={objective.abilityIds}
              options={abilityOptions}
              placeholder="Search ability name or id"
              emptyText="No ability selected."
              onChange={(next) => onChange({ ...objective, abilityIds: next })}
            />
          </div>
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
            <div className="md:col-span-2">
              <CheckboxField
                label="Complete Only From Response"
                checked={objective.completeOnResponse}
                onChange={(checked) => onChange({ ...objective, completeOnResponse: checked })}
              />
            </div>
          </>
        ) : null}

        {type === "escort" ? (
          <>
            <LookupIdField
              label="Escort Mob ID"
              value={objective.escortMobId}
              onChange={(value) => onChange({ ...objective, escortMobId: value })}
              options={mobOptions}
              placeholder="Search escort mob name or id"
            />
            <LookupIdField
              label="Destination Zone ID"
              value={objective.targetZoneId}
              onChange={(value) => onChange({ ...objective, targetZoneId: value })}
              options={zoneOptions}
              placeholder="Search destination zone name or id"
            />
            <Field
              label="Destination Radius"
              value={objective.destinationRadius}
              inputMode="numeric"
              onChange={(value) => onChange({ ...objective, destinationRadius: value })}
              placeholder="900"
            />
            <Field
              label="Escort Speed"
              value={objective.escortSpeed}
              inputMode="numeric"
              onChange={(value) => onChange({ ...objective, escortSpeed: value })}
              placeholder="240"
            />
            <div className="md:col-span-2">
              <Field
                label="Arrival Message"
                value={objective.arrivalMessage}
                onChange={(value) => onChange({ ...objective, arrivalMessage: value })}
                placeholder="The escort has reached the destination."
              />
            </div>
          </>
        ) : null}

        {(type === "scan" ||
          type === "collect" ||
          type === "acquire" ||
          type === "deliver" ||
          type === "kill" ||
          type === "mine" ||
          type === "buy" ||
          type === "sell" ||
          type === "status_applied" ||
          type === "ability_success") ? (
          <Field
            label="Count"
            value={objective.count}
            inputMode="numeric"
            onChange={(value) => onChange({ ...objective, count: value })}
          />
        ) : null}

        {(type === "collect" || type === "acquire" || type === "deliver" || type === "buy" || type === "sell") ? (
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

      {(type === "status_applied" || type === "ability_success") ? (
        <div className="mt-4">
          <CheckboxField
            label="Unique Targets"
            checked={objective.uniqueTargets}
            onChange={(checked) => onChange({ ...objective, uniqueTargets: checked })}
          />
        </div>
      ) : null}

      {type === "escort" ? (
        <div className="mt-4">
          <EscortAmbushEditor
            ambushes={objective.ambushes}
            mobOptions={mobOptions}
            onChange={(ambushes) => onChange({ ...objective, ambushes })}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {mode === "all" ? null : (
          <TextAreaField
            label="Description"
            value={objective.description}
            onChange={(value) => onChange({ ...objective, description: value })}
            helperText="This description is used in the mission popup while this objective is active."
            placeholder="What the player sees in the mission popup."
          />
        )}
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
        </>
      )}
    </div>
  );
}

function EscortAmbushEditor({
  ambushes,
  mobOptions,
  onChange,
}: {
  ambushes: MissionEscortAmbushDraft[];
  mobOptions: LookupOption[];
  onChange: (next: MissionEscortAmbushDraft[]) => void;
}) {
  function updateAt(index: number, next: MissionEscortAmbushDraft) {
    onChange(ambushes.map((ambush, currentIndex) => (currentIndex === index ? next : ambush)));
  }

  return (
    <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Escort Ambushes</div>
          <div className="mt-1 text-xs text-white/50">Optional mobs spawned against the escort as route progress reaches each threshold.</div>
        </div>
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => onChange([...ambushes, createMissionEscortAmbushDraft()])}>
          Add Ambush
        </button>
      </div>

      {ambushes.length ? (
        <div className="space-y-3">
          {ambushes.map((ambush, index) => (
            <div key={ambush.key} className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold">Ambush {index + 1}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                    onClick={() =>
                      onChange([
                        ...ambushes.slice(0, index + 1),
                        { ...ambush, key: `ambush_${Date.now()}_${index}` },
                        ...ambushes.slice(index + 1),
                      ])
                    }
                  >
                    Duplicate
                  </button>
                  <button className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30" onClick={() => onChange(ambushes.filter((_, currentIndex) => currentIndex !== index))}>
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <LookupIdField
                    label="Ambush Mob ID"
                    value={ambush.mobId}
                    options={mobOptions}
                    placeholder="Search ambush mob name or id"
                    onChange={(value) => updateAt(index, { ...ambush, mobId: value })}
                  />
                </div>
                <Field
                  label="Count"
                  value={ambush.count}
                  inputMode="numeric"
                  onChange={(value) => updateAt(index, { ...ambush, count: value })}
                  placeholder="1"
                />
                <Field
                  label="Progress"
                  value={ambush.progress}
                  inputMode="decimal"
                  onChange={(value) => updateAt(index, { ...ambush, progress: value })}
                  placeholder="0.5"
                />
                <Field
                  label="Spawn Distance"
                  value={ambush.spawnDistance}
                  inputMode="numeric"
                  onChange={(value) => updateAt(index, { ...ambush, spawnDistance: value })}
                  placeholder="2500"
                />
                <Field
                  label="Angle Deg"
                  value={ambush.angleDeg}
                  inputMode="decimal"
                  onChange={(value) => updateAt(index, { ...ambush, angleDeg: value })}
                  placeholder="-35"
                />
                <Field
                  label="Level"
                  value={ambush.level}
                  inputMode="numeric"
                  onChange={(value) => updateAt(index, { ...ambush, level: value })}
                  placeholder="5"
                />
                <Field
                  label="Rank"
                  value={ambush.rank}
                  onChange={(value) => updateAt(index, { ...ambush, rank: value })}
                  placeholder="normal"
                />
                <Field
                  label="Initial Threat"
                  value={ambush.initialThreat}
                  inputMode="numeric"
                  onChange={(value) => updateAt(index, { ...ambush, initialThreat: value })}
                  placeholder="50"
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">
          No escort ambushes configured.
        </div>
      )}
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
  helperText,
  onChange,
}: {
  label: string;
  values: string[];
  options: LookupOption[];
  placeholder: string;
  emptyText: string;
  helperText?: string;
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

      {helperText ? <div className="text-xs text-white/50">{helperText}</div> : null}

      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.id} label={option.meta ? `${option.label} · ${option.meta}` : option.label} />
        ))}
      </datalist>
    </div>
  );
}

function RewardItemListEditor({
  label,
  values,
  options,
  placeholder,
  emptyText,
  onChange,
}: {
  label: string;
  values: MissionRewardItemDraft[];
  options: LookupOption[];
  placeholder: string;
  emptyText: string;
  onChange: (next: MissionRewardItemDraft[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [countDraft, setCountDraft] = useState("1");
  const listId = useId();

  function commit(raw: string) {
    const nextItemId = resolveLookupValue(raw, options);
    const normalizedCount = countDraft.trim() || "1";
    if (!nextItemId || values.some((value) => value.itemId === nextItemId)) {
      setDraft("");
      setCountDraft("1");
      return;
    }
    onChange([...values, createRewardItemDraft(nextItemId, normalizedCount)]);
    setDraft("");
    setCountDraft("1");
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
            const option = options.find((entry) => entry.id === value.itemId);
            return (
              <div key={value.key} className="grid gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_96px_auto_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium">{option?.label ?? value.itemId}</div>
                  <div className="truncate text-xs text-white/50">
                    {value.itemId}
                    {option?.meta ? ` · ${option.meta}` : ""}
                  </div>
                </div>
                <label className="space-y-1">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">Count</div>
                  <input
                    className="input h-9"
                    inputMode="numeric"
                    value={value.count}
                    onChange={(event) => onChange(values.map((entry) => (entry.key === value.key ? { ...entry, count: event.target.value } : entry)))}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={value.hidden}
                    onChange={(event) => onChange(values.map((entry) => (entry.key === value.key ? { ...entry, hidden: event.target.checked } : entry)))}
                  />
                  Hidden
                </label>
                <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={() => onChange(values.filter((entry) => entry.key !== value.key))}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-white/50">{emptyText}</div>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
        <input
          className="input"
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
        <input
          className="input"
          inputMode="numeric"
          value={countDraft}
          onChange={(event) => setCountDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={(event) => event.currentTarget.select()}
          placeholder="Count"
        />
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => commit(draft)}>
          Add
        </button>
      </div>

      <div className="text-xs text-white/50">Exports to rewards.items as objects with id, count, and optional hidden state.</div>

      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.id} label={option.meta ? `${option.label} · ${option.meta}` : option.label} />
        ))}
      </datalist>
    </div>
  );
}

function RewardModListEditor({
  label,
  values,
  options,
  placeholder,
  emptyText,
  onChange,
}: {
  label: string;
  values: MissionRewardModDraft[];
  options: LookupOption[];
  placeholder: string;
  emptyText: string;
  onChange: (next: MissionRewardModDraft[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit(raw: string) {
    const nextModId = resolveLookupValue(raw, options);
    if (!nextModId || values.some((value) => value.modId === nextModId)) {
      setDraft("");
      return;
    }
    onChange([...values, createRewardModDraft(nextModId)]);
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
            const option = options.find((entry) => entry.id === value.modId);
            return (
              <div key={value.key} className="grid gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium">{option?.label ?? value.modId}</div>
                  <div className="truncate text-xs text-white/50">
                    {value.modId}
                    {option?.meta ? ` · ${option.meta}` : ""}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={value.hidden}
                    onChange={(event) => onChange(values.map((entry) => (entry.key === value.key ? { ...entry, hidden: event.target.checked } : entry)))}
                  />
                  Hidden
                </label>
                <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={() => onChange(values.filter((entry) => entry.key !== value.key))}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-white/50">{emptyText}</div>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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

      <div className="text-xs text-white/50">Visible mods export as ids. Hidden mods export as objects with id and hidden state.</div>

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

function SelectLookupField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: LookupOption[];
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const selected = options.find((option) => option.id === value.trim());

  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder || "Select an option"}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="text-xs text-white/50">
        {selected ? `${selected.id}${selected.meta ? ` · ${selected.meta}` : ""}` : "Only mission-selected dialogue contacts appear in this dropdown."}
      </div>
    </label>
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
  textareaRef,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  helperText?: string;
  textareaRef?: (node: HTMLTextAreaElement | null) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <textarea ref={textareaRef} className="input min-h-24" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {helperText ? <div className="text-xs text-white/50">{helperText}</div> : null}
    </label>
  );
}

function MissionHeaderImageSelect({
  value,
  options,
  version,
  onChange,
}: {
  value: string;
  options: MissionHeaderImageOption[];
  version?: string;
  onChange: (next: string) => void;
}) {
  const [search, setSearch] = useState("");
  const trimmedValue = value.trim();
  const hasCurrentValue = Boolean(trimmedValue) && !options.some((option) => option.resPath === trimmedValue);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => [option.fileName, option.label, option.resPath].join(" ").toLowerCase().includes(query));
  }, [options, search]);
  const previewSrc = trimmedValue ? buildIconSrc(trimmedValue, trimmedValue, trimmedValue, version) : "";

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-3 md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Image Header</div>
          <div className="mt-1 text-xs text-white/45">
            Choose from <code>res://assets/missions/</code>, or edit the path directly if needed.
          </div>
        </div>
        <div className="shrink-0 rounded border border-white/10 px-3 py-2 text-xs text-white/55">
          {options.length} header option{options.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b] lg:h-28">
          {previewSrc ? (
            <img src={previewSrc} alt={trimmedValue || "Mission header"} className="h-full w-full object-cover" />
          ) : (
            <div className="px-3 text-center text-xs text-white/35">No header selected</div>
          )}
        </div>
        <div className="space-y-2">
          <input
            className="input"
            value={value}
            placeholder="res://assets/missions/header_example.png"
            onChange={(event) => onChange(event.target.value)}
          />
          <input
            className="input"
            value={search}
            placeholder="Search mission headers by file name or path..."
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="text-xs text-white/50">
            Only <code>header_</code> images from <code>assets/missions</code> are listed.
          </div>
          {hasCurrentValue ? (
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
              Current path is not in the loaded mission header catalog.
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto pr-1">
        {filteredOptions.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredOptions.map((option) => {
              const isSelected = trimmedValue === option.resPath;
              return (
                <button
                  key={option.resPath}
                  type="button"
                  className={`rounded-xl border p-2 text-left transition ${
                    isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                  }`}
                  onClick={() => onChange(option.resPath)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                      <img src={buildIconSrc(option.resPath, option.fileName, option.label, version)} alt={option.fileName} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{option.fileName}</div>
                      <div className="mt-1 truncate font-mono text-xs text-white/45">{option.resPath}</div>
                      {isSelected ? <div className="mt-2 text-xs font-medium text-cyan-100">Selected</div> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
            No mission headers matched the current search.
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
  allLabel,
  allValue = FILTER_ALL,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  allLabel?: string;
  allValue?: string;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel ? <option value={allValue}>{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {MODE_LABELS[option] ?? OBJECTIVE_LABELS[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResponseBooleanStateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MissionResponseBooleanState;
  onChange: (next: MissionResponseBooleanState) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="label">{label}</div>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value as MissionResponseBooleanState)}>
        <option value="unset">Unset</option>
        <option value="true">True</option>
        <option value="false">False</option>
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

function createRewardItemDraft(itemId: string, count = "1"): MissionRewardItemDraft {
  return {
    key: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? `reward_item_${crypto.randomUUID().slice(0, 8)}` : `reward_item_${Math.random().toString(36).slice(2, 10)}`,
    itemId,
    count,
    hidden: false,
  };
}

function createRewardModDraft(modId: string): MissionRewardModDraft {
  return {
    key: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? `reward_mod_${crypto.randomUUID().slice(0, 8)}` : `reward_mod_${Math.random().toString(36).slice(2, 10)}`,
    modId,
    hidden: false,
  };
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

function parseAbilityLookupOptions(value: unknown): LookupOption[] {
  if (!Array.isArray(value)) return [];
  const options = value
    .map((entry): LookupOption | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const ability = entry as Record<string, unknown>;
      const id = String(ability.id ?? "").trim();
      if (!id) return null;
      const name = String(ability.name ?? "").trim();
      const deliveryType = String(ability.deliveryType ?? "").trim();
      return {
        id,
        label: name || id,
        ...(deliveryType ? { meta: deliveryType } : {}),
      };
    })
    .filter((entry): entry is LookupOption => entry !== null);
  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function parseStatusEffectLookupOptions(value: unknown): LookupOption[] {
  if (!Array.isArray(value)) return [];
  const options = value
    .map((entry): LookupOption | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const effect = entry as Record<string, unknown>;
      const id = String(effect.numericId ?? "").trim();
      if (!id) return null;
      const name = String(effect.name ?? "").trim();
      const effectId = String(effect.effectId ?? "").trim();
      return {
        id,
        label: name || effectId || id,
        ...(effectId && effectId !== name ? { meta: effectId } : {}),
      };
    })
    .filter((entry): entry is LookupOption => entry !== null);
  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function parseMineableAsteroidLookupOptions(text: string): LookupOption[] {
  try {
    const parsed = parseLooseJson<{ elements?: unknown[] }>(text);
    const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
    const options: LookupOption[] = [];
    for (const entry of elements) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const element = entry as Record<string, unknown>;
      if (String(element.type ?? "").trim() !== "mineable_asteroid") continue;
      const id = String(element.id ?? "").trim();
      if (!id) continue;

      const data = element.data && typeof element.data === "object" && !Array.isArray(element.data) ? (element.data as Record<string, unknown>) : {};
      const oreName = String(data.ore_item_name ?? data.ore_name ?? "").trim();
      const sector = Array.isArray(element.sector_id) ? element.sector_id.map((value) => String(value)).join(",") : "";
      const zoneId = String(element.zone_id ?? data.zone_id ?? "").trim();
      options.push({
        id,
        label: String(element.name ?? id).trim() || id,
        meta: [oreName, sector ? `Sector ${sector}` : "", zoneId].filter(Boolean).join(" · "),
      });
    }
    return options.sort((left, right) => left.label.localeCompare(right.label));
  } catch {
    return [];
  }
}

function parseZoneLookupOptions(text: string): LookupOption[] {
  try {
    const parsed = parseLooseJson<Record<string, unknown>>(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

    return Object.entries(parsed)
      .map(([id, rawZone]) => {
        const zone = rawZone && typeof rawZone === "object" && !Array.isArray(rawZone) ? (rawZone as Record<string, unknown>) : {};
        const name = String(zone.name ?? zone.poi_label ?? id).trim() || id;
        const sector = Array.isArray(zone.sector_id) ? zone.sector_id.map((value) => String(value)).join(",") : "";
        const archetype = String(zone.archetype ?? "").trim();
        return {
          id,
          label: name,
          meta: [sector ? `Sector ${sector}` : "", archetype].filter(Boolean).join(" · "),
        } satisfies LookupOption;
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  } catch {
    return [];
  }
}

function parseCommsLookupOptions(text: string): LookupOption[] {
  try {
    const parsed = parseLooseJson<Record<string, { name?: unknown; greeting?: unknown }>>(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed)
      .map(([id, value]) => ({
        id,
        label: String((value && typeof value === "object" && "name" in value ? value.name : "") ?? id).trim() || id,
        meta: String((value && typeof value === "object" && "greeting" in value ? value.greeting : "") ?? "").trim() || undefined,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  } catch {
    return [];
  }
}

function buildMissionDialogueOptions(selectedIds: string[], allOptions: LookupOption[]) {
  return selectedIds
    .map((id) => {
      const matched = allOptions.find((option) => option.id === id);
      return matched ?? { id, label: id };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function buildSpeakerOptions(options: LookupOption[], currentSpeaker: string) {
  const speakerId = currentSpeaker.trim();
  if (!speakerId) return options;
  if (options.some((option) => option.id === speakerId)) return options;
  return [{ id: speakerId, label: speakerId }, ...options];
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
