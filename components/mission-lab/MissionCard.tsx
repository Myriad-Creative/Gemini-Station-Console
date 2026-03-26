"use client";

import type { MissionGraphNode, MissionRewardEntrySummary, MissionRewardSummary, NormalizedMission } from "@lib/mission-lab/types";
import { humanizeToken } from "@lib/mission-lab/utils";

type MissionCardBase = {
  title: string;
  level: number | null;
  primaryMode: string | null;
  classLabel: string;
  objectivePreview: string[];
  additionalSteps: number;
  rewardSummary: MissionRewardSummary;
  faction: string | null;
  folderName: string;
  selected?: boolean;
  onClick?: () => void;
};

function formatMode(mode: string | null) {
  return mode ? humanizeToken(mode) : "Unknown";
}

function RewardPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3">
        <div className="text-center text-2xl font-semibold text-white">{value}</div>
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/55">{label}</div>
    </div>
  );
}

function RewardIcon({ reward }: { reward: MissionRewardEntrySummary }) {
  if (reward.icon) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-cyan-400/20 bg-white/5 p-1">
        <img
          src={`/api/icon?res=${encodeURIComponent(reward.icon)}&id=${encodeURIComponent(reward.id)}&name=${encodeURIComponent(
            reward.name ?? reward.id,
          )}`}
          alt={reward.name ?? reward.id}
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-md object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-center text-[11px] text-white/75">
      {reward.name ?? reward.id}
    </div>
  );
}

export function RewardStrip({ rewardSummary }: { rewardSummary: MissionRewardSummary }) {
  const hasRewards = rewardSummary.credits != null || rewardSummary.xp != null || rewardSummary.rewards.length > 0;
  if (!hasRewards) return <div className="text-sm text-white/45">No rewards listed.</div>;

  return (
    <div className="flex flex-wrap items-start gap-3">
      {rewardSummary.credits != null ? <RewardPill label="Credits" value={rewardSummary.credits} /> : null}
      {rewardSummary.xp != null ? <RewardPill label="XP" value={rewardSummary.xp} /> : null}
      {rewardSummary.rewards.map((reward) => (
        <RewardIcon key={`${reward.kind}:${reward.id}`} reward={reward} />
      ))}
    </div>
  );
}

function ObjectivePreview({ mode, lines, additionalSteps }: { mode: string | null; lines: string[]; additionalSteps: number }) {
  const previewLines = lines.length ? lines : ["No objectives listed."];

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/60">
        {mode === "single" ? "Objective" : "Objectives"}
      </div>

      {mode === "single" ? (
        <p className="text-sm leading-6 text-white/84">{previewLines[0]}</p>
      ) : mode === "sequential" ? (
        <ol className="space-y-2 text-sm leading-6 text-white/84">
          {previewLines.map((line, index) => (
            <li key={`${line}-${index}`} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400/15 text-[11px] font-semibold text-cyan-100">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-2 text-sm leading-6 text-white/84">
          {previewLines.map((line, index) => (
            <li key={`${line}-${index}`} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {additionalSteps > 0 ? (
        <div className="text-xs text-white/45">+{additionalSteps} additional step{additionalSteps === 1 ? "" : "s"} in the full mission.</div>
      ) : null}
    </div>
  );
}

function MissionCardShell({
  title,
  level,
  primaryMode,
  classLabel,
  objectivePreview,
  additionalSteps,
  rewardSummary,
  faction,
  folderName,
  selected,
  onClick,
}: MissionCardBase) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-5 py-5 text-left transition ${
        selected
          ? "border-cyan-300/70 bg-[#0d1a2d] shadow-[0_0_0_1px_rgba(125,211,252,0.24),0_0_28px_rgba(34,211,238,0.18)]"
          : "border-white/12 bg-[#0b172a]"
      } ${onClick ? "hover:border-cyan-300/35 hover:bg-[#0f1d34]" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight text-white">{title}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {faction ? <span className="badge border border-cyan-300/15 bg-cyan-300/10 text-cyan-100">{faction}</span> : null}
            {folderName ? <span className="badge">{folderName}</span> : null}
          </div>
        </div>

        <div className="min-w-[7rem] text-right">
          <div className="text-3xl font-semibold text-white">{level ?? "?"}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/45">Level</div>
          <div className="mt-4 space-y-1 text-sm text-white/70">
            <div>Type: {formatMode(primaryMode)}</div>
            <div>Class: {classLabel}</div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ObjectivePreview mode={primaryMode} lines={objectivePreview} additionalSteps={additionalSteps} />
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/60">Rewards</div>
        <RewardStrip rewardSummary={rewardSummary} />
      </div>
    </button>
  );
}

export function MissionCard({
  mission,
  selected,
  onClick,
}: {
  mission: MissionGraphNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <MissionCardShell
      title={mission.title}
      level={mission.level}
      primaryMode={mission.primaryMode}
      classLabel={mission.classLabel}
      objectivePreview={mission.objectivePreview}
      additionalSteps={mission.additionalSteps}
      rewardSummary={mission.rewardSummary}
      faction={mission.faction}
      folderName={mission.folderName}
      selected={selected}
      onClick={onClick}
    />
  );
}

export function MissionChainCard({
  mission,
  selected,
  onClick,
}: {
  mission: NormalizedMission;
  selected?: boolean;
  onClick?: () => void;
}) {
  const objectivePreview = mission.steps[0]?.objectives.map((objective) => objective.description || humanizeToken(objective.type)).slice(0, 4) ?? [];

  return (
    <MissionCardShell
      title={mission.title}
      level={mission.level}
      primaryMode={mission.primaryMode}
      classLabel={mission.classLabel}
      objectivePreview={objectivePreview}
      additionalSteps={Math.max(0, mission.steps.length - 1)}
      rewardSummary={mission.rewards}
      faction={mission.faction}
      folderName={mission.folderName}
      selected={selected}
      onClick={onClick}
    />
  );
}
