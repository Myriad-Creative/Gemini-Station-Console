"use client";
import { useEffect, useRef, useState } from "react";

type UploadedAssetsState = {
  active: boolean;
  storagePath: string | null;
  fileCount: number;
  imageCount: number;
  totalBytes: number;
  lastImported: string | null;
};

type SettingsData = {
  manifestUrl: string | null;
  lastLoaded?: string;
  errors: string[];
  modsOverrideJson: string;
  modsOverrideActive: boolean;
  uploadedAssets: UploadedAssetsState;
};

export default function SettingsPage() {
  const assetsFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<SettingsData>({
    manifestUrl: null,
    lastLoaded: undefined,
    errors: [],
    modsOverrideJson: "",
    modsOverrideActive: false,
    uploadedAssets: {
      active: false,
      storagePath: null,
      fileCount: 0,
      imageCount: 0,
      totalBytes: 0,
      lastImported: null,
    },
  });
  const [modsOverrideJson, setModsOverrideJson] = useState("");
  const [status, setStatus] = useState<string>("");

  const loadSettings = async () => {
    try {
      const r = await fetch("/api/settings");
      const j = await r.json();
      const next = {
        manifestUrl: j.manifestUrl || null,
        lastLoaded: j.lastLoaded,
        errors: j.errors || [],
        modsOverrideJson: j.modsOverrideJson || "",
        modsOverrideActive: !!j.modsOverrideActive,
        uploadedAssets: j.uploadedAssets || {
          active: false,
          storagePath: null,
          fileCount: 0,
          imageCount: 0,
          totalBytes: 0,
          lastImported: null,
        },
      };
      setSettings(next);
      setModsOverrideJson(next.modsOverrideJson);
    } catch (e:any) {
      setSettings({
        manifestUrl: null,
        lastLoaded: undefined,
        errors: [String(e?.message || e)],
        modsOverrideJson: "",
        modsOverrideActive: false,
        uploadedAssets: {
          active: false,
          storagePath: null,
          fileCount: 0,
          imageCount: 0,
          totalBytes: 0,
          lastImported: null,
        },
      });
    }
  };

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => {
    if (!assetsFolderInputRef.current) return;
    assetsFolderInputRef.current.setAttribute("webkitdirectory", "");
    assetsFolderInputRef.current.setAttribute("directory", "");
  }, []);

  const reloadFromManifest = async () => {
    setStatus(settings.modsOverrideActive ? "Reloading using the saved Mods.json override…" : "Reloading from manifest…");
    try {
      const r = await fetch("/api/reload", { method: "POST" });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j.ok) setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
      else {
        setStatus(settings.modsOverrideActive ? "Reloaded using the saved Mods.json override." : "Loaded from manifest");
        await loadSettings();
      }
    } catch (e:any) { setStatus(`Error: ${e?.message || e}`); }
  };

  const saveModsOverride = async (nextValue = modsOverrideJson) => {
    setStatus(nextValue.trim() ? "Saving Mods.json override…" : "Clearing Mods.json override…");
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modsOverrideJson: nextValue }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
        return;
      }

      const updated = {
        manifestUrl: j.manifestUrl || null,
        lastLoaded: j.lastLoaded,
        errors: j.errors || [],
        modsOverrideJson: j.modsOverrideJson || "",
        modsOverrideActive: !!j.modsOverrideActive,
        uploadedAssets: j.uploadedAssets || settings.uploadedAssets,
      };
      setSettings(updated);
      setModsOverrideJson(updated.modsOverrideJson);
      setStatus(updated.modsOverrideActive ? "Saved Mods.json override and reloaded console data." : "Cleared Mods.json override and returned to the configured mods source.");
    } catch (e:any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  const clearModsOverride = async () => {
    setModsOverrideJson("");
    await saveModsOverride("");
  };

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
      setStatus("Cleared uploaded assets. Image resolution has returned to the repo and remote fallback sources.");
    } catch (e: any) {
      setStatus(`Error: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <div className="card grid gap-4 md:grid-cols-4">
        <div className="md:col-span-4">
          <div className="text-lg font-semibold text-white">Shared Asset Library</div>
          <div className="mt-1 text-sm text-white/55">
            Import the full <code>/assets</code> folder here. The console stores that uploaded asset tree locally and resolves <code>res://assets/...</code> paths against it before any repo-root or remote fallback.
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
            Upload the <code>/assets</code> folder itself so relative paths like <code>res://assets/comms/cpt_larrabee.png</code> stay intact. Existing items, mods, merchant previews, comms portraits, and any other screens using <code>/api/icon</code> will pick up the uploaded files automatically.
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

      <div className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="label">Manifest URL</div>
          <div className="input bg-white/5">{settings.manifestUrl || "Not set"}</div>
        </div>
        <div>
          <div className="label">Last loaded</div>
          <div className="input bg-white/5">{settings.lastLoaded ? new Date(settings.lastLoaded).toLocaleString() : "—"}</div>
        </div>
        <div>
          <div className="label">Mods source</div>
          <div className="input bg-white/5">{settings.modsOverrideActive ? "Saved Mods.json override" : "Configured mods URL"}</div>
        </div>
        <div className="md:col-span-2">
          <div className="label">Mods.json override</div>
          <textarea
            className="input min-h-72 font-mono text-xs"
            value={modsOverrideJson}
            onChange={e => setModsOverrideJson(e.target.value)}
            placeholder='Paste the full contents of Mods.json here. Leave empty to fall back to the configured mods URL.'
          />
          <div className="mt-2 text-sm text-white/60">
            If this box is empty, the console uses the normal mods source. If it contains JSON, that pasted payload becomes the primary mods source across the console after saving.
          </div>
        </div>
        <div className="flex items-end">
          <button className="btn" onClick={reloadFromManifest}>Reload from manifest</button>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn" onClick={() => saveModsOverride()}>Save Mods.json Override</button>
          <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={clearModsOverride}>Clear Override</button>
        </div>
        {settings.errors?.length ? (
          <div className="md:col-span-2 text-red-400 text-sm">Errors: {settings.errors.join("; ")}</div>
        ) : null}
        <div className="md:col-span-2 text-white/70">{status}</div>
      </div>
    </div>
  );
}
