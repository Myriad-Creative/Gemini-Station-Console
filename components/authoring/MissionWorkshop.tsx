"use client";

import JSZip from "jszip";
import {
  ChangeEvent,
  HTMLAttributes,
  KeyboardEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DialogueLineDraft,
  MissionDraft,
  MissionObjectiveDraft,
  MissionStepDraft,
  ValidationMessage,
  buildMissionManifest,
  createDialogueLineDraft,
  createMissionDraft,
  createMissionStepDraft,
  createObjectiveDraft,
  csvFromList,
  duplicateMissionDraft,
  duplicateMissionStepDraft,
  exportMissionDraft,
  listFromCsv,
  missionFilename,
  normalizeImportedMissionCollection,
  validateMissionDrafts,
} from "@lib/authoring";
import { parseLooseJson } from "@lib/json";

const OBJECTIVE_TYPES = ["talk", "travel", "kill", "collect", "deliver", "custom"];
const FILTER_ALL = "__all__";

export default function MissionWorkshop({
  missions,
  onChange,
  knownMissionIds,
  consoleMissionCount,
}: {
  missions: MissionDraft[];
  onChange: (next: MissionDraft[]) => void;
  knownMissionIds: string[];
  consoleMissionCount: number;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState(FILTER_ALL);
  const [levelFilter, setLevelFilter] = useState(FILTER_ALL);
  const [arcFilter, setArcFilter] = useState(FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(FILTER_ALL);
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (selectedIndex <= missions.length - 1) return;
    setSelectedIndex(Math.max(0, missions.length - 1));
  }, [missions.length, selectedIndex]);

  const clampedSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, missions.length - 1)));
  const selectedMission = missions[clampedSelectedIndex] ?? null;

  const validation = useMemo(() => validateMissionDrafts(missions, knownMissionIds), [knownMissionIds, missions]);
  const factionOptions = useMemo(() => buildSortedOptions(missions.map((mission) => mission.faction)), [missions]);
  const levelOptions = useMemo(
    () =>
      Array.from(new Set(missions.map((mission) => mission.level.trim()).filter(Boolean))).sort(
        (left, right) => Number(left) - Number(right),
      ),
    [missions],
  );
  const arcOptions = useMemo(() => buildSortedOptions(missions.flatMap((mission) => mission.arcs)), [missions]);
  const tagOptions = useMemo(() => buildSortedOptions(missions.flatMap((mission) => mission.tags)), [missions]);
  const filteredMissions = useMemo(() => {
    return missions
      .map((mission, index) => ({ mission, index }))
      .filter(({ mission }) => {
        const target = `${mission.id} ${mission.title} ${mission.faction} ${mission.arcs.join(" ")} ${mission.tags.join(" ")}`.toLowerCase();
        if (deferredSearch && !target.includes(deferredSearch)) return false;
        if (factionFilter !== FILTER_ALL && mission.faction.trim() !== factionFilter) return false;
        if (levelFilter !== FILTER_ALL && mission.level.trim() !== levelFilter) return false;
        if (arcFilter !== FILTER_ALL && !mission.arcs.includes(arcFilter)) return false;
        if (tagFilter !== FILTER_ALL && !mission.tags.includes(tagFilter)) return false;
        return true;
      });
  }, [arcFilter, deferredSearch, factionFilter, levelFilter, missions, tagFilter]);
  const selectedValidation = useMemo(() => {
    return validation.filter((message) => message.draftIndex === clampedSelectedIndex);
  }, [clampedSelectedIndex, validation]);

  const errorCount = validation.filter((message) => message.level === "error").length;
  const warningCount = validation.length - errorCount;
  const hasActiveFilters =
    factionFilter !== FILTER_ALL || levelFilter !== FILTER_ALL || arcFilter !== FILTER_ALL || tagFilter !== FILTER_ALL;

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
      steps: draft.steps.map((step, currentIndex) => (currentIndex === stepIndex ? updater(step) : step)),
    }));
  }

  function updateObjective(
    stepIndex: number,
    objectiveIndex: number,
    updater: (objective: MissionObjectiveDraft) => MissionObjectiveDraft,
  ) {
    updateStep(stepIndex, (step) => ({
      ...step,
      objectives: step.objectives.map((objective, currentIndex) =>
        currentIndex === objectiveIndex ? updater(objective) : objective,
      ),
    }));
  }

  function updateDialogue(
    stepIndex: number,
    field: "dialogue" | "completionDialogue",
    lineIndex: number,
    updater: (line: DialogueLineDraft) => DialogueLineDraft,
  ) {
    updateStep(stepIndex, (step) => ({
      ...step,
      [field]: step[field].map((line, currentIndex) => (currentIndex === lineIndex ? updater(line) : line)),
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
    const next = missions.filter((_, missionIndex) => missionIndex !== clampedSelectedIndex);
    onChange(next.length ? next : [createMissionDraft()]);
    setSelectedIndex(Math.max(0, clampedSelectedIndex - 1));
    setStatus("Deleted the selected mission draft.");
  }

  async function importMissionFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const imported: MissionDraft[] = [];
    let invalidFiles = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const parsed = parseLooseJson(text);
        const normalized = normalizeImportedMissionCollection(parsed);
        if (normalized.length) imported.push(...normalized);
        else invalidFiles += 1;
      } catch {
        invalidFiles += 1;
      }
    }

    if (imported.length) {
      const nextIndex = missions.length;
      startTransition(() => {
        onChange([...missions, ...imported]);
        setSelectedIndex(nextIndex);
      });
      setStatus(
        `Imported ${imported.length} mission draft(s) from ${files.length} file(s)${invalidFiles ? `; skipped ${invalidFiles} invalid file(s)` : ""}.`,
      );
    } else {
      setStatus("No valid mission JSON was found in the selected files.");
    }

    input.value = "";
  }

  function exportSelectedMission() {
    if (!selectedMission) return;
    downloadJson(exportMissionDraft(selectedMission), missionFilename(selectedMission, clampedSelectedIndex));
    setStatus("Exported the selected mission JSON.");
  }

  async function exportAllMissions() {
    const zip = new JSZip();
    const manifest = buildMissionManifest(missions);
    const exportEntries = manifest.map((entry, index) => ({
      mission: missions[index],
      filename: entry.filename,
    }));

    for (const entry of exportEntries) {
      zip.file(entry.filename, JSON.stringify(exportMissionDraft(entry.mission), null, 2));
    }

    zip.file("missions-manifest.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "gemini-station-missions.zip");
    setStatus(`Exported ${exportEntries.length} mission file(s) plus missions-manifest.json.`);
  }

  async function copySelectedJson() {
    if (!selectedMission) return;
    const didCopy = await copyText(JSON.stringify(exportMissionDraft(selectedMission), null, 2));
    setStatus(didCopy ? "Copied the selected mission JSON to the clipboard." : "Clipboard copy failed in this browser context.");
  }

  function resetFilters() {
    setFactionFilter(FILTER_ALL);
    setLevelFilter(FILTER_ALL);
    setArcFilter(FILTER_ALL);
    setTagFilter(FILTER_ALL);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="card h-fit space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Mission Library</h2>
              <div className="text-xs text-white/50">
                {missions.length} draft(s) · {filteredMissions.length} shown · {consoleMissionCount} reference mission id(s) available for prerequisites
              </div>
            </div>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={addMission}>
              New
            </button>
          </div>

          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mission id, title, faction, arc, or tag"
          />

          <div className="flex flex-wrap gap-2">
            <label className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              Import JSON
              <input className="hidden" type="file" multiple accept=".json,application/json" onChange={importMissionFiles} />
            </label>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={exportAllMissions}>
              Export ZIP
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
            </div>
          </div>

          {status ? <div className="text-sm text-accent">{status}</div> : null}

          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {filteredMissions.length ? (
              filteredMissions.map(({ mission, index }) => (
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
                  </div>
                </button>
              ))
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
                <h2 className="text-lg font-semibold">Mission Editor</h2>
                <div className="text-xs text-white/50">Selected draft #{clampedSelectedIndex + 1}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={duplicateSelectedMission}>
                  Duplicate
                </button>
                <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={copySelectedJson}>
                  Copy JSON
                </button>
                <button className="btn" onClick={exportSelectedMission}>
                  Export Selected
                </button>
                <button className="rounded bg-red-500/20 px-3 py-2 text-sm hover:bg-red-500/30" onClick={removeSelectedMission}>
                  Delete
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mission ID" value={selectedMission.id} onChange={(value) => updateSelected((draft) => ({ ...draft, id: value }))} />
              <Field label="Title" value={selectedMission.title} onChange={(value) => updateSelected((draft) => ({ ...draft, title: value }))} />
              <Field
                label="Giver ID"
                value={selectedMission.giver_id}
                onChange={(value) => updateSelected((draft) => ({ ...draft, giver_id: value }))}
              />
              <Field
                label="Faction"
                value={selectedMission.faction}
                onChange={(value) => updateSelected((draft) => ({ ...draft, faction: value }))}
              />
              <Field
                label="Level"
                value={selectedMission.level}
                inputMode="numeric"
                onChange={(value) => updateSelected((draft) => ({ ...draft, level: value }))}
              />
              <Field
                label="Arcs (comma separated)"
                value={csvFromList(selectedMission.arcs)}
                onChange={(value) => updateSelected((draft) => ({ ...draft, arcs: listFromCsv(value) }))}
              />
              <Field
                label="Tags (comma separated)"
                value={csvFromList(selectedMission.tags)}
                onChange={(value) => updateSelected((draft) => ({ ...draft, tags: listFromCsv(value) }))}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={selectedMission.repeatable}
                onChange={(event) => updateSelected((draft) => ({ ...draft, repeatable: event.target.checked }))}
              />
              Repeatable mission
            </label>

            <div>
              <div className="label mb-2">Prerequisite missions</div>
              <PrerequisiteEditor
                missionId={selectedMission.id.trim()}
                prerequisites={selectedMission.prerequisites}
                options={knownMissionIds}
                onChange={(next) => updateSelected((draft) => ({ ...draft, prerequisites: next }))}
              />
            </div>

            <div>
              <div className="label mb-2">Authoring notes (not exported)</div>
              <textarea
                className="input min-h-24"
                value={selectedMission.notes}
                onChange={(event) => updateSelected((draft) => ({ ...draft, notes: event.target.value }))}
                placeholder="Narrative notes, TODOs, edge cases, follow-ups..."
              />
            </div>

            <div>
              <div className="label mb-2">Mission extra JSON (merged at export)</div>
              <textarea
                className="input min-h-32 font-mono text-sm"
                value={selectedMission.extraJson}
                onChange={(event) => updateSelected((draft) => ({ ...draft, extraJson: event.target.value }))}
                placeholder='{"custom_flag": true}'
              />
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Steps, Objectives, and Dialogue</h2>
                <div className="text-xs text-white/50">Ordered mission flow exported in both flat and step-aware forms.</div>
              </div>
              <button
                className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() =>
                  updateSelected((draft) => ({
                    ...draft,
                    steps: [...draft.steps, createMissionStepDraft(`Step ${draft.steps.length + 1}`)],
                  }))
                }
              >
                Add Step
              </button>
            </div>

            <div className="space-y-4">
              {selectedMission.steps.map((step, stepIndex) => (
                <div key={step.id} className="rounded border border-white/10 bg-white/5 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Step {stepIndex + 1}</div>
                      <div className="text-xs text-white/50">{step.title || step.id || "Untitled step"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                        disabled={stepIndex === 0}
                        onClick={() =>
                          updateSelected((draft) => {
                            const next = [...draft.steps];
                            [next[stepIndex - 1], next[stepIndex]] = [next[stepIndex], next[stepIndex - 1]];
                            return { ...draft, steps: next };
                          })
                        }
                      >
                        Move Up
                      </button>
                      <button
                        className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                        disabled={stepIndex === selectedMission.steps.length - 1}
                        onClick={() =>
                          updateSelected((draft) => {
                            const next = [...draft.steps];
                            [next[stepIndex + 1], next[stepIndex]] = [next[stepIndex], next[stepIndex + 1]];
                            return { ...draft, steps: next };
                          })
                        }
                      >
                        Move Down
                      </button>
                      <button
                        className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                        onClick={() =>
                          updateSelected((draft) => {
                            const next = [...draft.steps];
                            next.splice(stepIndex + 1, 0, duplicateMissionStepDraft(step));
                            return { ...draft, steps: next };
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
                            steps: draft.steps.filter((_, currentIndex) => currentIndex !== stepIndex),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Step ID"
                      value={step.id}
                      onChange={(value) => updateStep(stepIndex, (current) => ({ ...current, id: value }))}
                    />
                    <Field
                      label="Step Title"
                      value={step.title}
                      onChange={(value) => updateStep(stepIndex, (current) => ({ ...current, title: value }))}
                    />
                  </div>

                  <div className="mt-4">
                    <div className="label mb-2">Description</div>
                    <textarea
                      className="input min-h-20"
                      value={step.description}
                      onChange={(event) => updateStep(stepIndex, (current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {OBJECTIVE_TYPES.map((type) => (
                        <button
                          key={type}
                          className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                          onClick={() =>
                            updateStep(stepIndex, (current) => ({
                              ...current,
                              objectives: [...current.objectives, createObjectiveDraft(type)],
                            }))
                          }
                        >
                          + {type}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      {step.objectives.map((objective, objectiveIndex) => (
                        <div key={objective.id} className="rounded border border-white/10 bg-black/20 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">Objective {objectiveIndex + 1}</div>
                            <button
                              className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30"
                              onClick={() =>
                                updateStep(stepIndex, (current) => ({
                                  ...current,
                                  objectives: current.objectives.filter((_, currentIndex) => currentIndex !== objectiveIndex),
                                }))
                              }
                            >
                              Remove Objective
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Field
                              label="Objective ID"
                              value={objective.id}
                              onChange={(value) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({ ...current, id: value }))
                              }
                            />
                            <Field
                              label="Type"
                              value={objective.type}
                              onChange={(value) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({ ...current, type: value }))
                              }
                            />
                            <Field
                              label="Target IDs (comma separated)"
                              value={csvFromList(objective.target_ids)}
                              onChange={(value) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({
                                  ...current,
                                  target_ids: listFromCsv(value),
                                }))
                              }
                            />
                            <Field
                              label="Count"
                              value={objective.count}
                              inputMode="numeric"
                              onChange={(value) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({ ...current, count: value }))
                              }
                            />
                          </div>

                          <div className="mt-4">
                            <div className="label mb-2">Description</div>
                            <textarea
                              className="input min-h-20"
                              value={objective.description}
                              onChange={(event) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="mt-4">
                            <div className="label mb-2">Objective extra JSON</div>
                            <textarea
                              className="input min-h-24 font-mono text-sm"
                              value={objective.extraJson}
                              onChange={(event) =>
                                updateObjective(stepIndex, objectiveIndex, (current) => ({
                                  ...current,
                                  extraJson: event.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <DialogueEditor
                    label="Dialogue"
                    lines={step.dialogue}
                    onAdd={() =>
                      updateStep(stepIndex, (current) => ({
                        ...current,
                        dialogue: [...current.dialogue, createDialogueLineDraft()],
                      }))
                    }
                    onChange={(lineIndex, updater) => updateDialogue(stepIndex, "dialogue", lineIndex, updater)}
                    onRemove={(lineIndex) =>
                      updateStep(stepIndex, (current) => ({
                        ...current,
                        dialogue: current.dialogue.filter((_, currentIndex) => currentIndex !== lineIndex),
                      }))
                    }
                  />

                  <DialogueEditor
                    label="Completion Dialogue"
                    lines={step.completionDialogue}
                    onAdd={() =>
                      updateStep(stepIndex, (current) => ({
                        ...current,
                        completionDialogue: [...current.completionDialogue, createDialogueLineDraft()],
                      }))
                    }
                    onChange={(lineIndex, updater) => updateDialogue(stepIndex, "completionDialogue", lineIndex, updater)}
                    onRemove={(lineIndex) =>
                      updateStep(stepIndex, (current) => ({
                        ...current,
                        completionDialogue: current.completionDialogue.filter((_, currentIndex) => currentIndex !== lineIndex),
                      }))
                    }
                  />

                  <div className="mt-4">
                    <div className="label mb-2">Step extra JSON</div>
                    <textarea
                      className="input min-h-24 font-mono text-sm"
                      value={step.extraJson}
                      onChange={(event) => updateStep(stepIndex, (current) => ({ ...current, extraJson: event.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Export Preview</h2>
            <pre className="max-h-[70vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">
              {JSON.stringify(exportMissionDraft(selectedMission), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PrerequisiteEditor({
  missionId,
  prerequisites,
  options,
  onChange,
}: {
  missionId: string;
  prerequisites: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [draftValue, setDraftValue] = useState("");
  const availableOptions = options.filter((option) => option !== missionId && !prerequisites.includes(option));
  const draftNeedle = draftValue.trim().toLowerCase();
  const suggestionOptions = availableOptions
    .filter((option) => !draftNeedle || option.toLowerCase().includes(draftNeedle))
    .slice(0, 12);

  useEffect(() => {
    setDraftValue("");
  }, [missionId]);

  function commit(nextValue: string) {
    const trimmed = nextValue.trim();
    if (!trimmed || trimmed === missionId || prerequisites.includes(trimmed)) return;
    onChange([...prerequisites, trimmed]);
    setDraftValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit(draftValue);
  }

  return (
    <div className="space-y-3 rounded border border-white/10 bg-black/20 p-3">
      {prerequisites.length ? (
        <div className="flex flex-wrap gap-2">
          {prerequisites.map((prerequisite) => (
            <button
              key={prerequisite}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              onClick={() => onChange(prerequisites.filter((entry) => entry !== prerequisite))}
              title="Remove prerequisite"
            >
              {prerequisite} ×
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-white/50">No prerequisites linked yet.</div>
      )}

      <div className="flex gap-2">
        <input
          className="input"
          value={draftValue}
          list={`prereq-options-${missionId || "new"}`}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add prerequisite mission id"
        />
        <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => commit(draftValue)}>
          Add
        </button>
      </div>

      <datalist id={`prereq-options-${missionId || "new"}`}>
        {availableOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      {suggestionOptions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestionOptions.map((option) => (
            <button
              key={option}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => commit(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DialogueEditor({
  label,
  lines,
  onAdd,
  onChange,
  onRemove,
}: {
  label: string;
  lines: DialogueLineDraft[];
  onAdd: () => void;
  onChange: (index: number, updater: (line: DialogueLineDraft) => DialogueLineDraft) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{label}</h4>
        <button className="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" onClick={onAdd}>
          Add Line
        </button>
      </div>

      {lines.length ? (
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={line.id} className="rounded border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">
                  {label} line {index + 1}
                </div>
                <button className="rounded bg-red-500/20 px-2 py-1 text-xs hover:bg-red-500/30" onClick={() => onRemove(index)}>
                  Remove Line
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Line ID"
                  value={line.id}
                  onChange={(value) => onChange(index, (current) => ({ ...current, id: value }))}
                />
                <Field
                  label="Mood"
                  value={line.mood}
                  onChange={(value) => onChange(index, (current) => ({ ...current, mood: value }))}
                />
                <Field
                  label="Speaker ID"
                  value={line.speaker_id}
                  onChange={(value) => onChange(index, (current) => ({ ...current, speaker_id: value }))}
                />
                <Field
                  label="Speaker Name"
                  value={line.speaker_name}
                  onChange={(value) => onChange(index, (current) => ({ ...current, speaker_name: value }))}
                />
              </div>

              <div className="mt-4">
                <div className="label mb-2">Text</div>
                <textarea
                  className="input min-h-20"
                  value={line.text}
                  onChange={(event) => onChange(index, (current) => ({ ...current, text: event.target.value }))}
                />
              </div>

              <div className="mt-4">
                <div className="label mb-2">Line extra JSON</div>
                <textarea
                  className="input min-h-24 font-mono text-sm"
                  value={line.extraJson}
                  onChange={(event) => onChange(index, (current) => ({ ...current, extraJson: event.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-white/10 px-3 py-4 text-sm text-white/50">No lines yet.</div>
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
        <div className="max-h-[36vh] space-y-2 overflow-auto pr-1">
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
  onChange: (value: string) => void;
  allLabel: string;
}) {
  return (
    <label>
      <div className="label mb-2">{label}</div>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={FILTER_ALL}>{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label>
      <div className="label mb-2">{label}</div>
      <input className="input" value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
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

function buildSortedOptions(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}
