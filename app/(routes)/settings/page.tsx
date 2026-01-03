"use client";
import { useEffect, useState } from "react";

type Summary = { manifestUrl: string | null; lastLoaded?: string; errors: string[] };

export default function SettingsPage() {
  const [summary, setSummary] = useState<Summary>({ manifestUrl: null, lastLoaded: undefined, errors: [] });
  const [status, setStatus] = useState<string>("");

  const loadSummary = async () => {
    try {
      const r = await fetch("/api/summary");
      const j = await r.json();
      setSummary({ manifestUrl: j.manifestUrl || null, lastLoaded: j.lastLoaded, errors: j.errors || [] });
    } catch (e:any) {
      setSummary({ manifestUrl: null, lastLoaded: undefined, errors: [String(e?.message || e)] });
    }
  };

  useEffect(() => { loadSummary(); }, []);

  const reloadFromManifest = async () => {
    setStatus("Reloading from manifest…");
    try {
      const r = await fetch("/api/reload", { method: "POST" });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j.ok) setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
      else {
        setStatus("Loaded from manifest");
        await loadSummary();
      }
    } catch (e:any) { setStatus(`Error: ${e?.message || e}`); }
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <div className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="label">Manifest URL</div>
          <div className="input bg-white/5">{summary.manifestUrl || "Not set"}</div>
        </div>
        <div>
          <div className="label">Last loaded</div>
          <div className="input bg-white/5">{summary.lastLoaded ? new Date(summary.lastLoaded).toLocaleString() : "—"}</div>
        </div>
        <div className="flex items-end">
          <button className="btn" onClick={reloadFromManifest}>Reload from manifest</button>
        </div>
        {summary.errors?.length ? (
          <div className="md:col-span-2 text-red-400 text-sm">Errors: {summary.errors.join("; ")}</div>
        ) : null}
        <div className="md:col-span-2 text-white/70">{status}</div>
      </div>
    </div>
  );
}
