"use client";
import { useEffect, useRef, useState } from "react";
import MissionWorkspaceManager from "@components/mission-lab/MissionWorkspaceManager";
import { publishSharedDataWorkspaceUpdate } from "@lib/shared-upload-client";

type UploadedAssetsState = {
  active: boolean;
  storagePath: string | null;
  fileCount: number;
  imageCount: number;
  totalBytes: number;
  lastImported: string | null;
};

type UploadedDataState = {
  active: boolean;
  storagePath: string | null;
  sourceLabel: string | null;
  fileCount: number;
  jsonCount: number;
  totalBytes: number;
  lastImported: string | null;
  available: {
    mods: boolean;
    items: boolean;
    mobs: boolean;
    abilities: boolean;
    comms: boolean;
    merchantProfiles: boolean;
    poi: boolean;
    regions: boolean;
    tradeRoutes: boolean;
    npcTraffic: boolean;
    tutorialEntries: boolean;
    tutorialTriggers: boolean;
    shipStatDescriptions: boolean;
    zones: boolean;
    stages: boolean;
    hazardBarrierProfiles: boolean;
  };
};

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
  localGameSource: LocalGameSourceState;
  uploadedAssets: UploadedAssetsState;
  uploadedData: UploadedDataState;
};

const EMPTY_UPLOADED_ASSETS: UploadedAssetsState = {
  active: false,
  storagePath: null,
  fileCount: 0,
  imageCount: 0,
  totalBytes: 0,
  lastImported: null,
};

const EMPTY_UPLOADED_DATA: UploadedDataState = {
  active: false,
  storagePath: null,
  sourceLabel: null,
  fileCount: 0,
  jsonCount: 0,
  totalBytes: 0,
  lastImported: null,
  available: {
    mods: false,
    items: false,
    mobs: false,
    abilities: false,
    comms: false,
    merchantProfiles: false,
    poi: false,
    regions: false,
    tradeRoutes: false,
    npcTraffic: false,
    tutorialEntries: false,
    tutorialTriggers: false,
    shipStatDescriptions: false,
    zones: false,
    stages: false,
    hazardBarrierProfiles: false,
  },
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
  const assetsFolderInputRef = useRef<HTMLInputElement | null>(null);
  const dataFolderInputRef = useRef<HTMLInputElement | null>(null);
  const dataZipInputRef = useRef<HTMLInputElement | null>(null);
  const [gameRootPath, setGameRootPath] = useState("");
  const [settings, setSettings] = useState<SettingsData>({
    errors: [],
    localGameSource: EMPTY_LOCAL_GAME_SOURCE,
    uploadedAssets: EMPTY_UPLOADED_ASSETS,
    uploadedData: EMPTY_UPLOADED_DATA,
  });
  const [status, setStatus] = useState<string>("");

  const loadSettings = async () => {
    try {
      const r = await fetch("/api/settings");
      const j = await r.json();
      const next = {
        errors: j.errors || [],
        localGameSource: j.localGameSource || EMPTY_LOCAL_GAME_SOURCE,
        uploadedAssets: j.uploadedAssets || EMPTY_UPLOADED_ASSETS,
        uploadedData: j.uploadedData || EMPTY_UPLOADED_DATA,
      };
      setSettings(next);
      setGameRootPath((current) => current || next.localGameSource.gameRootPath || "");
    } catch (e:any) {
      setSettings({
        errors: [String(e?.message || e)],
        localGameSource: EMPTY_LOCAL_GAME_SOURCE,
        uploadedAssets: EMPTY_UPLOADED_ASSETS,
        uploadedData: EMPTY_UPLOADED_DATA,
      });
    }
  };

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => {
    if (!assetsFolderInputRef.current) return;
    assetsFolderInputRef.current.setAttribute("webkitdirectory", "");
    assetsFolderInputRef.current.setAttribute("directory", "");
    if (dataFolderInputRef.current) {
      dataFolderInputRef.current.setAttribute("webkitdirectory", "");
      dataFolderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const importAssetsFolder = async (files: FileList | null) => {
    const pickedFiles = Array.from(files ?? []);
    if (!pickedFiles.length) return;

    setStatus(`Importing ${pickedFiles.length} asset files…`);
    try {
      const formData = new FormData();
      for (const file of pickedFiles as Array<File & { webkitRelativePath?: string }>) {
        const relativePath = file.webkitRelativePath || file.name;
        formData.append("files", file, relativePath);
        formData.append("paths", relativePath);
      }

      const r = await fetch("/api/settings/assets", {
        method: "POST",
        body: formData,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      const assetSummary = j.assets;
      setStatus(`Imported ${assetSummary.fileCount} asset files (${assetSummary.imageCount} image assets). Uploaded assets now resolve first across the console.`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    } finally {
      if (assetsFolderInputRef.current) assetsFolderInputRef.current.value = "";
    }
  };

  const clearUploadedAssets = async () => {
    setStatus("Clearing uploaded assets…");
    try {
      const r = await fetch("/api/settings/assets", { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      setStatus("Cleared uploaded assets. res://assets/... paths will stay unresolved until a new shared assets upload is added.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  const importDataFolder = async (files: FileList | null) => {
    const pickedFiles = Array.from(files ?? []);
    if (!pickedFiles.length) return;

    setStatus(`Importing ${pickedFiles.length} data files…`);
    try {
      const formData = new FormData();
      for (const file of pickedFiles as Array<File & { webkitRelativePath?: string }>) {
        const relativePath = file.webkitRelativePath || file.name;
        formData.append("files", file, relativePath);
        formData.append("paths", relativePath);
      }

      const r = await fetch("/api/settings/data", {
        method: "POST",
        body: formData,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      publishSharedDataWorkspaceUpdate();
      const summary = j.data;
      setStatus(`Imported shared data from folder upload. Found ${summary.fileCount} files and connected uploaded data for mods, items, mobs, abilities, comms, and merchant profiles where present.`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    } finally {
      if (dataFolderInputRef.current) dataFolderInputRef.current.value = "";
    }
  };

  const importDataZip = async (file: File | null) => {
    if (!file) return;

    setStatus(`Importing shared data from ${file.name}…`);
    try {
      const formData = new FormData();
      formData.append("archive", file, file.name);
      const r = await fetch("/api/settings/data", {
        method: "POST",
        body: formData,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      publishSharedDataWorkspaceUpdate();
      const summary = j.data;
      setStatus(`Imported shared data from ${file.name}. Found ${summary.fileCount} files and reloaded the console from the uploaded data source.`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    } finally {
      if (dataZipInputRef.current) dataZipInputRef.current.value = "";
    }
  };

  const clearUploadedData = async () => {
    setStatus("Clearing uploaded data…");
    try {
      const r = await fetch("/api/settings/data", { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      await loadSettings();
      publishSharedDataWorkspaceUpdate();
      setStatus("Cleared uploaded data. The console is now empty for non-mission datasets until a new shared data upload is added.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

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
      setStatus("Cleared the local game root. Upload-based sources are available again if you want to use them.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <div className="card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-4">
          <div className="text-lg font-semibold text-white">Local Game Root</div>
          <div className="mt-1 text-sm text-white/55">
            Preferred for local use. Point the console at the Gemini Station game root and it will read <code>/data</code>, <code>/assets</code>, and
            <code> /scripts/system/missions/missions</code> directly from that folder.
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
            Because this runs in the browser, the clean local-server approach is to paste the absolute path to the game root folder here.
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

      <div className="card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-4">
          <div className="text-lg font-semibold text-white">Shared Data Library</div>
          <div className="mt-1 text-sm text-white/55">
            Optional fallback for non-local use. Import the full <code>/data</code> directory here as either a zip or the unzipped folder. When a local game root is active above, that local source takes precedence.
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Status</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedData.active ? "Uploaded data active" : "No uploaded data"}</div>
          <div className="mt-1 text-xs text-white/55">{settings.uploadedData.sourceLabel || "No source imported yet"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Files</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedData.fileCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">JSON Files</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedData.jsonCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Storage Path</div>
          <div className="mt-2 break-all font-mono text-xs text-white/75">{settings.uploadedData.storagePath || "Not imported yet"}</div>
        </div>

        <div className="md:col-span-2">
          <div className="label">Last imported</div>
          <div className="input mt-1 bg-white/5">{settings.uploadedData.lastImported ? new Date(settings.uploadedData.lastImported).toLocaleString() : "—"}</div>
        </div>
        <div className="md:col-span-2">
          <div className="label">Detected Files</div>
          <div className="mt-1 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            {[
              ["Mods", settings.uploadedData.available.mods],
              ["Items", settings.uploadedData.available.items],
              ["Mobs", settings.uploadedData.available.mobs],
              ["Abilities", settings.uploadedData.available.abilities],
              ["Comms", settings.uploadedData.available.comms],
              ["Merchant Profiles", settings.uploadedData.available.merchantProfiles],
              ["POIs", settings.uploadedData.available.poi],
              ["Regions", settings.uploadedData.available.regions],
              ["Trade Routes", settings.uploadedData.available.tradeRoutes],
              ["NPC Traffic", settings.uploadedData.available.npcTraffic],
              ["Tutorial Entries", settings.uploadedData.available.tutorialEntries],
              ["Tutorial Triggers", settings.uploadedData.available.tutorialTriggers],
              ["Ship Stat Descriptions", settings.uploadedData.available.shipStatDescriptions],
              ["Zones", settings.uploadedData.available.zones],
              ["Stages", settings.uploadedData.available.stages],
              ["Hazard Barriers", settings.uploadedData.available.hazardBarrierProfiles],
            ].map(([label, active]) => (
              <span
                key={String(label)}
                className={`rounded-full px-2 py-1 text-xs ${active ? "bg-emerald-400/15 text-emerald-100" : "bg-white/5 text-white/45"}`}
              >
                {String(label)}
              </span>
            ))}
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            This shared upload is meant for the main <code>data/</code> directory and will automatically feed the console’s non-mission datasets. When no data workspace is uploaded, the console starts empty instead of falling back to external JSON URLs.
          </div>
        </div>

        <div className="md:col-span-4 flex flex-wrap gap-2">
          <input
            ref={dataZipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => importDataZip(event.target.files?.[0] ?? null)}
          />
          <input
            ref={dataFolderInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => importDataFolder(event.target.files)}
          />
          <button className="btn" onClick={() => dataZipInputRef.current?.click()}>
            Import data.zip
          </button>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => dataFolderInputRef.current?.click()}>
            Import /data Folder
          </button>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearUploadedData}>
            Clear Uploaded Data
          </button>
        </div>
      </div>

      {settings.localGameSource.active && settings.localGameSource.available.missions ? (
        <div className="card space-y-3">
          <div className="text-lg font-semibold text-white">Mission Source</div>
          <div className="text-sm text-white/60">
            Missions are currently being read directly from the configured local game root at:
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-xs text-white/75">
            {settings.localGameSource.missionsRootPath}
          </div>
        </div>
      ) : (
        <MissionWorkspaceManager />
      )}

      <div className="card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-4">
          <div className="text-lg font-semibold text-white">Shared Asset Library</div>
          <div className="mt-1 text-sm text-white/55">
            Optional fallback for non-local use. Import the full <code>/assets</code> folder here. When a local game root is active above, the console resolves <code>res://assets/...</code> directly from that local source first.
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Status</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedAssets.active ? "Uploaded assets active" : "No uploaded assets"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Files</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedAssets.fileCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Images</div>
          <div className="mt-2 text-lg font-semibold text-white">{settings.uploadedAssets.imageCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="label">Storage Path</div>
          <div className="mt-2 break-all font-mono text-xs text-white/75">{settings.uploadedAssets.storagePath || "Not imported yet"}</div>
        </div>

        <div className="md:col-span-2">
          <div className="label">Last imported</div>
          <div className="input mt-1 bg-white/5">
            {settings.uploadedAssets.lastImported ? new Date(settings.uploadedAssets.lastImported).toLocaleString() : "—"}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="label">Notes</div>
          <div className="input mt-1 min-h-[88px] whitespace-normal bg-white/5 text-sm text-white/70">
            Upload the <code>/assets</code> folder itself so relative paths like <code>res://assets/comms/cpt_larrabee.png</code> stay intact. Existing items, mods, merchant previews, comms portraits, mission headers, and any other screens using <code>/api/icon</code> will pick up the uploaded files automatically.
          </div>
        </div>

        <div className="md:col-span-4 flex flex-wrap gap-2">
          <input
            ref={assetsFolderInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => importAssetsFolder(event.target.files)}
          />
          <button className="btn" onClick={() => assetsFolderInputRef.current?.click()}>
            Import /assets Folder
          </button>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearUploadedAssets}>
            Clear Uploaded Assets
          </button>
        </div>
      </div>

      {settings.errors?.length ? (
        <div className="card text-red-400 text-sm">Errors: {settings.errors.join("; ")}</div>
      ) : null}
      {status ? <div className="card text-white/70">{status}</div> : null}
    </div>
  );
}
