"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [repoRoot, setRepoRoot] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/summary");
        const j = await r.json().catch(()=>({repoRoot:""}));
        setRepoRoot(j.repoRoot || "");
      } catch {}
    })();
  }, []);

  const reloadFromPath = async () => {
    setStatus("Reloading…");
    try {
      const r = await fetch("/api/reload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoRoot }) });
      let j:any = {}; try { j = await r.json(); } catch {}
      if (!r.ok || !j.ok) setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
      else setStatus(`Loaded from ${j.repoRoot}`);
    } catch (e:any) { setStatus(`Error: ${e?.message || e}`); }
  };

  const uploadZip = async (file: File) => {
    setStatus("Uploading ZIP…");
    try {
      const fd = new FormData();
      fd.append("zip", file);
      const r = await fetch("/api/reload", { method: "POST", body: fd });
      let j:any = {}; try { j = await r.json(); } catch {}
      if (!r.ok || !j.ok) setStatus(`Error: ${j.error || r.status + " " + r.statusText}`);
      else setStatus(`Loaded from ZIP to ${j.repoRoot}`);
    } catch (e:any) { setStatus(`Error: ${e?.message || e}`); }
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">Settings</h1>
      <div className="card grid gap-3 md:grid-cols-2">
        <div>
          <div className="label">Repo folder path</div>
          <input className="input" placeholder="C:\path\to\Gemini-Station or /Users/you/Gemini-Station" value={repoRoot} onChange={e=>setRepoRoot(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn" onClick={reloadFromPath}>Reload from folder</button>
        </div>

        <div>
          <div className="label">Or upload repo ZIP</div>
          <input className="input" type="file" accept=".zip" onChange={e => e.target.files && e.target.files[0] && uploadZip(e.target.files[0])} />
        </div>
        <div className="flex items-end">
          <span className="text-white/70">{status}</span>
        </div>
      </div>
    </div>
  );
}
