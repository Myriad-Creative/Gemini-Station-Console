"use client";
import { useEffect, useState } from "react";
import ChartBar from "@components/ChartBar";
import HeatmapBands from "@components/HeatmapBands";
import { Card, CardTitle, Stat } from "@components/Cards";

type Summary = {
  manifestUrl: string | null;
  lastLoaded?: string;
  errors: string[];
  missionsByBand: { band: string; count: number }[];
  modsCoverage: { slot: string; level: number; count: number }[];
  modsCoverageBands: { slot: string; band: string; count: number }[];
  bandLabels: string[];
  rarityCounts: { rarity: number; count: number }[];
  holes: { slot: string; level: number; count: number; required: number }[];
  outliers: { modId: string; name: string; slot: string; level: number; rarity: number; stat: string; z: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const DEFAULTS: Summary = { manifestUrl: null, lastLoaded: null as any, errors: [], missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: [] };
  useEffect(() => { (async ()=>{ try { const r=await fetch("/api/summary"); const j=await r.json().catch(()=>null); setData(j); } catch(e) { setData({ missionsByBand:[], modsCoverage:[], modsCoverageBands:[], bandLabels:[], rarityCounts:[], holes:[], outliers:[], lastLoaded:null, manifestUrl:null, errors:[String(e)] } as any);} })(); }, []);
  if (!data) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid-auto">
        <Card>
          <CardTitle>Data Source</CardTitle>
          <div className="text-sm text-white/80">
            <div><span className="label">Manifest:</span> {data.manifestUrl || <em>not set</em>}</div>
            <div><span className="label">Last loaded:</span> {data.lastLoaded ? new Date(data.lastLoaded).toLocaleString() : "—"}</div>
            {data.errors?.length ? <div className="text-red-400 mt-2">Errors: {data.errors.join("; ")}</div> : null}
          </div>
        </Card>

        <Stat label="Holes (slot × level below threshold)" value={String((data.holes||[]).length)} />
        <Stat label="Outliers (z-score ≥ threshold)" value={String((data.outliers||[]).length)} />
      </div>

      <div className="grid-auto">
        <Card>
          <CardTitle>Missions by Band</CardTitle>
          <ChartBar labels={data.missionsByBand.map(b => b.band)} values={data.missionsByBand.map(b => b.count)} />
        </Card>

        <Card>
          <CardTitle>Rarity Distribution (Mods)</CardTitle>
          <ChartBar labels={data.rarityCounts.map(r => String(r.rarity))} values={data.rarityCounts.map(r => r.count)} />
        </Card>
      </div>

      <Card>
        <CardTitle>Mods Coverage (slot × level band)</CardTitle>
        <HeatmapBands data={data.modsCoverageBands} bands={data.bandLabels} />
      </Card>
    </div>
  );
}
