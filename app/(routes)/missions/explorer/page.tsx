"use client";

import { useEffect, useState } from "react";

type Mission = {
  id: string;
  title: string;
  has_explicit_gating: boolean;
  level_min?: number;
  level_max?: number;
  inferred_level?: number;
  giver_id?: string;
  faction?: string;
  arcs?: string[];
  tags?: string[];
  objectives: any[];
};

export default function MissionsExplorerPage() {
  const [bands, setBands] = useState<[number, number][]>([]);
  const [band, setBand] = useState("");
  const [rows, setRows] = useState<Mission[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/missions${band ? `?band=${band}` : ""}`);
      const json = await response.json();
      if (cancelled) return;
      setRows(json.rows);
      setBands(json.bands);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [band]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Missions Explorer</h1>
      <div className="card flex items-end gap-2">
        <div>
          <div className="label">Band</div>
          <select className="select" value={band} onChange={(event) => setBand(event.target.value)}>
            <option value="">All</option>
            {bands.map(([min, max]) => (
              <option key={`${min}-${max}`} value={`${min}-${max}`}>
                {min}-{max}
              </option>
            ))}
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
            {rows.map((mission) => (
              <tr key={mission.id}>
                <td className="font-medium">{mission.title}</td>
                <td>
                  {mission.has_explicit_gating ? (
                    `${mission.level_min ?? "?"}-${mission.level_max ?? "?"}`
                  ) : (
                    <span className="badge">inferred: {mission.inferred_level ?? "?"}</span>
                  )}
                </td>
                <td>{mission.faction || ""}</td>
                <td>{mission.giver_id || ""}</td>
                <td>
                  {(mission.objectives || []).map((objective: any, index: number) => (
                    <span key={index} className="badge mr-1">
                      {objective.type}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
