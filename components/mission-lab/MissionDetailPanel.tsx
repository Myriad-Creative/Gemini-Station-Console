"use client";

import type { NormalizedMission } from "@lib/mission-lab/types";
import { RewardStrip } from "@components/mission-lab/MissionCard";
import { humanizeToken } from "@lib/mission-lab/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.24em] text-cyan-200/60">{title}</h3>
      {children}
    </section>
  );
}

function ValueList({ values, emptyLabel = "None" }: { values: string[]; emptyLabel?: string }) {
  if (!values.length) return <div className="text-sm text-white/50">{emptyLabel}</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="badge">
          {value}
        </span>
      ))}
    </div>
  );
}

export default function MissionDetailPanel({
  mission,
  onClose,
  onFocus,
}: {
  mission: NormalizedMission | null;
  onClose: () => void;
  onFocus: (missionKey: string) => void;
}) {
  if (!mission) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/45 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#07111d] px-6 py-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold text-white">{mission.title}</div>
            <div className="mt-2 text-sm text-white/55">{mission.id}</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded border border-cyan-300/25 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10" onClick={() => onFocus(mission.key)}>
              Focus on Map
            </button>
            <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="card">
            <div className="label">Level</div>
            <div className="mt-1 text-xl font-semibold">{mission.level ?? "Unknown"}</div>
          </div>
          <div className="card">
            <div className="label">Mode</div>
            <div className="mt-1 text-xl font-semibold">{humanizeToken(mission.primaryMode)}</div>
          </div>
          <div className="card">
            <div className="label">Class</div>
            <div className="mt-1 text-xl font-semibold">{mission.classLabel}</div>
          </div>
          <div className="card">
            <div className="label">Faction</div>
            <div className="mt-1 text-xl font-semibold">{mission.faction ?? "None"}</div>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          <Section title="Metadata">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label">Folder</div>
                <div className="mt-1 text-sm text-white/85">{mission.folderName}</div>
              </div>
              <div>
                <div className="label">Relative File Path</div>
                <div className="mt-1 break-all text-sm text-white/85">{mission.relativePath}</div>
              </div>
              <div>
                <div className="label">Giver ID</div>
                <div className="mt-1 text-sm text-white/85">{mission.giverId ?? "None"}</div>
              </div>
              <div>
                <div className="label">Turn In To</div>
                <div className="mt-1 text-sm text-white/85">{mission.turnInTo ?? "None"}</div>
              </div>
            </div>
          </Section>

          <Section title="Arcs">
            <ValueList values={mission.arcs} />
          </Section>

          <Section title="Tags">
            <ValueList values={mission.tags} />
          </Section>

          <Section title="Prerequisites">
            <ValueList values={mission.prerequisiteIds} />
          </Section>

          <Section title="Rewards">
            <RewardStrip rewardSummary={mission.rewards} />
          </Section>

          <Section title="Descriptions">
            <div className="space-y-4 text-sm leading-7 text-white/80">
              <div>
                <div className="label">Description</div>
                <div className="mt-1 whitespace-pre-wrap">{mission.description ?? "None"}</div>
              </div>
              <div>
                <div className="label">Description Complete</div>
                <div className="mt-1 whitespace-pre-wrap">{mission.descriptionComplete ?? "None"}</div>
              </div>
            </div>
          </Section>

          <Section title="Conversations">
            <div className="text-sm text-white/80">
              {mission.conversations.length ? `${mission.conversations.length} conversation block(s) imported.` : "No conversations listed."}
            </div>
          </Section>

          <Section title="Steps">
            <div className="space-y-5">
              {mission.steps.map((step, stepIndex) => (
                <div key={step.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-white">
                      {step.title || `Step ${stepIndex + 1}`}
                    </div>
                    <div className="badge">{humanizeToken(step.mode)}</div>
                  </div>
                  {step.description ? <div className="mt-2 text-sm text-white/70">{step.description}</div> : null}
                  <div className="mt-4 space-y-3">
                    {step.objectives.length ? (
                      step.objectives.map((objective, objectiveIndex) => (
                        <div key={objective.key} className="rounded-lg border border-white/10 bg-[#091321] p-3">
                          <div className="text-sm font-medium text-cyan-100">
                            Objective {objectiveIndex + 1}: {humanizeToken(objective.type)}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-white/80">{objective.objective ?? "No objective text."}</div>
                          {objective.description && objective.description !== objective.objective ? (
                            <div className="mt-3">
                              <div className="label">Description</div>
                              <div className="mt-1 text-sm leading-6 text-white/65">{objective.description}</div>
                            </div>
                          ) : null}
                          {objective.targetIds.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {objective.targetIds.map((targetId) => (
                                <span key={targetId} className="badge">
                                  {targetId}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-white/50">No objectives listed for this step.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
