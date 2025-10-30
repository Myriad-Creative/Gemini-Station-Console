"use client";
import { useEffect, useState } from "react";

type Mission = {
  id: string; title: string; has_explicit_gating: boolean;
  level_min?: number; level_max?: number; inferred_level?: number;
  giver_id?: string; faction?: string; arcs?: string[]; tags?: string[];
  objectives: any[];
};

export default function MissionsPage() {
  const [bands, setBands] = useState<[number, number][]>([]);
  const [band, setBand] = useState("");
  const [rows, setRows] = useState<Mission[]>([]);

  const load = async () => {
    const r = await fetch(`/api/missions${band ? `?band=${band}` : ""}`);
    const j = await r.json();
    setRows(j.rows);
    setBands(j.bands);
  };
  useEffect(()=> { load(); }, [band]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Missions Explorer</h1>
      <div className="card flex gap-2 items-end">
        <div>
          <div className="label">Band</div>
          <select className="select" value={band} onChange={e => setBand(e.target.value)}>
            <option value="">All</option>
            {bands.map(([a,b]) => <option key={`${a}-${b}`} value={`${a}-${b}`}>{a}-{b}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Level (explicit / inferred)</th>
              <th>Faction</th>
              <th>Giver</th>
              <th>Objectives</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id}>
                <td className="font-medium">{m.title}</td>
                <td>
                  {m.has_explicit_gating
                    ? `${m.level_min ?? "?"}-${m.level_max ?? "?"}`
                    : <span className="badge">inferred: {m.inferred_level ?? "?"}</span>}
                </td>
                <td>{m.faction || ""}</td>
                <td>{m.giver_id || ""}</td>
                <td>
                  {(m.objectives || []).map((o: any, i: number) =>
                    <span key={i} className="badge mr-1">{o.type}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
