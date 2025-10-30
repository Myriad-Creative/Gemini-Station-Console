"use client";
import { useEffect, useState } from "react";

export default function OutliersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [z, setZ] = useState("");
  const load = async () => {
    const r = await fetch(`/api/reports/outliers${z ? `?z=${z}` : ""}`);
    const j = await r.json();
    setRows(j.outliers);
  };
  useEffect(()=> { load(); }, [z]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Outliers Report</h1>
      <div className="card text-sm text-white/80">
        <b>What am I looking at?</b> Each row is a mod whose one stat is unusually high/low compared to peers in the same
        <i> slot × level × rarity</i> cohort. The <i>z-score</i> = (value − cohort mean) ÷ cohort std dev. Items with |z| ≥ threshold are flagged.
        Use this to spot balance spikes or typos (e.g., a level‑5 Sensor with +50 targeting).
      </div>
      <div className="card flex gap-2 items-end">
        <div>
          <div className="label">z-score threshold</div>
          <input className="input" placeholder="e.g. 2.0" value={z} onChange={e => setZ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th>Name</th><th>Slot</th><th>Level</th><th>Rarity</th><th>Stat</th><th>z</th><th>Cohort Size</th>
          </tr></thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="font-medium">{r.name}</td>
                <td>{r.slot}</td>
                <td>{r.level}</td>
                <td>{r.rarity}</td>
                <td>{r.stat}</td>
                <td>{Number(r.z).toFixed(2)}</td>
                <td>{r.cohortSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
