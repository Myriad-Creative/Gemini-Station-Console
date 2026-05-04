"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogKind = "factions" | "classes";

type FactionCatalogEntry = {
  name: string;
  defaultPoints: number | null;
  forcedPoints: number | null;
  source: "game" | "console";
};

type TaxonomyPayload = {
  ok?: boolean;
  factions?: FactionCatalogEntry[];
  classes?: string[];
  sources?: {
    factions?: string;
    classes?: string;
  };
  error?: string;
};

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map(cleanName).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export default function TaxonomyManager({ kind }: { kind: CatalogKind }) {
  const [payload, setPayload] = useState<TaxonomyPayload | null>(null);
  const [entries, setEntries] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const title = kind === "factions" ? "Faction Manager" : "Class Manager";
  const noun = kind === "factions" ? "faction" : "class";

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setStatus("");
      try {
        const response = await fetch("/api/taxonomy", { cache: "no-store" });
        const json = (await response.json().catch(() => ({}))) as TaxonomyPayload;
        if (cancelled) return;
        setPayload(json);
        setEntries(kind === "factions" ? uniqueSorted((json.factions ?? []).map((entry) => entry.name)) : uniqueSorted(json.classes ?? []));
        if (!response.ok || !json.ok) setStatus(json.error || "Could not load the taxonomy catalog.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not load the taxonomy catalog.");
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const gameFactionByName = useMemo(() => {
    return new Map((payload?.factions ?? []).filter((entry) => entry.source === "game").map((entry) => [entry.name, entry]));
  }, [payload]);

  function addEntry() {
    const cleaned = cleanName(newEntry);
    if (!cleaned) return;
    setEntries((current) => uniqueSorted([...current, cleaned]));
    setNewEntry("");
  }

  async function saveEntries() {
    setSaving(true);
    setStatus("");
    try {
      const body = kind === "factions" ? { factions: entries } : { classes: entries };
      const response = await fetch("/api/taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as TaxonomyPayload;
      if (!response.ok || !json.ok) {
        setStatus(json.error || `Could not save ${noun} catalog.`);
        return;
      }
      setPayload(json);
      setEntries(kind === "factions" ? uniqueSorted((json.factions ?? []).map((entry) => entry.name)) : uniqueSorted(json.classes ?? []));
      setStatus(`Saved ${entries.length} ${noun}${entries.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not save ${noun} catalog.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">{title}</h1>
        <p className="max-w-3xl text-sm text-white/65">
          This catalog is used by console editors that need strict {noun} dropdowns. {kind === "factions" ? "It seeds from the active game faction list until you save a console master list." : "It starts with the five player classes."}
        </p>
      </div>

      {status ? <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">{status}</div> : null}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-white">{title}</div>
            <div className="mt-1 text-sm text-white/55">
              Source: {payload?.sources?.[kind] ?? "loading"} · {entries.length} entries
            </div>
          </div>
          <button className="btn-save-build disabled:cursor-default disabled:opacity-40" onClick={saveEntries} disabled={saving}>
            {saving ? "Saving..." : "Save Changes to Build"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className="input"
            value={newEntry}
            onChange={(event) => setNewEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEntry();
              }
            }}
            placeholder={`Add ${noun} name`}
          />
          <button className="rounded bg-white/5 px-4 py-2 text-sm hover:bg-white/10" onClick={addEntry}>
            Add {kind === "factions" ? "Faction" : "Class"}
          </button>
        </div>

        <div className="space-y-2">
          {entries.map((entry) => {
            const gameFaction = gameFactionByName.get(entry);
            return (
              <div key={entry} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div>
                  <div className="font-medium text-white">{entry}</div>
                  {kind === "factions" && gameFaction ? (
                    <div className="mt-1 text-xs text-white/45">
                      Game faction · default {gameFaction.defaultPoints ?? "n/a"} · forced {gameFaction.forcedPoints ?? "none"}
                    </div>
                  ) : null}
                </div>
                <button
                  className="rounded border border-red-300/25 bg-red-400/10 px-3 py-1.5 text-sm text-red-100 hover:bg-red-400/15"
                  onClick={() => setEntries((current) => current.filter((value) => value !== entry))}
                >
                  Remove
                </button>
              </div>
            );
          })}
          {!entries.length ? <div className="rounded border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">No {noun}s in this catalog.</div> : null}
        </div>
      </div>
    </div>
  );
}
