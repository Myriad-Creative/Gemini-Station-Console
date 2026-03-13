"use client";
import { useEffect, useState } from "react";

type SettingsData = {
  manifestUrl: string | null;
  lastLoaded?: string;
  errors: string[];
  modsOverrideJson: string;
  modsOverrideActive: boolean;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({
    manifestUrl: null,
    lastLoaded: undefined,
    errors: [],
    modsOverrideJson: "",
    modsOverrideActive: false,
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
      });
    }
  };

  useEffect(() => { loadSettings(); }, []);

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

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
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
