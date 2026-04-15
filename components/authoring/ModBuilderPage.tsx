"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import ModWorkshop from "@components/authoring/ModWorkshop";
import { normalizeImportedMod, ModDraft, validateModDrafts } from "@lib/authoring";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

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

export default function ModManagerPage() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [mods, setMods] = useState<ModDraft[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [actionStatus, setActionStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const workspaceHasErrors = useMemo(() => validateModDrafts(mods).some((message) => message.level === "error"), [mods]);

  useEffect(() => {
    let cancelled = false;

    async function loadMods() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/mods?_v=${sharedDataVersion}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({ data: [] }));
        if (cancelled) return;

        const loadedMods = Array.isArray(json.data) ? (json.data as ExistingModRow[]).map((mod) => normalizeImportedMod(mod)) : [];
        startTransition(() => {
          setMods(loadedMods);
        });
        setWorkspaceMessage(loadedMods.length ? "" : "No mods were found in the active local game root.");
      } catch {
        if (cancelled) return;
        startTransition(() => {
          setMods([]);
        });
        setWorkspaceMessage("Mods could not be loaded from the active local game root.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMods();

    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  async function handleSaveAllModsToBuild() {
    if (workspaceHasErrors) {
      setActionStatus({ tone: "error", message: "Fix mod validation errors before saving Mods.json into the configured game build." });
      return;
    }

    try {
      const response = await fetch("/api/mods/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drafts: mods,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setActionStatus({ tone: "error", message: payload?.error || "Could not save Mods.json into the configured game build." });
        return;
      }

      setActionStatus({ tone: "success", message: `Saved all ${mods.length} mods into the live Mods.json file.` });
    } catch (error) {
      setActionStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-4xl">
          <h1 className="page-title mb-1">Mod Manager</h1>
          <p className="text-sm text-white/70">
            Manage the full current mod list from the active local game root, auto-generate new mods into that list, then export runtime-ready JSON when the workspace is ready.
          </p>
        </div>
        <button className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={isLoading || workspaceHasErrors} onClick={() => void handleSaveAllModsToBuild()}>
          Save All Mods To Build
        </button>
      </div>

      {actionStatus ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            actionStatus.tone === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"
          }`}
        >
          {actionStatus.message}
        </div>
      ) : null}

      <div className="card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              The manager loads the current runtime mod list directly from the local source. New, cloned, bulk-created, and auto-generated mods are added into that same full list.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Current mods</div>
                <div className="mt-1 text-2xl font-semibold">{mods.length}</div>
                <div className="mt-1 text-xs text-white/50">Loaded from the active local source and ready to edit/export.</div>
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-3">
                <div className="label">Generator mode</div>
                <div className="mt-1 text-2xl font-semibold">{isLoading ? "Loading" : "Ready"}</div>
                <div className="mt-1 text-xs text-white/50">Auto generation appends new mods into the current manager list.</div>
              </div>
            </div>
          </div>
        </div>

        {workspaceMessage ? <div className="text-sm text-yellow-200">{workspaceMessage}</div> : null}
      </div>

      <ModWorkshop mods={mods} onChange={setMods} />
    </div>
  );
}
