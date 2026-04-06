import fs from "fs";
import path from "path";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { DATA_FILE_PATHS, type UploadedDataFileKind } from "@lib/uploaded-data";

export function getPreferredDataRepoRoot(): string | null {
  const local = getLocalGameSourceState();
  if (local.active && local.gameRootPath && local.available.data) return local.gameRootPath;
  return null;
}

export function getPreferredAssetsRepoRoot(): string | null {
  const local = getLocalGameSourceState();
  if (local.active && local.gameRootPath && local.available.assets) return local.gameRootPath;
  return null;
}

export function getPreferredMissionRoot(): string | null {
  const local = getLocalGameSourceState();
  if (local.active && local.missionsRootPath && local.available.missions) return local.missionsRootPath;
  return null;
}

export async function readPreferredDataFileText(kind: UploadedDataFileKind): Promise<{ text: string | null; sourceLabel: string | null }> {
  const local = getLocalGameSourceState();
  if (local.active && local.gameRootPath && local.available.data) {
    const absolute = path.join(local.gameRootPath, DATA_FILE_PATHS[kind]);
    if (fs.existsSync(absolute)) {
      return {
        text: await fs.promises.readFile(absolute, "utf-8"),
        sourceLabel: "Local game source",
      };
    }
  }

  return {
    text: null,
    sourceLabel: null,
  };
}
