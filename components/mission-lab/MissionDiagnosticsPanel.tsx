"use client";

import type { MissionImportDiagnostics, MissionImportSummary } from "@lib/mission-lab/types";

function DiagnosticCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function FileStatusTable({ title, files }: { title: string; files: MissionImportDiagnostics["files"] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#091321]">
        <table className="table min-w-full">
          <thead>
            <tr>
              <th>Mission</th>
              <th>File</th>
              <th>Parse</th>
              <th>Warnings</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {files.length ? (
              files.map((file) => (
                <tr key={`${title}-${file.relativePath}`}>
                  <td>{file.missionId ?? "Unknown"}</td>
                  <td className="max-w-[20rem] break-all text-white/70">{file.relativePath}</td>
                  <td>{file.parseStrategy}</td>
                  <td className="text-yellow-300">{file.warnings.join(" ") || "None"}</td>
                  <td className="text-red-300">{file.errors.join(" ") || "None"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-6 text-center text-white/50">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MissionDiagnosticsPanel({
  summary,
  diagnostics,
}: {
  summary: MissionImportSummary | null;
  diagnostics: MissionImportDiagnostics | null;
}) {
  if (!summary || !diagnostics) {
    return <div className="card text-sm text-white/55">Import a mission workspace to see diagnostics.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <DiagnosticCard label="Imported Files" value={diagnostics.files.length} />
        <DiagnosticCard label="Warnings" value={diagnostics.warningFiles.length} />
        <DiagnosticCard label="Failures" value={diagnostics.failedFiles.length} />
        <DiagnosticCard label="Strict Invalid" value={diagnostics.strictJsonInvalidFiles.length} />
        <DiagnosticCard label="Duplicate IDs" value={diagnostics.duplicateMissionIds.length} />
        <DiagnosticCard label="Missing Prereqs" value={diagnostics.missingPrerequisiteTargets.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DiagnosticCard label="Placeholder Arcs/Tags" value={diagnostics.placeholderValues.length} />
        <DiagnosticCard label="Cycles" value={diagnostics.cycles.length} />
        <DiagnosticCard label="Parse Warnings" value={diagnostics.warningsCount} />
        <DiagnosticCard label="Parse Errors" value={diagnostics.errorsCount} />
      </div>

      <FileStatusTable title="Successfully Imported" files={diagnostics.successfulFiles} />
      <FileStatusTable title="Imported With Warnings" files={diagnostics.warningFiles} />
      <FileStatusTable title="Failed Tolerant Parse" files={diagnostics.failedFiles} />
      <FileStatusTable title="Strict JSON Invalid" files={diagnostics.strictJsonInvalidFiles} />

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Duplicate Mission IDs</h3>
        <div className="card space-y-3">
          {diagnostics.duplicateMissionIds.length ? (
            diagnostics.duplicateMissionIds.map((issue) => (
              <div key={issue.missionId} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div className="font-medium text-white">{issue.missionId}</div>
                <div className="mt-2 break-all text-white/60">{issue.relativePaths.join(" • ")}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/50">No duplicate mission IDs found.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Missing Prerequisite Targets</h3>
        <div className="card space-y-3">
          {diagnostics.missingPrerequisiteTargets.length ? (
            diagnostics.missingPrerequisiteTargets.map((issue) => (
              <div key={`${issue.missionKey}-${issue.missingId}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div className="font-medium text-white">
                  {issue.missionId} is missing prerequisite target "{issue.missingId}"
                </div>
                <div className="mt-1 break-all text-white/60">{issue.relativePath}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/50">No missing prerequisite targets found.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Blank / Placeholder Arcs and Tags</h3>
        <div className="card space-y-3">
          {diagnostics.placeholderValues.length ? (
            diagnostics.placeholderValues.map((issue) => (
              <div key={`${issue.missionKey}-${issue.field}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                <div className="font-medium text-white">
                  {issue.missionId} has placeholder {issue.field}
                </div>
                <div className="mt-1 text-white/60">{issue.values.join(", ")}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/50">No placeholder arc/tag values found.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Cycles</h3>
        <div className="card space-y-3">
          {diagnostics.cycles.length ? (
            diagnostics.cycles.map((cycle, index) => (
              <div key={`${cycle.missionKeys.join("::")}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                {cycle.missionIds.join(" -> ")}
              </div>
            ))
          ) : (
            <div className="text-sm text-white/50">No prerequisite cycles found.</div>
          )}
        </div>
      </section>
    </div>
  );
}
