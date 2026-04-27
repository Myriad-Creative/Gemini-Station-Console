"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiProfile, AiProfilesResponse } from "@lib/ai-manager/types";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import { StatusBanner, SummaryCard } from "@components/data-tools/shared";

const EMPTY_RESPONSE: AiProfilesResponse = {
  ok: false,
  sourceRoot: null,
  aiDirectory: null,
  summary: {
    totalProfiles: 0,
    parseErrors: 0,
    profilesWithScripts: 0,
    profilesUsedByMobs: 0,
    referencedByMobsOnly: [],
  },
  profiles: [],
};

function formatRange(value: number | null) {
  return value === null ? "Not set" : String(value);
}

function formatAbilityList(abilities: AiProfile["mainAbilities"]) {
  if (!abilities.length) return "None";
  return abilities.map((ability) => (ability.weight == null ? ability.id : `${ability.id} (${ability.weight})`)).join(", ");
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function PillList({ values, empty = "None" }: { values: string[]; empty?: string }) {
  if (!values.length) return <div className="text-sm text-white/45">{empty}</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
          {value}
        </span>
      ))}
    </div>
  );
}

function SelectedProfilePanel({ profile }: { profile: AiProfile | null }) {
  if (!profile) {
    return (
      <div className="card flex min-h-[420px] items-center justify-center text-sm text-white/50">
        Select an AI profile.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-semibold text-white">{profile.fileName}</div>
            <div className="mt-1 break-all text-sm text-white/50">{profile.relativePath}</div>
          </div>
          {profile.parseError ? (
            <span className="rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs text-red-100">Parse error</span>
          ) : (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">Readable</span>
          )}
        </div>

        {profile.parseError ? <StatusBanner tone="error" message={profile.parseError} /> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailMetric label="ID" value={profile.id} />
          <DetailMetric label="AI Type" value={profile.aiType} />
          <DetailMetric label="Aggro Range" value={formatRange(profile.aggroRange)} />
          <DetailMetric label="Weapon Range" value={formatRange(profile.weaponRange)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailMetric label="Script" value={profile.script ?? "Not set"} />
          <DetailMetric label="Mob References" value={profile.referencedByMobCount} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Abilities</div>
          <div>
            <div className="label">Main</div>
            <div className="mt-1 text-sm text-white/75">{formatAbilityList(profile.mainAbilities)}</div>
          </div>
          <div>
            <div className="label">Secondary</div>
            <div className="mt-1 text-sm text-white/75">{formatAbilityList(profile.secondaryAbilities)}</div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Runtime Hooks</div>
          <div>
            <div className="label">Behavior Sections</div>
            <div className="mt-2">
              <PillList values={profile.behaviorSections} />
            </div>
          </div>
          <div>
            <div className="label">Aliases Matched Against Mobs</div>
            <div className="mt-2">
              <PillList values={profile.aliases} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Movement</div>
          <PillList values={profile.movementKeys} empty="No movement block." />
        </div>
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Combat</div>
          <PillList values={profile.combatKeys} empty="No combat block." />
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold text-white">Mobs Using This AI</div>
          <div className="text-sm text-white/45">{profile.referencedByMobCount} matched</div>
        </div>
        <PillList values={profile.referencedByMobIds} empty="No mobs currently reference this profile." />
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-semibold text-white">Raw JSON</div>
        <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs leading-5 text-white/75">{profile.rawJson}</pre>
      </div>
    </div>
  );
}

export default function AiJsonManager() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [payload, setPayload] = useState<AiProfilesResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scriptFilter, setScriptFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused" | "errors">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      setLoading(true);
      try {
        const response = await fetch("/api/ai");
        const json = (await response.json().catch(() => EMPTY_RESPONSE)) as AiProfilesResponse;
        if (cancelled) return;
        setPayload(json);
        setSelectedKey((current) => {
          if (current && json.profiles.some((profile) => profile.key === current)) return current;
          return json.profiles[0]?.key ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setPayload({
            ...EMPTY_RESPONSE,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const scriptOptions = useMemo(() => uniqueSorted(payload.profiles.map((profile) => profile.script ?? "No script")), [payload.profiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return payload.profiles.filter((profile) => {
      if (scriptFilter) {
        const scriptLabel = profile.script ?? "No script";
        if (scriptLabel !== scriptFilter) return false;
      }
      if (usageFilter === "used" && profile.referencedByMobCount === 0) return false;
      if (usageFilter === "unused" && profile.referencedByMobCount > 0) return false;
      if (usageFilter === "errors" && !profile.parseError) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        profile.fileName,
        profile.id,
        profile.aiType,
        profile.script ?? "",
        ...profile.aliases,
        ...profile.behaviorSections,
        ...profile.referencedByMobIds,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [payload.profiles, query, scriptFilter, usageFilter]);

  const selectedProfile = useMemo(() => {
    if (selectedKey) {
      const selected = filteredProfiles.find((profile) => profile.key === selectedKey);
      if (selected) return selected;
    }
    return filteredProfiles[0] ?? null;
  }, [filteredProfiles, selectedKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">AI JSON Manager</h1>
        <p className="max-w-4xl text-white/65">
          Browse the AI profile JSON files generated in-game under the active Gemini Station local game root.
        </p>
      </div>

      <StatusBanner
        tone={payload.ok ? "success" : payload.error ? "error" : "neutral"}
        message={
          loading
            ? "Loading AI profiles from the local game root..."
            : payload.ok
              ? `Reading ${payload.aiDirectory ?? "data/database/AI"}.`
              : payload.error ?? "AI profiles are unavailable."
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Profiles" value={payload.summary.totalProfiles} />
        <SummaryCard label="Used By Mobs" value={payload.summary.profilesUsedByMobs} />
        <SummaryCard label="With Scripts" value={payload.summary.profilesWithScripts} />
        <SummaryCard label="Parse Errors" value={payload.summary.parseErrors} />
      </div>

      {payload.summary.referencedByMobsOnly.length ? (
        <StatusBanner
          tone="neutral"
          message={`Mobs reference AI types without matching AI JSON aliases: ${payload.summary.referencedByMobsOnly.join(", ")}`}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[420px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div>
                <div className="label">Search</div>
                <input className="input mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AI type, script, mob, ability..." />
              </div>
              <div>
                <div className="label">Script</div>
                <select className="input mt-1" value={scriptFilter} onChange={(event) => setScriptFilter(event.target.value)}>
                  <option value="">All scripts</option>
                  {scriptOptions.map((script) => (
                    <option key={script} value={script}>
                      {script}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="label">Usage</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
                {[
                  ["all", "All"],
                  ["used", "Used"],
                  ["unused", "Unused"],
                  ["errors", "Errors"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded border px-2 py-2 ${
                      usageFilter === value ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                    }`}
                    onClick={() => setUsageFilter(value as typeof usageFilter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {filteredProfiles.map((profile) => {
              const selected = selectedProfile?.key === profile.key;
              return (
                <button
                  key={profile.key}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selected ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-panel hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                  onClick={() => setSelectedKey(profile.key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{profile.fileName}</div>
                      <div className="mt-1 truncate text-xs text-white/50">{profile.aiType}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${profile.parseError ? "bg-red-400/15 text-red-100" : "bg-white/10 text-white/65"}`}>
                      {profile.referencedByMobCount}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs text-white/45">{profile.script ?? "No script"}</div>
                </button>
              );
            })}

            {!filteredProfiles.length ? (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">No AI profiles match the current filters.</div>
            ) : null}
          </div>
        </div>

        <SelectedProfilePanel profile={selectedProfile} />
      </div>
    </div>
  );
}
