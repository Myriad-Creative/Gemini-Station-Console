import JSZip from "jszip";
import type { ImportedMissionFile, MissionDuplicateIdIssue, MissionLabWorkspace, MissionUploadSource } from "@lib/mission-lab/types";
import { buildMissionFilterOptions, createDefaultMissionFilterState } from "@lib/mission-lab/filters";
import { buildMissionGraph } from "@lib/mission-lab/graph";
import { normalizeMissionRecord, type MissionRewardResolver } from "@lib/mission-lab/normalize";
import { parseMissionJsonText } from "@lib/mission-lab/parse";
import { normalizePath, slugify } from "@lib/mission-lab/utils";

function splitRelativePath(relativePath: string) {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] || normalized;
  const folderSegments = segments.slice(0, -1);
  const folderPath = folderSegments.join("/");
  const folderName = folderSegments[folderSegments.length - 1] || "root";
  const folderSlug = slugify(folderName) || "root";

  return {
    relativePath: normalized,
    fileName,
    folderPath,
    folderName,
    folderSlug,
  };
}

function shouldIgnoreEntry(relativePath: string) {
  const normalized = normalizePath(relativePath);
  const lower = normalized.toLowerCase();
  const segments = lower.split("/").filter(Boolean);
  if (!normalized) return true;
  if (lower.includes("__macosx/")) return true;
  if (lower.endsWith(".ds_store")) return true;
  if (segments.includes("test")) return true;
  return false;
}

function isJsonFile(relativePath: string) {
  return relativePath.toLowerCase().endsWith(".json");
}

function buildDuplicateIssues(missions: MissionLabWorkspace["missions"]): MissionDuplicateIdIssue[] {
  const byId = new Map<string, MissionLabWorkspace["missions"]>();
  for (const mission of missions) {
    const current = byId.get(mission.id) ?? [];
    current.push(mission);
    byId.set(mission.id, current);
  }

  return Array.from(byId.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([missionId, entries]) => ({
      missionId,
      missionKeys: entries.map((entry) => entry.key),
      relativePaths: entries.map((entry) => entry.relativePath),
    }));
}

async function unzipMissionFiles(zipBuffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const files: MissionUploadSource["files"] = [];

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const relativePath = normalizePath(entry.name);
    if (shouldIgnoreEntry(relativePath) || !isJsonFile(relativePath)) continue;
    const fileName = relativePath.split("/").pop() || relativePath;
    files.push({
      relativePath,
      fileName,
      text: await entry.async("string"),
    });
  }

  return files;
}

export async function createMissionUploadSourceFromZip(file: File): Promise<MissionUploadSource> {
  return {
    kind: "zip",
    label: file.name,
    files: await unzipMissionFiles(await file.arrayBuffer()),
  };
}

export async function createMissionUploadSourceFromFolder(files: File[], relativePaths: string[]) {
  const uploadedFiles = await Promise.all(
    files.map(async (file, index) => ({
      relativePath: normalizePath(relativePaths[index] || file.name),
      fileName: file.name,
      text: await file.text(),
    })),
  );

  return {
    kind: "folder",
    label: relativePaths[0]?.split("/")[0] ?? null,
    files: uploadedFiles,
  } satisfies MissionUploadSource;
}

export function importMissionWorkspace(sessionId: string, source: MissionUploadSource, rewardResolver?: MissionRewardResolver): MissionLabWorkspace {
  const files = [...source.files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const diagnosticsFiles: ImportedMissionFile[] = [];
  const missions: MissionLabWorkspace["missions"] = [];
  const placeholderIssues: MissionLabWorkspace["diagnostics"]["placeholderValues"] = [];
  const ignoredEntries: string[] = [];

  for (const file of files) {
    if (shouldIgnoreEntry(file.relativePath)) {
      ignoredEntries.push(file.relativePath);
      continue;
    }

    if (!isJsonFile(file.relativePath)) {
      ignoredEntries.push(file.relativePath);
      continue;
    }

    const fileParts = splitRelativePath(file.relativePath);
    const parseResult = parseMissionJsonText(file.text);
    const diagnosticFile: ImportedMissionFile = {
      ...fileParts,
      strictJsonValid: parseResult.strictJsonValid,
      parseStrategy: parseResult.parseStrategy,
      warnings: [...parseResult.warnings],
      errors: [...parseResult.errors],
      missionId: null,
    };

    if (parseResult.parseStrategy === "failed" || !parseResult.value) {
      diagnosticsFiles.push(diagnosticFile);
      continue;
    }

    const normalized = normalizeMissionRecord({
      key: `${fileParts.folderSlug}:${fileParts.relativePath}`,
      fileName: fileParts.fileName,
      relativePath: fileParts.relativePath,
      folderPath: fileParts.folderPath,
      folderName: fileParts.folderName,
      folderSlug: fileParts.folderSlug,
      parsed: parseResult.value,
      strictJsonValid: parseResult.strictJsonValid,
      parseStrategy: parseResult.parseStrategy,
      importWarnings: parseResult.warnings,
      rewardResolver,
    });

    diagnosticFile.warnings = normalized.warnings;
    diagnosticFile.missionId = normalized.mission.id;
    diagnosticsFiles.push(diagnosticFile);
    missions.push(normalized.mission);
    placeholderIssues.push(...normalized.placeholderIssues);
  }

  const graph = buildMissionGraph(missions);
  const duplicateMissionIds = buildDuplicateIssues(missions);
  const warningsCount = diagnosticsFiles.reduce((total, file) => total + file.warnings.length, 0);
  const errorsCount = diagnosticsFiles.reduce((total, file) => total + file.errors.length, 0);
  const summary = {
    totalMissions: missions.length,
    totalFolders: new Set(missions.map((mission) => mission.folderPath || mission.folderName)).size,
    totalPrerequisiteEdges: graph.edges.length,
    parseWarnings: warningsCount,
    parseErrors: errorsCount,
    importedAt: new Date().toISOString(),
    sourceType: source.kind,
    sourceLabel: source.label,
  } as const;

  const workspace: MissionLabWorkspace = {
    sessionId,
    summary,
    missions,
    graphNodes: graph.nodes,
    graphEdges: graph.edges,
    diagnostics: {
      files: diagnosticsFiles,
      successfulFiles: diagnosticsFiles.filter((file) => !file.warnings.length && !file.errors.length),
      warningFiles: diagnosticsFiles.filter((file) => file.warnings.length > 0 && file.errors.length === 0),
      failedFiles: diagnosticsFiles.filter((file) => file.errors.length > 0),
      strictJsonInvalidFiles: diagnosticsFiles.filter((file) => !file.strictJsonValid),
      duplicateMissionIds,
      missingPrerequisiteTargets: graph.missingPrerequisiteTargets,
      placeholderValues: placeholderIssues,
      cycles: graph.cycles,
      warningsCount,
      errorsCount,
      ignoredEntries,
    },
    filters: createDefaultMissionFilterState(),
  };

  const initialMission = missions[0]?.key ?? null;
  workspace.filters.selectedMissionKey = initialMission;
  workspace.filters.focusedMissionKey = initialMission;
  buildMissionFilterOptions(missions);

  return workspace;
}
