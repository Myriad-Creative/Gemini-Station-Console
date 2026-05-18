"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBanner, SummaryCard } from "@components/data-tools/shared";
import { buildIconSrc } from "@lib/icon-src";
import type { ShipJsonObject, ShipJsonValue, ShipProfile, ShipProfilesResponse } from "@lib/ship-lab/types";
import {
  DEFAULT_MOD_SLOT_KEYS,
  DEFAULT_SHIP_STATS,
  cloneJson,
  createBlankShipData,
  createShipDataFromProfile,
  extraJsonFromProfile,
  fileNameForShipId,
  labelize,
  numberOrStringFromInput,
  parseJsonArrayText,
  parseJsonObjectText,
} from "@lib/ship-lab/utils";

type StatusState = { tone: "neutral" | "success" | "error"; message: string } | null;

type EditableShip = {
  key: string;
  sourceFileName: string | null;
  profileIndex: number | null;
  isNew: boolean;
  data: ShipJsonObject;
  extraJson: string;
  abilitiesJson: string;
  tagsText: string;
};

const EMPTY_RESPONSE: ShipProfilesResponse = {
  ok: false,
  sourceRoot: null,
  shipsDirectory: null,
  summary: { totalProfiles: 0, starterCount: 0, parseErrors: 0 },
  profiles: [],
};

function asObject(value: ShipJsonValue | undefined): ShipJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ShipJsonObject;
}

function stringValue(value: ShipJsonValue | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function booleanValue(value: ShipJsonValue | undefined) {
  return value === true;
}

function numericText(value: ShipJsonValue | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function editableFromProfile(profile: ShipProfile): EditableShip {
  const data = cloneJson(profile.data ?? {});
  return {
    key: profile.key,
    sourceFileName: profile.fileName,
    profileIndex: profile.profileIndex,
    isNew: false,
    data,
    extraJson: extraJsonFromProfile(data),
    abilitiesJson: JSON.stringify(profile.abilities ?? [], null, 2),
    tagsText: (profile.tags ?? []).join(", "),
  };
}

function editableFromData(data: ShipJsonObject, sourceFileName: string | null, isNew: boolean): EditableShip {
  const cloned = cloneJson(data);
  return {
    key: `${String(cloned.id ?? "ship")}-${Date.now()}`,
    sourceFileName,
    profileIndex: null,
    isNew,
    data: cloned,
    extraJson: extraJsonFromProfile(cloned),
    abilitiesJson: JSON.stringify(Array.isArray(cloned.abilities) ? cloned.abilities : [], null, 2),
    tagsText: Array.isArray(cloned.tags) ? cloned.tags.map((entry) => String(entry)).join(", ") : "",
  };
}

function serializeEditableShip(ship: EditableShip) {
  const extra = parseJsonObjectText(ship.extraJson, "Extra JSON");
  const abilities = parseJsonArrayText(ship.abilitiesJson, "Abilities JSON");
  const base = cloneJson(ship.data);
  const next: ShipJsonObject = {
    ...extra,
    id: String(base.id ?? "").trim(),
    display_name: String(base.display_name ?? "").trim(),
    description: String(base.description ?? "").trim(),
    scene: String(base.scene ?? "").trim(),
    sprite: String(base.sprite ?? "").trim(),
    starter: base.starter === true,
    purchase: asObject(base.purchase),
    stats: asObject(base.stats),
    mod_slots: asObject(base.mod_slots),
    cargo: asObject(base.cargo),
  };

  const inherits = String(base.inherits ?? "").trim();
  if (inherits) next.inherits = inherits;
  const tags = splitTags(ship.tagsText);
  if (tags.length) next.tags = tags;
  if (abilities.length) next.abilities = abilities;

  for (const [key, value] of Object.entries(base)) {
    if (key in next || key === "tags" || key === "abilities" || key === "inherits") continue;
    next[key] = value;
  }

  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => {
      if (value === undefined) return false;
      if (typeof value === "string" && !value.trim()) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
      return true;
    }),
  ) as ShipJsonObject;
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="label">{label}</div>
      <input className="input mt-1" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function ShipLabApp() {
  const [payload, setPayload] = useState<ShipProfilesResponse>(EMPTY_RESPONSE);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableShip | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newStatKey, setNewStatKey] = useState("");
  const [newSlotKey, setNewSlotKey] = useState("");

  async function loadShips(selectId?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/ships", { cache: "no-store" });
      const nextPayload = (await response.json()) as ShipProfilesResponse;
      setPayload(nextPayload);
      const selectable = nextPayload.profiles.find((profile) => profile.data && (selectId ? profile.id === selectId : true)) ?? null;
      if (selectable) {
        setSelectedKey(selectable.key);
        setDraft(editableFromProfile(selectable));
      } else {
        setSelectedKey(null);
        setDraft(null);
      }
      setStatus(nextPayload.ok ? null : { tone: "error", message: nextPayload.error ?? "Unable to load ship profiles." });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadShips();
  }, []);

  const existingIds = useMemo(() => payload.profiles.map((profile) => profile.id), [payload.profiles]);
  const selectedProfile = useMemo(() => payload.profiles.find((profile) => profile.key === selectedKey) ?? null, [payload.profiles, selectedKey]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payload.profiles.filter((profile) => {
      if (!query) return true;
      return [profile.id, profile.displayName, profile.description, profile.fileName, profile.sprite, profile.scene].join(" ").toLowerCase().includes(query);
    });
  }, [payload.profiles, search]);

  function updateDraftData(updater: (current: ShipJsonObject) => ShipJsonObject) {
    setDraft((current) => (current ? { ...current, data: updater(current.data) } : current));
  }

  function setTopLevelField(key: string, value: ShipJsonValue) {
    updateDraftData((current) => ({ ...current, [key]: value }));
  }

  function setObjectField(section: string, key: string, value: ShipJsonValue | undefined) {
    updateDraftData((current) => {
      const source = asObject(current[section]);
      const next = { ...source };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...current, [section]: next };
    });
  }

  function addObjectKey(section: "stats" | "mod_slots", key: string, clear: () => void) {
    const normalized = key.trim().replace(/\s+/g, "_");
    if (!normalized) return;
    setObjectField(section, normalized, 0);
    clear();
  }

  function createNewShip() {
    const data = createBlankShipData(existingIds);
    setSelectedKey(null);
    setDraft(editableFromData(data, null, true));
    setStatus({ tone: "neutral", message: "New unsaved ship profile ready." });
  }

  function duplicateShip() {
    if (!selectedProfile) return;
    const data = createShipDataFromProfile(selectedProfile, existingIds);
    setSelectedKey(null);
    setDraft(editableFromData(data, null, true));
    setStatus({ tone: "neutral", message: "Duplicated ship profile as a new unsaved file." });
  }

  async function saveShip() {
    if (!draft) return;
    setSaving(true);
    try {
      const profile = serializeEditableShip(draft);
      const targetFileName = draft.isNew || draft.profileIndex !== null ? fileNameForShipId(String(profile.id ?? "")) : draft.sourceFileName || fileNameForShipId(String(profile.id ?? ""));
      const response = await fetch("/api/ships/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: targetFileName, profile }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; savedPath?: string; fileName?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Ship profile save failed.");
      setStatus({ tone: "success", message: `Saved ${result.fileName} to the game folder.` });
      await loadShips(String(profile.id ?? ""));
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  const currentStats = asObject(draft?.data.stats);
  const currentSlots = asObject(draft?.data.mod_slots);
  const currentPurchase = asObject(draft?.data.purchase);
  const currentCargo = asObject(draft?.data.cargo);
  const previewJson = useMemo(() => {
    if (!draft) return "";
    try {
      return JSON.stringify(serializeEditableShip(draft), null, 2);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [draft]);

  return (
    <main className="container space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-2">Player Ship Lab</h1>
          <p className="max-w-4xl text-sm leading-6 text-white/60">
            Manage player ship JSON profiles from the active game root. Profiles are loaded from <span className="font-mono text-white/75">data/ships</span> and saved back as ship JSON files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={createNewShip}>
            New Ship
          </button>
          <button
            type="button"
            className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
            disabled={!selectedProfile}
            onClick={duplicateShip}
          >
            Duplicate
          </button>
          <button type="button" className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={!draft || saving} onClick={saveShip}>
            {saving ? "Saving..." : "Save Ship To Game"}
          </button>
        </div>
      </div>

      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <div className="grid-auto">
        <SummaryCard label="Ship Profiles" value={payload.summary.totalProfiles} />
        <SummaryCard label="Starter Ships" value={payload.summary.starterCount} />
        <SummaryCard label="Parse Errors" value={payload.summary.parseErrors} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px,minmax(0,1fr)]">
        <aside className="card h-fit space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Ship Browser</div>
              <div className="mt-1 text-xs text-white/45">{payload.shipsDirectory ?? "No local ship directory"}</div>
            </div>
            <button type="button" className="rounded border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10" onClick={() => void loadShips()}>
              Reload
            </button>
          </div>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ships, files, sprites..." />
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {loading ? <div className="text-sm text-white/45">Loading ships...</div> : null}
            {!loading && filteredProfiles.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">No ship profiles found.</div> : null}
            {filteredProfiles.map((profile) => {
              const active = draft && !draft.isNew && selectedKey === profile.key;
              return (
                <button
                  key={profile.key}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    active ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                  onClick={() => {
                    setSelectedKey(profile.key);
                    setDraft(profile.data ? editableFromProfile(profile) : null);
                    setStatus(profile.parseError ? { tone: "error", message: profile.parseError } : null);
                  }}
                >
                  <div className="flex gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                      {profile.sprite ? <img src={buildIconSrc(profile.sprite, profile.id, profile.displayName, "0")} alt={profile.displayName} className="h-full w-full object-contain" /> : <span className="text-[10px] text-white/30">No Sprite</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{profile.displayName}</div>
                      <div className="mt-1 truncate font-mono text-xs text-white/45">{profile.id}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {profile.starter ? <span className="badge border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">Starter</span> : null}
                        {profile.parseError ? <span className="badge border border-red-300/20 bg-red-300/10 text-red-100">Parse Error</span> : null}
                        <span className="badge">{profile.fileName}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {!draft ? (
          <section className="card">
            <div className="text-xl font-semibold text-white">No Ship Selected</div>
            <div className="mt-2 text-sm text-white/55">Select a ship profile or create a new one.</div>
          </section>
        ) : (
          <section className="space-y-6">
            <div className="card">
              <div className="grid gap-4 lg:grid-cols-[180px,minmax(0,1fr)]">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                  {stringValue(draft.data.sprite) ? (
                    <img src={buildIconSrc(stringValue(draft.data.sprite), stringValue(draft.data.id), stringValue(draft.data.display_name), "0")} alt={stringValue(draft.data.display_name) || "Ship sprite"} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs uppercase tracking-[0.12em] text-white/30">No Sprite</span>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <InputField label="Ship ID" value={stringValue(draft.data.id)} onChange={(next) => setTopLevelField("id", next)} />
                  <InputField label="Display Name" value={stringValue(draft.data.display_name)} onChange={(next) => setTopLevelField("display_name", next)} />
                  <InputField label="Scene" value={stringValue(draft.data.scene)} onChange={(next) => setTopLevelField("scene", next)} />
                  <InputField label="Sprite" value={stringValue(draft.data.sprite)} onChange={(next) => setTopLevelField("sprite", next)} />
                  <InputField label="Inherits" value={stringValue(draft.data.inherits)} onChange={(next) => setTopLevelField("inherits", next)} placeholder="Optional parent ship ID" />
                  <ToggleField label="Starter Ship" checked={booleanValue(draft.data.starter)} onChange={(next) => setTopLevelField("starter", next)} />
                  <div className="md:col-span-2">
                    <div className="label">Description</div>
                    <textarea className="input mt-1 min-h-24" value={stringValue(draft.data.description)} onChange={(event) => setTopLevelField("description", event.target.value)} />
                  </div>
                  <InputField label="Tags" value={draft.tagsText} onChange={(next) => setDraft((current) => (current ? { ...current, tagsText: next } : current))} placeholder="comma, separated, tags" />
                  <div>
                    <div className="label">Save Target</div>
                    <div className="mt-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white/65">
                      {draft.isNew || draft.profileIndex !== null ? fileNameForShipId(stringValue(draft.data.id)) : draft.sourceFileName}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card space-y-4">
              <div>
                <div className="text-lg font-semibold text-white">Stats</div>
                <div className="mt-1 text-sm text-white/55">Runtime ship stats loaded from the JSON profile.</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from(new Set([...DEFAULT_SHIP_STATS, ...Object.keys(currentStats)])).map((key) => (
                  <InputField
                    key={key}
                    label={labelize(key)}
                    value={numericText(currentStats[key])}
                    onChange={(next) => setObjectField("stats", key, numberOrStringFromInput(next))}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input max-w-sm" value={newStatKey} onChange={(event) => setNewStatKey(event.target.value)} placeholder="Add custom stat key" />
                <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={() => addObjectKey("stats", newStatKey, () => setNewStatKey(""))}>
                  Add Stat
                </button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="card space-y-4">
                <div>
                  <div className="text-lg font-semibold text-white">Mod Slots</div>
                  <div className="mt-1 text-sm text-white/55">Slot counts by mod category.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from(new Set([...DEFAULT_MOD_SLOT_KEYS, ...Object.keys(currentSlots)])).map((key) => (
                    <InputField key={key} label={labelize(key)} value={numericText(currentSlots[key])} onChange={(next) => setObjectField("mod_slots", key, numberOrStringFromInput(next))} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input" value={newSlotKey} onChange={(event) => setNewSlotKey(event.target.value)} placeholder="Add custom slot key" />
                  <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={() => addObjectKey("mod_slots", newSlotKey, () => setNewSlotKey(""))}>
                    Add Slot
                  </button>
                </div>
              </div>

              <div className="card space-y-4">
                <div>
                  <div className="text-lg font-semibold text-white">Purchase and Cargo</div>
                  <div className="mt-1 text-sm text-white/55">Store pricing, availability, and cargo capacity.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InputField label="Buy Price" value={numericText(currentPurchase.buy_price)} onChange={(next) => setObjectField("purchase", "buy_price", numberOrStringFromInput(next))} />
                  <InputField label="Sell Price" value={numericText(currentPurchase.sell_price)} onChange={(next) => setObjectField("purchase", "sell_price", numberOrStringFromInput(next))} />
                  <ToggleField label="Available From Start" checked={currentPurchase.available_from_start === true} onChange={(next) => setObjectField("purchase", "available_from_start", next)} />
                  <InputField label="Base Cargo Slots" value={numericText(currentCargo.base_cargo_slots)} onChange={(next) => setObjectField("cargo", "base_cargo_slots", numberOrStringFromInput(next))} />
                  <InputField label="Cargo Compartment Limit" value={numericText(currentCargo.cargo_compartment_limit)} onChange={(next) => setObjectField("cargo", "cargo_compartment_limit", numberOrStringFromInput(next))} />
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="card space-y-3">
                <div>
                  <div className="text-lg font-semibold text-white">Abilities JSON</div>
                  <div className="mt-1 text-sm text-white/55">Optional raw abilities array for this ship profile.</div>
                </div>
                <textarea className="input min-h-40 font-mono text-sm" value={draft.abilitiesJson} onChange={(event) => setDraft((current) => (current ? { ...current, abilitiesJson: event.target.value } : current))} />
              </div>
              <div className="card space-y-3">
                <div>
                  <div className="text-lg font-semibold text-white">Extra JSON</div>
                  <div className="mt-1 text-sm text-white/55">Additional top-level properties preserved with this ship.</div>
                </div>
                <textarea className="input min-h-40 font-mono text-sm" value={draft.extraJson} onChange={(event) => setDraft((current) => (current ? { ...current, extraJson: event.target.value } : current))} />
              </div>
            </div>

            <div className="card space-y-3">
              <div className="text-lg font-semibold text-white">Output Preview</div>
              <pre className="max-h-[520px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/70">{previewJson}</pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
