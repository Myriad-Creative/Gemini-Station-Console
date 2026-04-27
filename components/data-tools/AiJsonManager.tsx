"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiAbilityOption, AiJsonValue, AiProfile, AiProfilesResponse } from "@lib/ai-manager/types";
import { publishSharedDataWorkspaceUpdate, useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import { StatusBanner, SummaryCard } from "@components/data-tools/shared";

type JsonObject = Record<string, AiJsonValue>;
type StatusState = { tone: "neutral" | "success" | "error"; message: string } | null;

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
  abilityOptions: [],
};

const RANGE_PRESETS = [
  { key: "point_blank", label: "Point Blank", value: 500, description: "0 to 500 range." },
  { key: "mid", label: "Mid", value: 1000, description: "501 to 1000 range." },
  { key: "normal", label: "Normal", value: 2000, description: "1001 to 2000 range." },
  { key: "long", label: "Long", value: 3000, description: "2001 to 3000 range." },
] as const;

const RANGE_TYPE_LABELS: Record<string, string> = {
  "0": "Point Blank",
  "1": "Mid",
  "2": "Normal",
  "3": "Long",
};

const NUMERIC_FIELDS = [
  { key: "ai_tick", label: "AI Tick", description: "How often active combat decision logic runs, in seconds." },
  { key: "ai_tick_jitter", label: "AI Tick Jitter", description: "Random variance added to active AI ticks so ships do not update in lockstep." },
  { key: "idle_ai_tick", label: "Idle AI Tick", description: "How often idle or patrol logic runs while not actively fighting." },
  { key: "idle_ai_tick_jitter", label: "Idle Tick Jitter", description: "Random variance added to idle ticks." },
  { key: "fire_cadence", label: "Fire Cadence", description: "Minimum delay between AI weapon checks or shots." },
  { key: "chase_speed_multiplier", label: "Chase Speed Multiplier", description: "Multiplier applied while pursuing a target." },
  { key: "opening_attack_duration", label: "Opening Attack Duration", description: "Seconds spent in the opening attack phase before switching behavior." },
  { key: "opening_evade_duration", label: "Opening Evade Duration", description: "Seconds spent evading after the opening attack, when supported by the script." },
  { key: "followup_attack_duration", label: "Follow-Up Attack Duration", description: "Seconds spent in follow-up attack windows." },
  { key: "low_armor_evade_threshold", label: "Low Armor Evade Threshold", description: "Armor fraction that triggers low-armor evasion behavior." },
  { key: "low_armor_evade_duration", label: "Low Armor Evade Duration", description: "Seconds spent evading after low armor behavior starts." },
  { key: "evade_speed_multiplier", label: "Evade Speed Multiplier", description: "Multiplier applied while evading." },
  { key: "intercept_max_lead_time", label: "Intercept Max Lead Time", description: "Maximum seconds of lead prediction when intercepting a moving target." },
  { key: "intercept_heading_smoothing", label: "Intercept Heading Smoothing", description: "How strongly heading changes are smoothed during intercept steering." },
  { key: "disengage_start_distance", label: "Disengage Start Distance", description: "Distance where disengage behavior can begin, if the script uses it." },
  { key: "disengage_after", label: "Disengage After", description: "Seconds before the AI disengages after losing useful combat contact." },
  { key: "leash_distance", label: "Leash Distance", description: "Maximum pursuit distance before returning or dropping combat." },
] as const;

function cloneData(value: JsonObject | null): JsonObject {
  if (!value) return {};
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stringValue(data: JsonObject, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function numericInputValue(data: JsonObject, key: string) {
  const value = data[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function setStringField(data: JsonObject, key: string, value: string) {
  return { ...data, [key]: value };
}

function setNumericField(data: JsonObject, key: string, value: string) {
  const trimmed = value.trim();
  const next = { ...data };
  if (!trimmed) {
    delete next[key];
    return next;
  }
  const parsed = Number(trimmed);
  next[key] = Number.isFinite(parsed) ? parsed : trimmed;
  return next;
}

function tagsFromData(data: JsonObject) {
  const tags = data.tags;
  return Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
}

function abilityRefsFromData(data: JsonObject, key: "main_abilities" | "secondary_abilities") {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const source = entry as JsonObject;
        const id = String(source.id ?? "").trim();
        return id ? { ...source, id } : null;
      }
      const id = String(entry ?? "").trim();
      return id ? { id } : null;
    })
    .filter((entry): entry is JsonObject & { id: string } => Boolean(entry));
}

function abilityLabel(option: AiAbilityOption | undefined, id: string) {
  if (!option) return `Ability ${id}`;
  return `${option.id} · ${option.name}`;
}

function rangeTypeSummary(option: AiAbilityOption | undefined) {
  if (!option) return "";
  const min = option.minRangeType ? RANGE_TYPE_LABELS[option.minRangeType] ?? option.minRangeType : null;
  const max = option.maxRangeType ? RANGE_TYPE_LABELS[option.maxRangeType] ?? option.maxRangeType : null;
  const bands = min && max ? `${min} to ${max}` : min || max || "";
  return [bands, option.attackRange ? `${option.attackRange} range` : ""].filter(Boolean).join(" · ");
}

function RangeSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const numericValue = Number(value);
  const selectedPreset = RANGE_PRESETS.find((preset) => Number.isFinite(numericValue) && numericValue === preset.value);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="mt-1 text-xs leading-5 text-white/50">{description}</div>
        </div>
        <div className="text-xs text-white/45">{selectedPreset ? selectedPreset.label : value ? "Custom" : "Not set"}</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            title={preset.description}
            className={`rounded border px-2 py-2 text-sm ${
              selectedPreset?.key === preset.key ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
            }`}
            onClick={() => onChange(String(preset.value))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <input className="input mt-3" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Custom numeric range" />
    </div>
  );
}

function NumericField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-1 min-h-[40px] text-xs leading-5 text-white/50">{description}</div>
      <input className="input mt-3" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Not set" />
    </label>
  );
}

function AbilityPicker({
  title,
  description,
  refs,
  options,
  search,
  setSearch,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  refs: Array<JsonObject & { id: string }>;
  options: AiAbilityOption[];
  search: string;
  setSearch: (next: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selectedIds = new Set(refs.map((ref) => ref.id));
  const normalizedSearch = search.trim().toLowerCase();
  const candidates = options
    .filter((option) => !selectedIds.has(option.id))
    .filter((option) => {
      if (!normalizedSearch) return true;
      return [option.id, option.name, option.description ?? ""].join(" ").toLowerCase().includes(normalizedSearch);
    })
    .slice(0, 12);

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm text-white/55">{description}</div>
      </div>

      <div className="space-y-2">
        {refs.map((ref) => {
          const option = byId.get(ref.id);
          return (
            <div key={ref.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{abilityLabel(option, ref.id)}</div>
                <div className="mt-1 text-xs text-white/45">{rangeTypeSummary(option) || option?.description || "No ability metadata found."}</div>
              </div>
              <button type="button" className="shrink-0 rounded border border-white/10 px-2 py-1 text-xs text-white/65 hover:bg-white/10" onClick={() => onRemove(ref.id)}>
                Remove
              </button>
            </div>
          );
        })}
        {!refs.length ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No abilities selected.</div> : null}
      </div>

      <div>
        <div className="label">Search Abilities</div>
        <input className="input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, name, or description..." />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {candidates.map((option) => (
          <button
            key={option.id}
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left hover:border-cyan-300/35 hover:bg-white/[0.06]"
            onClick={() => onAdd(option.id)}
          >
            <div className="text-sm font-semibold text-white">{abilityLabel(option, option.id)}</div>
            <div className="mt-1 text-xs leading-5 text-white/50">{rangeTypeSummary(option) || option.description || "No description."}</div>
          </button>
        ))}
      </div>
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

function SelectedProfileEditor({
  profile,
  draft,
  abilityOptions,
  dirty,
  saving,
  status,
  onDraftChange,
  onSave,
}: {
  profile: AiProfile | null;
  draft: JsonObject | null;
  abilityOptions: AiAbilityOption[];
  dirty: boolean;
  saving: boolean;
  status: StatusState;
  onDraftChange: (next: JsonObject) => void;
  onSave: () => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [mainAbilitySearch, setMainAbilitySearch] = useState("");
  const [secondaryAbilitySearch, setSecondaryAbilitySearch] = useState("");

  useEffect(() => {
    setTagInput("");
    setMainAbilitySearch("");
    setSecondaryAbilitySearch("");
  }, [profile?.key]);

  if (!profile || !draft) {
    return <div className="card flex min-h-[420px] items-center justify-center text-sm text-white/50">Select an AI profile.</div>;
  }

  const tags = tagsFromData(draft);
  const mainRefs = abilityRefsFromData(draft, "main_abilities");
  const secondaryRefs = abilityRefsFromData(draft, "secondary_abilities");

  function updateField(key: string, value: string) {
    onDraftChange(setStringField(draft!, key, value));
  }

  function updateNumber(key: string, value: string) {
    onDraftChange(setNumericField(draft!, key, value));
  }

  function setTags(nextTags: string[]) {
    onDraftChange({ ...draft!, tags: uniqueSorted(nextTags) });
  }

  function addTag() {
    const tag = normalizeTag(tagInput);
    if (!tag) return;
    setTags([...tags, tag]);
    setTagInput("");
  }

  function addAbility(key: "main_abilities" | "secondary_abilities", id: string) {
    const refs = abilityRefsFromData(draft!, key);
    if (refs.some((ref) => ref.id === id)) return;
    onDraftChange({ ...draft!, [key]: [...refs, { id: Number.isFinite(Number(id)) ? Number(id) : id }] });
  }

  function removeAbility(key: "main_abilities" | "secondary_abilities", id: string) {
    onDraftChange({ ...draft!, [key]: abilityRefsFromData(draft!, key).filter((ref) => ref.id !== id) });
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-semibold text-white">{profile.fileName}</div>
            <div className="mt-1 break-all text-sm text-white/50">{profile.relativePath}</div>
          </div>
          <button type="button" className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!dirty || saving || !!profile.parseError} onClick={onSave}>
            {saving ? "Saving..." : "Save Changes To Build"}
          </button>
        </div>

        {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}
        {profile.parseError ? <StatusBanner tone="error" message={profile.parseError} /> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <div className="label">AI Type</div>
            <input className="input mt-1" value={stringValue(draft, "ai_type")} onChange={(event) => updateField("ai_type", event.target.value)} />
          </label>
          <label>
            <div className="label">Script</div>
            <input className="input mt-1" value={stringValue(draft, "script")} onChange={(event) => updateField("script", event.target.value)} />
          </label>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <div className="text-lg font-semibold text-white">Tags And Notes</div>
          <div className="mt-1 text-sm text-white/55">Tags are searchable from the profile browser. Notes are saved directly into this AI JSON file.</div>
        </div>
        <div>
          <div className="label">Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-300/15"
                onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                title="Remove tag"
              >
                {tag} x
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="input"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add tag..."
            />
            <button type="button" className="btn" onClick={addTag}>
              Add
            </button>
          </div>
        </div>
        <label>
          <div className="label">Notes About The AI</div>
          <textarea className="input mt-1 min-h-[120px]" value={stringValue(draft, "notes")} onChange={(event) => updateField("notes", event.target.value)} />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RangeSelector
          label="Aggro Range"
          description="Distance used by AI perception before it can acquire or keep combat targets."
          value={numericInputValue(draft, "aggro_range")}
          onChange={(next) => updateNumber("aggro_range", next)}
        />
        <RangeSelector
          label="Weapon Range"
          description="Distance used by AI weapon checks before it can fire its main abilities."
          value={numericInputValue(draft, "weapon_range")}
          onChange={(next) => updateNumber("weapon_range", next)}
        />
      </div>

      <AbilityPicker
        title="Main Abilities"
        description="Primary attacks this AI can use. Search by database ID, name, or description and click to select."
        refs={mainRefs}
        options={abilityOptions}
        search={mainAbilitySearch}
        setSearch={setMainAbilitySearch}
        onAdd={(id) => addAbility("main_abilities", id)}
        onRemove={(id) => removeAbility("main_abilities", id)}
      />

      <AbilityPicker
        title="Secondary Abilities"
        description="Optional support abilities with the same searchable selector."
        refs={secondaryRefs}
        options={abilityOptions}
        search={secondaryAbilitySearch}
        setSearch={setSecondaryAbilitySearch}
        onAdd={(id) => addAbility("secondary_abilities", id)}
        onRemove={(id) => removeAbility("secondary_abilities", id)}
      />

      <div className="card space-y-4">
        <div>
          <div className="text-lg font-semibold text-white">Behavior Values</div>
          <div className="mt-1 text-sm text-white/55">These fields are numeric knobs read by individual AI scripts. Empty fields are omitted from the saved JSON.</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {NUMERIC_FIELDS.map((field) => (
            <NumericField
              key={field.key}
              label={field.label}
              description={field.description}
              value={numericInputValue(draft, field.key)}
              onChange={(next) => updateNumber(field.key, next)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Mobs Using This AI</div>
          <PillList values={profile.referencedByMobIds} empty="No mobs currently reference this profile." />
        </div>
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Runtime Sections</div>
          <PillList values={profile.behaviorSections} empty="No behavior sections found." />
        </div>
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-semibold text-white">Saved JSON Preview</div>
        <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs leading-5 text-white/75">{JSON.stringify(draft, null, 2)}</pre>
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
  const [drafts, setDrafts] = useState<Record<string, JsonObject>>({});
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, string>>({});
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  async function loadProfiles(preferredKey?: string | null) {
    setLoading(true);
    try {
      const response = await fetch("/api/ai");
      const json = (await response.json().catch(() => EMPTY_RESPONSE)) as AiProfilesResponse;
      setPayload(json);
      const nextDrafts = Object.fromEntries(json.profiles.map((profile) => [profile.key, cloneData(profile.data)]));
      const nextSnapshots = Object.fromEntries(Object.entries(nextDrafts).map(([key, draft]) => [key, JSON.stringify(draft)]));
      setDrafts(nextDrafts);
      setSavedSnapshots(nextSnapshots);
      setSelectedKey((current) => {
        const requested = preferredKey ?? current;
        if (requested && json.profiles.some((profile) => profile.key === requested)) return requested;
        return json.profiles[0]?.key ?? null;
      });
    } catch (error) {
      setPayload({
        ...EMPTY_RESPONSE,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedDataVersion]);

  const allTags = useMemo(() => uniqueSorted(payload.profiles.flatMap((profile) => tagsFromData(drafts[profile.key] ?? cloneData(profile.data)))), [drafts, payload.profiles]);
  const scriptOptions = useMemo(() => uniqueSorted(payload.profiles.map((profile) => profile.script ?? "No script")), [payload.profiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return payload.profiles.filter((profile) => {
      const draft = drafts[profile.key] ?? cloneData(profile.data);
      const draftTags = tagsFromData(draft);
      if (scriptFilter) {
        const scriptLabel = profile.script ?? "No script";
        if (scriptLabel !== scriptFilter) return false;
      }
      if (usageFilter === "used" && profile.referencedByMobCount === 0) return false;
      if (usageFilter === "unused" && profile.referencedByMobCount > 0) return false;
      if (usageFilter === "errors" && !profile.parseError) return false;
      if (tagFilters.length && !tagFilters.every((tag) => draftTags.includes(tag))) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        profile.fileName,
        profile.id,
        profile.aiType,
        profile.script ?? "",
        stringValue(draft, "notes"),
        ...draftTags,
        ...profile.aliases,
        ...profile.behaviorSections,
        ...profile.referencedByMobIds,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [drafts, payload.profiles, query, scriptFilter, tagFilters, usageFilter]);

  const selectedProfile = useMemo(() => {
    if (selectedKey) {
      const selected = filteredProfiles.find((profile) => profile.key === selectedKey) ?? payload.profiles.find((profile) => profile.key === selectedKey);
      if (selected) return selected;
    }
    return filteredProfiles[0] ?? null;
  }, [filteredProfiles, payload.profiles, selectedKey]);

  const selectedDraft = selectedProfile ? drafts[selectedProfile.key] ?? null : null;
  const selectedDirty = selectedProfile && selectedDraft ? JSON.stringify(selectedDraft) !== savedSnapshots[selectedProfile.key] : false;

  function updateSelectedDraft(next: JsonObject) {
    if (!selectedProfile) return;
    setDrafts((current) => ({ ...current, [selectedProfile.key]: next }));
    setStatus(null);
  }

  function toggleTagFilter(tag: string) {
    setTagFilters((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  async function saveSelectedProfile() {
    if (!selectedProfile || !selectedDraft || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/ai/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedProfile.fileName,
          profile: selectedDraft,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setStatus({ tone: "error", message: result?.error || "Could not save AI JSON into the configured game build." });
        return;
      }
      setSavedSnapshots((current) => ({ ...current, [selectedProfile.key]: JSON.stringify(selectedDraft) }));
      setStatus({ tone: "success", message: `Saved ${selectedProfile.fileName} into the live AI JSON directory.` });
      publishSharedDataWorkspaceUpdate();
      await loadProfiles(selectedProfile.key);
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">AI JSON Manager</h1>
        <p className="max-w-4xl text-white/65">
          Browse and tune AI profile JSON files generated in-game under the active Gemini Station local game root.
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
        <StatusBanner tone="neutral" message={`Mobs reference AI types without matching AI JSON aliases: ${payload.summary.referencedByMobsOnly.join(", ")}`} />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[420px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <div className="label">Search</div>
              <input className="input mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AI type, tag, notes, script, mob..." />
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
                    type="button"
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
            <div>
              <div className="label">Tags</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${
                      tagFilters.includes(tag) ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"
                    }`}
                    onClick={() => toggleTagFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
                {!allTags.length ? <span className="text-sm text-white/45">No tags yet.</span> : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {filteredProfiles.map((profile) => {
              const draft = drafts[profile.key] ?? cloneData(profile.data);
              const selected = selectedProfile?.key === profile.key;
              const dirty = JSON.stringify(draft) !== savedSnapshots[profile.key];
              return (
                <button
                  key={profile.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selected ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-panel hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                  onClick={() => {
                    setSelectedKey(profile.key);
                    setStatus(null);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {profile.fileName}
                        {dirty ? <span className="ml-2 text-cyan-200">*</span> : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-white/50">{stringValue(draft, "ai_type") || profile.aiType}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${profile.parseError ? "bg-red-400/15 text-red-100" : "bg-white/10 text-white/65"}`}>
                      {profile.referencedByMobCount}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs text-white/45">{profile.script ?? "No script"}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsFromData(draft).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/55">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            {!filteredProfiles.length ? <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">No AI profiles match the current filters.</div> : null}
          </div>
        </div>

        <SelectedProfileEditor
          profile={selectedProfile}
          draft={selectedDraft}
          abilityOptions={payload.abilityOptions}
          dirty={!!selectedDirty}
          saving={saving}
          status={status}
          onDraftChange={updateSelectedDraft}
          onSave={() => void saveSelectedProfile()}
        />
      </div>
    </div>
  );
}
