"use client";

import Link from "next/link";
import type { InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import { clearMissionCreatorWorkspaceStorage } from "@lib/authoring";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import type { MissionImportDiagnostics, MissionImportSummary } from "@lib/mission-lab/types";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default function MissionWorkspaceManager() {
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const sessionId = useMissionLabSessionId();
  const [summary, setSummary] = useState<MissionImportSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<MissionImportDiagnostics | null>(null);
  const [status, setStatus] = useState<{ tone: "neutral" | "success" | "error"; message: string }>({
    tone: "neutral",
    message: "Import a mission zip or mission folder here to power the shared Explorer, Lab, and Creator workspace.",
  });
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      try {
        const response = await fetch("/api/mission-lab/workspace", {
          headers: buildMissionLabSessionHeaders(sessionId),
        });
        const payload = await response.json();
        if (cancelled) return;
        setSummary(payload.summary ?? null);
        setDiagnostics(payload.diagnostics ?? null);
      } catch (error) {
        if (cancelled) return;
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshToken]);

  async function importZip(file: File) {
    if (!sessionId) return;
    setImporting(true);
    setStatus({ tone: "neutral", message: `Importing ${file.name}…` });

    try {
      const formData = new FormData();
      formData.set("sourceType", "zip");
      formData.set("file", file);
      const response = await fetch("/api/mission-lab/import", {
        method: "POST",
        headers: buildMissionLabSessionHeaders(sessionId),
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Zip import failed.");

      setSummary(payload.summary ?? null);
      setStatus({
        tone: "success",
        message: `Imported ${payload.summary?.totalMissions ?? 0} missions from ${payload.summary?.sourceLabel ?? file.name}.`,
      });
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }

  async function importFolder(fileList: FileList | null) {
    if (!sessionId || !fileList?.length) return;
    setImporting(true);
    setStatus({ tone: "neutral", message: `Importing ${fileList.length} selected files…` });

    try {
      const formData = new FormData();
      formData.set("sourceType", "folder");
      const files = Array.from(fileList);
      for (const file of files) {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        formData.append("files", file);
        formData.append("relativePaths", relativePath);
      }

      const response = await fetch("/api/mission-lab/import", {
        method: "POST",
        headers: buildMissionLabSessionHeaders(sessionId),
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Folder import failed.");

      setSummary(payload.summary ?? null);
      setStatus({
        tone: "success",
        message: `Imported ${payload.summary?.totalMissions ?? 0} missions from the selected folder.`,
      });
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  async function clearWorkspace() {
    if (!sessionId) return;
    await fetch("/api/mission-lab/import", {
      method: "DELETE",
      headers: buildMissionLabSessionHeaders(sessionId),
    });
    clearMissionCreatorWorkspaceStorage();
    setSummary(null);
    setDiagnostics(null);
    setStatus({
      tone: "neutral",
      message: "Cleared the shared mission workspace.",
    });
    setRefreshToken((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          status.tone === "error"
            ? "border-red-400/30 bg-red-400/10 text-red-100"
            : status.tone === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
              : "border-white/10 bg-white/5 text-white/70"
        }`}
      >
        {status.message}
      </div>

      {summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Imported Missions" value={summary.totalMissions} />
          <SummaryCard label="Folders" value={summary.totalFolders} />
          <SummaryCard label="Prerequisite Edges" value={summary.totalPrerequisiteEdges} />
          <SummaryCard label="Parse Warnings / Errors" value={`${summary.parseWarnings} / ${summary.parseErrors}`} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card space-y-5">
          <div>
            <div className="text-xl font-semibold text-white">Shared Mission Workspace</div>
            <div className="mt-2 text-sm text-white/60">
              Import a missions zip or folder once here, then use that shared normalized workspace across Mission Explorer, Mission Lab, and Mission Creator.
            </div>
          </div>

          <div
            className="rounded-2xl border border-dashed border-cyan-300/25 bg-[#091321] px-6 py-12 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const zipFile = Array.from(event.dataTransfer.files).find((file) => file.name.toLowerCase().endsWith(".zip"));
              if (zipFile) {
                void importZip(zipFile);
              } else {
                setStatus({
                  tone: "error",
                  message: "Drag and drop expects a .zip file. Use the folder picker for direct mission-folder imports.",
                });
              }
            }}
          >
            <div className="text-2xl font-semibold text-white">Drop a missions zip here</div>
            <div className="mt-2 text-sm text-white/55">Or use the controls below to import a zip file or a selected missions folder.</div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button className="btn" onClick={() => zipInputRef.current?.click()} disabled={importing}>
                Choose Zip
              </button>
              <button
                className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                onClick={() => folderInputRef.current?.click()}
                disabled={importing}
              >
                Choose Folder
              </button>
              <button
                className="rounded border border-red-400/25 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                onClick={() => void clearWorkspace()}
                disabled={importing}
              >
                Clear Workspace
              </button>
            </div>
          </div>

          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importZip(file);
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            multiple
            {...({ webkitdirectory: "true", directory: "true" } as InputHTMLAttributes<HTMLInputElement> & {
              webkitdirectory?: string;
              directory?: string;
            })}
            onChange={(event) => void importFolder(event.target.files)}
          />
        </div>

        <div className="card space-y-4">
          <div className="text-xl font-semibold text-white">Workspace Summary</div>
          {summary ? (
            <div className="space-y-3 text-sm text-white/70">
              <div>
                Source: <span className="text-white">{summary.sourceType}</span>
                {summary.sourceLabel ? <span className="text-white/60"> ({summary.sourceLabel})</span> : null}
              </div>
              <div>Imported: {new Date(summary.importedAt).toLocaleString()}</div>
              <div>Missions: {summary.totalMissions}</div>
              <div>Folders: {summary.totalFolders}</div>
              <div>Prerequisite edges: {summary.totalPrerequisiteEdges}</div>
              <div>Warnings: {summary.parseWarnings}</div>
              <div>Errors: {summary.parseErrors}</div>
              <div>Successful files: {diagnostics?.successfulFiles.length ?? 0}</div>
              <div>Failed files: {diagnostics?.failedFiles.length ?? 0}</div>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-white/55">
              <div>No shared mission workspace is currently loaded.</div>
              <div>Import a mission zip here, then open:</div>
              <div className="flex flex-wrap gap-3 text-white/75">
                <Link href="/missions/explorer" className="hover:text-white">
                  Explorer
                </Link>
                <Link href="/missions/lab" className="hover:text-white">
                  Lab
                </Link>
                <Link href="/missions/creator" className="hover:text-white">
                  Creator
                </Link>
              </div>
            </div>
          )}
          {loading ? <div className="text-sm text-white/45">Refreshing shared workspace…</div> : null}
        </div>
      </div>
    </div>
  );
}
