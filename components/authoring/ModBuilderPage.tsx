"use client";

import { startTransition, useEffect, useState } from "react";
import ModWorkshop from "@components/authoring/ModWorkshop";
import {
  MOD_STORAGE_KEY,
  ModDraft,
  createModDraft,
  hydrateStoredModDraft,
  normalizeImportedMod,
} from "@lib/authoring";

type ExistingModRow = {
  id: string;
  name: string;
  slot: string;
  classRestriction?: string[];
  statsCapOverride?: boolean;
  isQuestReward?: boolean;
  isDungeonDrop?: boolean;
  isBossDrop?: boolean;
  levelRequirement?: number;
  itemLevel?: number;
  rarity?: number;
  durability?: number;
  sellPrice?: number;
  stats?: Record<string, number>;
  abilities?: Array<number | string>;
  icon?: string;
  description?: string;
};

function loadDrafts<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function ModBuilderPage() {
  const [mods, setMods] = useState<ModDraft[]>([createModDraft()]);
  const [existingMods, setExistingMods] = useState<ExistingModRow[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadDrafts<ModDraft[]>(MOD_STORAGE_KEY, []);
    setMods(stored.length ? stored.map((mod) => hydrateStoredModDraft(mod)) : [createModDraft()]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(mods));
  }, [hydrated, mods]);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleData() {
      try {
        const response = await fetch("/api/mods");
        const json = await response.json().catch(() => ({ data: [] }));
        if (cancelled) return;
        setExistingMods(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (cancelled) return;
        setExistingMods([]);
      }
    }

    loadConsoleData();
    return () => {
      cancelled = true;
    };
  }, []);

  function seedModDrafts() {
    if (!existingMods.length) {
      setWorkspaceMessage("No mod data is currently loaded in the console.");
      return;
    }

    const seeded = existingMods.map((mod) => normalizeImportedMod(mod));
    startTransition(() => {
      setMods(seeded.length ? seeded : [createModDraft()]);
    });
    setWorkspaceMessage(`Seeded ${seeded.length} mod draft(s) from the current console data.`);
  }

  function clearModDrafts() {
    setMods([createModDraft()]);
    setWorkspaceMessage("Cleared mod drafts.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Mod Builder</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Build and auto-generate mod drafts with the current budget rules, then export JSON that matches the game runtime schema.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              Seed from the live console mod dataset when you want a starting point, or keep building new drafts in the builder and auto-generator.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Draft mods</div>
                <div className="mt-1 text-2xl font-semibold">{mods.length}</div>
                <div className="mt-1 text-xs text-white/50">Console mod seeds available: {existingMods.length}</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Generator mode</div>
                <div className="mt-1 text-2xl font-semibold">Ready</div>
                <div className="mt-1 text-xs text-white/50">Auto generation follows the configured affinity and budget rules.</div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn justify-center" onClick={seedModDrafts}>
              Seed Mod Drafts
            </button>
            <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearModDrafts}>
              Clear Mods
            </button>
          </div>
        </div>

        {workspaceMessage ? <div className="text-sm text-accent">{workspaceMessage}</div> : null}
      </div>

      <ModWorkshop mods={mods} onChange={setMods} consoleModCount={existingMods.length} />
    </div>
  );
}
