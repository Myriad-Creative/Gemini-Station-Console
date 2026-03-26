import { NextRequest, NextResponse } from "next/server";
import { warmupLoadIfNeeded, getStore } from "@lib/datastore";
import { buildMissionFilterOptions } from "@lib/mission-lab/filters";
import {
  createMissionUploadSourceFromFolder,
  createMissionUploadSourceFromZip,
  importMissionWorkspace,
} from "@lib/mission-lab/import";
import { createRewardResolver } from "@lib/mission-lab/normalize";
import {
  clearMissionLabWorkspace,
  resolveMissionLabSessionId,
  setMissionLabWorkspace,
} from "@lib/mission-lab/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const formData = await req.formData();
  const sourceType = String(formData.get("sourceType") ?? "").toLowerCase();

  await warmupLoadIfNeeded();
  const store = getStore();
  const rewardResolver = createRewardResolver(store.mods, store.items);

  try {
    if (sourceType === "zip") {
      const zipFile = formData.get("file");
      if (!(zipFile instanceof File)) {
        return NextResponse.json({ error: "Zip import requires a file upload." }, { status: 400 });
      }

      const workspace = importMissionWorkspace(sessionId, await createMissionUploadSourceFromZip(zipFile), rewardResolver);
      setMissionLabWorkspace(sessionId, workspace);
      return NextResponse.json({
        ok: true,
        summary: workspace.summary,
        filters: workspace.filters,
        options: buildMissionFilterOptions(workspace.missions),
      });
    }

    if (sourceType === "folder") {
      const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
      const relativePaths = formData.getAll("relativePaths").map((entry) => String(entry));
      if (!files.length) {
        return NextResponse.json({ error: "Folder import requires JSON files." }, { status: 400 });
      }

      const workspace = importMissionWorkspace(
        sessionId,
        await createMissionUploadSourceFromFolder(files, relativePaths),
        rewardResolver,
      );
      setMissionLabWorkspace(sessionId, workspace);
      return NextResponse.json({
        ok: true,
        summary: workspace.summary,
        filters: workspace.filters,
        options: buildMissionFilterOptions(workspace.missions),
      });
    }

    return NextResponse.json({ error: "Unsupported import source." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const sessionId = resolveMissionLabSessionId(req);
  const workspace = clearMissionLabWorkspace(sessionId);
  return NextResponse.json({ ok: true, summary: workspace.summary });
}
