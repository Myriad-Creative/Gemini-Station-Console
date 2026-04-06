"use client";
import { useEffect, useState } from "react";
import ChartBar from "@components/ChartBar";
import HeatmapBands from "@components/HeatmapBands";
import { Card, CardTitle, Stat } from "@components/Cards";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type Summary = {
  lastLoaded?: string;
  errors: string[];
  counts: { mods: number; items: number; missions: number; mobs: number; abilities: number };
  missionsByBand: { band: string; count: number }[];
  modsCoverage: { slot: string; level: number; count: number }[];
  modsCoverageBands: { slot: string; band: string; count: number }[];
  bandLabels: string[];
  rarityCounts: { rarity: number; count: number }[];
  holes: { slot: string; level: number; count: number; required: number }[];
  outliers: { modId: string; name: string; slot: string; level: number; rarity: number; stat: string; z: number }[];
};

export default function DashboardPage() {
  const sessionId = useMissionLabSessionId();
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const r = await fetch("/api/summary", {
          headers: buildMissionLabSessionHeaders(sessionId),
        });
        const j = await r.json().catch(() => null);
        setData(j);
      } catch (e) {
        setData({
          missionsByBand: [],
          modsCoverage: [],
          modsCoverageBands: [],
          bandLabels: [],
          rarityCounts: [],
          holes: [],
          outliers: [],
          lastLoaded: null,
          errors: [String(e)],
          counts: { mods: 0, items: 0, missions: 0, mobs: 0, abilities: 0 },
        } as any);
      }
    })();
  }, [sessionId, sharedDataVersion]);
  if (!data) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid-auto">
        <Card>
          <CardTitle>Data Source</CardTitle>
          <div className="text-sm text-white/80">
            <div><span className="label">Last loaded:</span> {data.lastLoaded ? new Date(data.lastLoaded).toLocaleString() : "—"}</div>
            <div className="mt-1 text-white/60">This dashboard is populated only from uploaded Settings workspaces.</div>
            <div className="mt-1 space-y-1">
              <div className="label">Parsed records</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>Mods: {data.counts?.mods ?? 0}</div>
                <div>Items: {data.counts?.items ?? 0}</div>
                <div>Missions: {data.counts?.missions ?? 0}</div>
                <div>Mobs: {data.counts?.mobs ?? 0}</div>
                <div className="col-span-2">Abilities: {data.counts?.abilities ?? 0}</div>
              </div>
            </div>
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
