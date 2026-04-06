import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { createMissionUploadSourceFromDirectoryPath, importMissionWorkspace } from "@lib/mission-lab/import";
import { createRewardResolver } from "@lib/mission-lab/normalize";
import { getMissionLabWorkspace, setMissionLabWorkspace } from "@lib/mission-lab/store";
import { getPreferredMissionRoot } from "@lib/shared-source";

export async function getResolvedMissionLabWorkspace(sessionId: string) {
  await warmupLoadIfNeeded();
  const existingWorkspace = getMissionLabWorkspace(sessionId);
  const missionsRoot = getPreferredMissionRoot();
  if (!missionsRoot) {
    return existingWorkspace;
  }

  const store = getStore();
  const rewardResolver = createRewardResolver(store.mods, store.items);
  const workspace = importMissionWorkspace(
    sessionId,
    await createMissionUploadSourceFromDirectoryPath(missionsRoot, "Local game source"),
    rewardResolver,
  );
  workspace.filters = {
    ...workspace.filters,
    ...existingWorkspace.filters,
  };
  setMissionLabWorkspace(sessionId, workspace);
  return workspace;
}
