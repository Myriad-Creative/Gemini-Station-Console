"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildIconSrc } from "@lib/icon-src";
import { parseLooseJson } from "@lib/json";
import {
  createMissionConversationBeatDraft,
  createMissionConversationResponseDraft,
  normalizeImportedMission,
  validateMissionDrafts,
  type MissionConversationBeatDraft,
  type MissionConversationDraft,
  type MissionConversationResponseDraft,
  type MissionDraft,
  type MissionObjectiveDraft,
  type MissionResponseBooleanState,
} from "@lib/mission-authoring";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import type { MissionImportSummary, NormalizedMission } from "@lib/mission-lab/types";
import { DEFAULT_COMMS_PORTRAIT, resolvedPortraitPath } from "@lib/comms-manager/utils";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type CommsSpeaker = {
  id: string;
  name: string;
  portrait: string;
  greeting: string;
};

type StatusState = {
  tone: "success" | "error" | "neutral";
  message: string;
};

const OBJECTIVE_LABELS: Record<string, string> = {
  talk: "Talk",
  scan: "Scan",
  collect: "Collect",
  acquire: "Acquire",
  deliver: "Deliver",
  kill: "Kill",
  mine: "Mine",
  sell: "Sell",
  buy: "Buy",
  travel: "Travel",
  explore: "Explore",
  hail: "Hail",
  repair: "Repair",
};

function parseCommsSpeakers(text: string): CommsSpeaker[] {
  try {
    const parsed = parseLooseJson<Record<string, { name?: unknown; portrait?: unknown; greeting?: unknown }>>(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed)
      .map(([id, value]) => ({
        id,
        name: String(value?.name ?? id).trim() || id,
        portrait: String(value?.portrait ?? "").trim(),
        greeting: String(value?.greeting ?? "").trim(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

function objectiveSummary(objective: MissionObjectiveDraft | null | undefined) {
  if (!objective) return "Mission can be completed or turned in.";
  const primary = objective.objective.trim() || objective.description.trim() || objective.progressLabel.trim();
  if (primary) return primary;
  const label = OBJECTIVE_LABELS[objective.type.trim().toLowerCase()] ?? (objective.type.trim() || "Objective");
  const target =
    objective.targetIds[0] ||
    objective.targetTags[0] ||
    objective.itemId ||
    objective.contactId ||
    objective.sectorId ||
    objective.region ||
    objective.targetType;
  return target ? `${label}: ${target}` : label;
}

function conversationLookahead(mission: MissionDraft, conversationId: string) {
  const id = conversationId.trim();
  if (!id) return ["No conversation id is set, so no talk objective can point at this conversation yet."];

  const flat = mission.steps.flatMap((step, stepIndex) =>
    step.objectives.map((objective, objectiveIndex) => ({
      objective,
      stepIndex,
      objectiveIndex,
    })),
  );
  const matches = flat.filter(({ objective }) => objective.conversationId.trim() === id);
  if (!matches.length) return [`No talk objective currently points at conversation "${id}".`];

  const results = matches.map((match) => {
    const index = flat.findIndex((entry) => entry.stepIndex === match.stepIndex && entry.objectiveIndex === match.objectiveIndex);
    const nextObjective = index >= 0 ? flat[index + 1]?.objective : null;
    return objectiveSummary(nextObjective);
  });
  return Array.from(new Set(results));
}

function speakerLabel(speaker: CommsSpeaker | null, fallbackId: string) {
  if (!speaker) return fallbackId || "Unknown Speaker";
  return speaker.name || speaker.id;
}

function missionSearchText(mission: MissionDraft) {
  return [
    mission.id,
    mission.title,
    mission.faction,
    mission.level,
    mission.arcs.join(" "),
    mission.tags.join(" "),
    mission.conversations.map((conversation) => conversation.id).join(" "),
    mission.conversations.flatMap((conversation) => conversation.beats.flatMap((beat) => [beat.speaker, beat.text, ...beat.responses.map((response) => response.text)])).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export default function MissionDialoguePage() {
  const sessionId = useMissionLabSessionId();
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [missions, setMissions] = useState<MissionDraft[]>([]);
  const [referenceMissions, setReferenceMissions] = useState<NormalizedMission[]>([]);
  const [workspaceSummary, setWorkspaceSummary] = useState<MissionImportSummary | null>(null);
  const [speakers, setSpeakers] = useState<CommsSpeaker[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingResponseFocusKey, setPendingResponseFocusKey] = useState<string | null>(null);
  const responseRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      try {
        const [workspaceResponse, commsResponse] = await Promise.all([
          fetch("/api/mission-lab/workspace", { headers: buildMissionLabSessionHeaders(sessionId) }),
          fetch("/api/settings/data/source?kind=comms"),
        ]);
        const workspaceJson = await workspaceResponse.json().catch(() => ({ summary: null, missions: [] }));
        const commsJson = await commsResponse.json().catch(() => ({ ok: false, text: "" }));
        if (cancelled) return;

        const normalizedMissions = Array.isArray(workspaceJson.missions) ? (workspaceJson.missions as NormalizedMission[]) : [];
        setReferenceMissions(normalizedMissions);
        setMissions(normalizedMissions.map((mission) => normalizeImportedMission(mission.raw, { sourceRelativePath: mission.relativePath })));
        setWorkspaceSummary(workspaceJson.summary ?? null);
        setSpeakers(commsJson.ok && typeof commsJson.text === "string" ? parseCommsSpeakers(commsJson.text) : []);
        setSelectedIndex(0);
        setStatus(null);
      } catch (error) {
        if (cancelled) return;
        setReferenceMissions([]);
        setMissions([]);
        setWorkspaceSummary(null);
        setStatus({ tone: "error", message: error instanceof Error ? error.message : "Could not load mission dialogue data." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (selectedIndex <= missions.length - 1) return;
    setSelectedIndex(Math.max(0, missions.length - 1));
  }, [missions.length, selectedIndex]);

  useEffect(() => {
    if (!pendingResponseFocusKey) return;
    const frame = window.requestAnimationFrame(() => {
      const target = responseRefs.current[pendingResponseFocusKey];
      if (!target) return;
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
      setPendingResponseFocusKey(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [missions, pendingResponseFocusKey]);

  const knownMissionIds = useMemo(
    () => Array.from(new Set([...referenceMissions.map((mission) => mission.id), ...missions.map((mission) => mission.id)].map((id) => id.trim()).filter(Boolean))),
    [missions, referenceMissions],
  );
  const selectedMission = missions[Math.max(0, Math.min(selectedIndex, Math.max(0, missions.length - 1)))] ?? null;
  const selectedValidation = useMemo(
    () => validateMissionDrafts(selectedMission ? [selectedMission] : [], knownMissionIds).filter((issue) => issue.level === "error"),
    [knownMissionIds, selectedMission],
  );
  const speakerById = useMemo(() => new Map(speakers.map((speaker) => [speaker.id, speaker])), [speakers]);
  const filteredMissions = useMemo(
    () =>
      missions
        .map((mission, index) => ({ mission, index }))
        .filter(({ mission }) => !deferredSearch || missionSearchText(mission).includes(deferredSearch)),
    [deferredSearch, missions],
  );

  function setMissionAt(index: number, next: MissionDraft) {
    setMissions((current) => current.map((mission, missionIndex) => (missionIndex === index ? next : mission)));
  }

  function updateSelected(updater: (mission: MissionDraft) => MissionDraft) {
    if (!selectedMission) return;
    setMissionAt(selectedIndex, updater(selectedMission));
  }

  function updateConversation(conversationIndex: number, updater: (conversation: MissionConversationDraft) => MissionConversationDraft) {
    updateSelected((mission) => ({
      ...mission,
      conversations: mission.conversations.map((conversation, index) => (index === conversationIndex ? updater(conversation) : conversation)),
    }));
  }

  function updateBeat(conversationIndex: number, beatIndex: number, updater: (beat: MissionConversationBeatDraft) => MissionConversationBeatDraft) {
    updateConversation(conversationIndex, (conversation) => ({
      ...conversation,
      beats: conversation.beats.map((beat, index) => (index === beatIndex ? updater(beat) : beat)),
    }));
  }

  function updateResponse(conversationIndex: number, beatIndex: number, responseIndex: number, updater: (response: MissionConversationResponseDraft) => MissionConversationResponseDraft) {
    updateBeat(conversationIndex, beatIndex, (beat) => ({
      ...beat,
      responses: beat.responses.map((response, index) => (index === responseIndex ? updater(response) : response)),
    }));
  }

  function changeBeatSpeaker(conversationIndex: number, beatIndex: number, speakerId: string) {
    updateSelected((mission) => {
      const nextParticipants = speakerId && !mission.dialogParticipants.includes(speakerId) ? [...mission.dialogParticipants, speakerId] : mission.dialogParticipants;
      return {
        ...mission,
        dialogParticipants: nextParticipants,
        conversations: mission.conversations.map((conversation, cIndex) =>
          cIndex === conversationIndex
            ? {
                ...conversation,
                beats: conversation.beats.map((beat, bIndex) => (bIndex === beatIndex ? { ...beat, speaker: speakerId } : beat)),
              }
            : conversation,
        ),
      };
    });
  }

  function addBeatAfter(conversationIndex: number, beatIndex: number, speaker: string) {
    const nextBeat = createMissionConversationBeatDraft(speaker);
    updateConversation(conversationIndex, (conversation) => {
      const nextBeats = [...conversation.beats];
      nextBeats.splice(beatIndex + 1, 0, nextBeat);
      return { ...conversation, beats: nextBeats };
    });
  }

  function addResponse(conversationIndex: number, beatIndex: number) {
    const response = createMissionConversationResponseDraft();
    updateBeat(conversationIndex, beatIndex, (beat) => ({
      ...beat,
      responses: [...beat.responses, response],
    }));
    setPendingResponseFocusKey(response.key);
  }

  async function saveSelectedMission() {
    if (!selectedMission || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/missions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission: selectedMission, index: selectedIndex, knownMissionIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; savedPath?: string; mission?: MissionDraft };
      if (!response.ok || !payload.ok) {
        setStatus({ tone: "error", message: payload.error || "Could not save mission dialogue to the game folder." });
        return;
      }
      if (payload.mission) setMissionAt(selectedIndex, payload.mission);
      setStatus({ tone: "success", message: `Saved dialogue changes${payload.savedPath ? `: ${payload.savedPath}` : "."}` });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : "Could not save mission dialogue to the game folder." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card text-sm text-white/60">Loading mission dialogue workspace...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Mission Dialogue</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Rewrite mission conversations without the full mission editor around them. Speaker portraits come from Comms.json.
          </p>
        </div>
        <button className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={!selectedMission || saving} onClick={() => void saveSelectedMission()}>
          {saving ? "Saving..." : "Save to game folder"}
        </button>
      </div>

      {!workspaceSummary ? (
        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-white/65">No shared mission workspace is loaded. Set a local game root in Settings first.</div>
          <Link href="/settings" className="btn">
            Open Settings
          </Link>
        </div>
      ) : null}

      {status ? (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
              : status.tone === "error"
                ? "border-red-400/25 bg-red-400/10 text-red-100"
                : "border-white/10 bg-white/5 text-white/70"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="card h-fit space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Mission Library</h2>
            <div className="text-xs text-white/50">
              {missions.length} mission{missions.length === 1 ? "" : "s"} · {filteredMissions.length} shown
            </div>
          </div>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mission, speaker, dialogue, or response..." />
          <div className="max-h-[68vh] space-y-2 overflow-auto pr-1">
            {filteredMissions.map(({ mission, index }) => (
              <button
                key={`${mission.id}-${index}`}
                className={`w-full rounded border px-3 py-2 text-left transition ${
                  index === selectedIndex ? "border-accent bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setSelectedIndex(index)}
              >
                <div className="truncate font-medium">{mission.title || "Untitled mission"}</div>
                <div className="truncate text-xs text-white/55">{mission.id || "missing-id"}</div>
                <div className="mt-1 text-[11px] text-white/45">
                  {mission.conversations.length} conversation{mission.conversations.length === 1 ? "" : "s"} · Level {mission.level || "?"}
                </div>
              </button>
            ))}
            {!filteredMissions.length ? <div className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-white/45">No missions match the search.</div> : null}
          </div>
        </aside>

        <main className="space-y-5">
          {!selectedMission ? (
            <div className="card text-sm text-white/60">Select a mission to edit its dialogue.</div>
          ) : (
            <>
              <div className="card flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{selectedMission.title || "Untitled mission"}</h2>
                  <div className="mt-1 text-sm text-white/55">{selectedMission.id}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                  {selectedMission.conversations.length} conversation{selectedMission.conversations.length === 1 ? "" : "s"}
                </div>
              </div>

              {selectedValidation.length ? (
                <div className="rounded border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {selectedValidation.map((issue) => issue.message).join(" ")}
                </div>
              ) : null}

              {selectedMission.conversations.length ? (
                selectedMission.conversations.map((conversation, conversationIndex) => (
                  <section key={conversation.key} className="card space-y-4">
                    <div className="grid items-start gap-4 border-b border-white/10 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,720px)_minmax(260px,420px)]">
                      <div className="hidden lg:block" />
                      <div className="justify-self-center rounded border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-center text-sm text-cyan-50 lg:w-full">
                        <div className="label text-cyan-100/70">Objective After This Conversation</div>
                        <div className="mt-1 space-y-1 text-base font-medium text-cyan-50">
                          {conversationLookahead(selectedMission, conversation.id).map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      </div>
                      <div className="justify-self-stretch lg:justify-self-end">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/40">Conversation</div>
                        <input
                          className="mt-2 input w-full"
                          value={conversation.id}
                          onChange={(event) => updateConversation(conversationIndex, (current) => ({ ...current, id: event.target.value }))}
                          placeholder="conversation_id"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {conversation.beats.map((beat, beatIndex) => {
                        const speaker = speakerById.get(beat.speaker.trim()) ?? null;
                        const portrait = buildIconSrc(resolvedPortraitPath(speaker?.portrait ?? DEFAULT_COMMS_PORTRAIT), beat.speaker || "speaker", speakerLabel(speaker, beat.speaker), sharedDataVersion);
                        return (
                          <div key={beat.key} className="rounded border border-white/10 bg-black/20 p-4">
                            <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)]">
                              <div className="space-y-2">
                                <div className="flex aspect-square items-center justify-center overflow-hidden rounded border border-white/10 bg-[#06101b]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={portrait} alt={speakerLabel(speaker, beat.speaker)} className="h-full w-full object-cover" />
                                </div>
                                <div className="text-center text-xs text-white/45">Beat {beatIndex + 1}</div>
                              </div>
                              <div className="space-y-3">
                                <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr]">
                                  <label className="space-y-2">
                                    <div className="label">Speaker</div>
                                    <select className="input" value={beat.speaker} onChange={(event) => changeBeatSpeaker(conversationIndex, beatIndex, event.target.value)}>
                                      <option value="">Select speaker</option>
                                      {beat.speaker && !speakerById.has(beat.speaker) ? <option value={beat.speaker}>{beat.speaker}</option> : null}
                                      {speakers.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="space-y-2">
                                    <div className="label">Speaker ID</div>
                                    <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/55">{beat.speaker || "No speaker selected"}</div>
                                  </label>
                                </div>

                                <label className="space-y-2">
                                  <div className="label">Dialogue</div>
                                  <textarea
                                    className="input min-h-32"
                                    value={beat.text}
                                    onChange={(event) => updateBeat(conversationIndex, beatIndex, (current) => ({ ...current, text: event.target.value }))}
                                    placeholder="Speaker dialogue..."
                                  />
                                </label>

                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="label">Responses</div>
                                    <div className="flex flex-wrap gap-2">
                                      <button className="rounded bg-white/5 px-3 py-2 text-xs hover:bg-white/10" onClick={() => addBeatAfter(conversationIndex, beatIndex, beat.speaker)}>
                                        Add Beat
                                      </button>
                                      <button className="rounded bg-white/5 px-3 py-2 text-xs hover:bg-white/10" onClick={() => addResponse(conversationIndex, beatIndex)}>
                                        Add Response
                                      </button>
                                      <button
                                        className="rounded bg-red-500/20 px-3 py-2 text-xs hover:bg-red-500/30"
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
                                        Remove Beat
                                      </button>
                                    </div>
                                  </div>
                                  {beat.responses.length ? (
                                    <div className="space-y-2">
                                      {beat.responses.map((response, responseIndex) => (
                                        <div key={response.key} className="space-y-3 rounded-lg border border-white/10 bg-black/15 p-3">
                                          <div className="flex gap-2">
                                            <input
                                              ref={(node) => {
                                                responseRefs.current[response.key] = node;
                                              }}
                                              className="input"
                                              value={response.text}
                                              onChange={(event) => updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({ ...current, text: event.target.value }))}
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
                                            <label className="space-y-2">
                                              <div className="label">Mission Action</div>
                                              <input
                                                className="input"
                                                value={response.missionAction}
                                                onChange={(event) =>
                                                  updateResponse(conversationIndex, beatIndex, responseIndex, (current) => ({
                                                    ...current,
                                                    missionAction: event.target.value,
                                                    missionActionKey: current.missionActionKey || "mission_action",
                                                  }))
                                                }
                                                placeholder="start_escort"
                                              />
                                            </label>
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
                                    <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No player responses on this beat.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              ) : (
                <div className="card text-sm text-white/55">This mission does not have any conversations yet. Use Mission Creator to add the first conversation, then rewrite it here.</div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
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
