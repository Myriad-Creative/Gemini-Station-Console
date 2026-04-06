"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import type { MissionImportSummary, NormalizedMission } from "@lib/mission-lab/types";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type WorkspacePayload = {
  summary: MissionImportSummary | null;
  missions: NormalizedMission[];
  levelBands: [number, number][];
};

export default function MissionsExplorerPage() {
  const sessionId = useMissionLabSessionId();
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [summary, setSummary] = useState<MissionImportSummary | null>(null);
  const [rows, setRows] = useState<NormalizedMission[]>([]);
  const [bands, setBands] = useState<[number, number][]>([]);
  const [band, setBand] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const response = await fetch("/api/mission-lab/workspace", {
          headers: buildMissionLabSessionHeaders(sessionId),
        });
        const payload = (await response.json()) as WorkspacePayload;
        if (cancelled) return;
        setSummary(payload.summary ?? null);
        setRows(Array.isArray(payload.missions) ? payload.missions : []);
        setBands(Array.isArray(payload.levelBands) ? payload.levelBands : []);
        setStatus("");
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sessionId, sharedDataVersion]);

  const filteredRows = useMemo(() => {
    if (!band) return rows;
    const [min, max] = band.split("-").map(Number);
    return rows.filter((mission) => mission.level != null && mission.level >= min && mission.level <= max);
  }, [band, rows]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title mb-1">Mission Explorer</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Browse the missions currently loaded from the active local game root in Settings.
        </p>
      </div>

      {status ? <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{status}</div> : null}

      {!summary ? (
        <div className="card py-10 text-center">
          <div className="text-xl font-semibold text-white">No shared mission workspace loaded</div>
          <div className="mt-2 text-sm text-white/55">Set a local game root in Settings before using Mission Explorer.</div>
          <div className="mt-5">
            <Link href="/settings" className="btn">
              Go To Settings
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card flex flex-wrap items-end gap-4">
            <div>
              <div className="label">Level Band</div>
              <select className="select mt-1" value={band} onChange={(event) => setBand(event.target.value)}>
                <option value="">All</option>
                {bands.map(([min, max]) => (
                  <option key={`${min}-${max}`} value={`${min}-${max}`}>
                    {min}-{max}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-white/55">
              Showing <span className="text-white">{filteredRows.length}</span> of <span className="text-white">{summary.totalMissions}</span> imported
              missions.
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>ID</th>
                  <th>Level</th>
                  <th>Folder</th>
                  <th>Faction</th>
                  <th>Giver</th>
                  <th>Objectives</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? (
                  filteredRows.map((mission) => (
                    <tr key={mission.key}>
                      <td className="font-medium">{mission.title}</td>
                      <td className="text-white/65">{mission.id}</td>
                      <td>{mission.level ?? "?"}</td>
                      <td>{mission.folderName}</td>
                      <td>{mission.faction ?? "None"}</td>
                      <td>{mission.giverId ?? ""}</td>
                      <td>
                        {mission.objectiveTypes.length ? (
                          mission.objectiveTypes.map((type) => (
                            <span key={`${mission.key}-${type}`} className="badge mr-1">
                              {type}
                            </span>
                          ))
                        ) : (
                          <span className="text-white/45">None</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-white/50">
                      No imported missions match the selected level band.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
