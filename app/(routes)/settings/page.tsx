"use client";
import { useEffect, useState } from "react";
import SourceStatus from "@components/SourceStatus";
import { publishSharedDataWorkspaceUpdate, useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type LocalGameSourceState = {
  active: boolean;
  gameRootPath: string | null;
  dataRootPath: string | null;
  assetsRootPath: string | null;
  missionsRootPath: string | null;
  lastValidated: string | null;
  available: {
    data: boolean;
    assets: boolean;
    missions: boolean;
  };
  errors: string[];
};

type SettingsData = {
  errors: string[];
  lastLoaded: string | null;
  localGameSource: LocalGameSourceState;
};

const EMPTY_LOCAL_GAME_SOURCE: LocalGameSourceState = {
  active: false,
  gameRootPath: null,
  dataRootPath: null,
  assetsRootPath: null,
  missionsRootPath: null,
  lastValidated: null,
  available: {
    data: false,
    assets: false,
    missions: false,
  },
  errors: [],
};

export default function SettingsPage() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [gameRootPath, setGameRootPath] = useState("");
  const [settings, setSettings] = useState<SettingsData>({
    errors: [],
    lastLoaded: null,
    localGameSource: EMPTY_LOCAL_GAME_SOURCE,
  });
  const [status, setStatus] = useState<string>("");

  const loadSettings = async () => {
    try {
      const r = await fetch("/api/settings");
      const j = await r.json();
      const next = {
        errors: j.errors || [],
        lastLoaded: typeof j.lastLoaded === "string" ? j.lastLoaded : null,
        localGameSource: j.localGameSource || EMPTY_LOCAL_GAME_SOURCE,
      };
      setSettings(next);
      setGameRootPath((current) => current || next.localGameSource.gameRootPath || "");
    } catch (e:any) {
      setSettings({
        errors: [String(e?.message || e)],
        lastLoaded: null,
        localGameSource: EMPTY_LOCAL_GAME_SOURCE,
      });
    }
  };

  useEffect(() => { loadSettings(); }, [sharedDataVersion]);

  const saveLocalGameSource = async () => {
    setStatus("Saving local game root…");
    try {
      const r = await fetch("/api/settings/game-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameRootPath }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      publishSharedDataWorkspaceUpdate();
      setStatus("Local game root is active. The console now reads data, assets, and missions directly from that Gemini Station folder.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  const clearLocalGameSource = async () => {
    setStatus("Clearing local game root…");
    try {
      const r = await fetch("/api/settings/game-source", { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      publishSharedDataWorkspaceUpdate();
      setStatus("Cleared the local game root. The console is now empty until you set another Gemini Station folder.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <SourceStatus showSettingsLink={false} />
      <div className="card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-4">
          <div className="text-lg font-semibold text-white">Local Game Root</div>
          <div className="mt-1 text-sm text-white/55">
            This is now the only runtime source of content for the console. Point the console at the Gemini Station game root and it will read
            <code> /data</code>, <code>/assets</code>, and <code>/scripts/system/missions/missions</code> directly from that folder.
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Status</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.localGameSource.active ? "Local source active" : "No local source"}</div>
          <div className="mt-1 text-xs text-white/55">{settings.localGameSource.gameRootPath || "No game root configured yet"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Data</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.localGameSource.available.data ? "Found" : "Missing"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Assets</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.localGameSource.available.assets ? "Found" : "Missing"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Missions</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.localGameSource.available.missions ? "Found" : "Missing"}</div>
        </div>

        <div className="md:col-span-4">
          <div className="label">Current Local Game Root</div>
          <div className="input mt-1 break-all bg-white/5 font-mono text-xs">
            {settings.localGameSource.gameRootPath || "No Gemini Station root is currently configured."}
          </div>
          <div className="mt-2 text-xs text-white/55">
            {settings.localGameSource.lastValidated
              ? `Last validated ${new Date(settings.localGameSource.lastValidated).toLocaleString()}`
              : "Set the local game root to point the console at your Gemini Station folder."}
          </div>
          {settings.lastLoaded ? (
            <div className="mt-1 text-xs text-white/45">Last indexed {new Date(settings.lastLoaded).toLocaleString()}</div>
          ) : null}
        </div>

        <div className="md:col-span-4">
          <div className="label">Gemini Station Game Root Path</div>
          <input
            className="input mt-1"
            value={gameRootPath}
            onChange={(event) => setGameRootPath(event.target.value)}
            placeholder="/Users/you/.../Gemini-Station"
          />
          <div className="mt-2 text-xs text-white/55">
            Because this runs in the browser, the reliable local-server workflow is to paste the absolute path to the Gemini Station root folder here once.
          </div>
        </div>

        {settings.localGameSource.errors.length ? (
          <div className="md:col-span-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            {settings.localGameSource.errors.join(" ")}
          </div>
        ) : null}

        <div className="md:col-span-4 flex flex-wrap gap-2">
          <button className="btn" onClick={saveLocalGameSource}>
            Set Local Game Root
          </button>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearLocalGameSource}>
            Clear Local Game Root
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-semibold text-white">Runtime Source Layout</div>
        <div className="text-sm text-white/60">
          Once the local game root is configured, the entire console reads from these paths and no separate dataset imports are needed:
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="label">Data</div>
            <div className="mt-2 break-all font-mono text-xs text-white/75">{settings.localGameSource.dataRootPath || "/data"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="label">Assets</div>
            <div className="mt-2 break-all font-mono text-xs text-white/75">{settings.localGameSource.assetsRootPath || "/assets"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="label">Missions</div>
            <div className="mt-2 break-all font-mono text-xs text-white/75">
              {settings.localGameSource.missionsRootPath || "/scripts/system/missions/missions"}
            </div>
          </div>
        </div>
      </div>

      {settings.errors?.length ? (
        <div className="card text-red-400 text-sm">Errors: {settings.errors.join("; ")}</div>
      ) : null}
      {status ? <div className="card text-white/70">{status}</div> : null}
    </div>
  );
}
