import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { stringifyTutorialEntriesFile, stringifyTutorialTriggersFile } from "@lib/data-tools/tutorial";
import type { TutorialEntriesWorkspace, TutorialTriggersWorkspace } from "@lib/data-tools/types";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { DATA_FILE_PATHS } from "@lib/uploaded-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function duplicateIds(items: Array<{ id: string }>, label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const id = item.id.trim();
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].map((id) => `Duplicate ${label} ID "${id}".`);
}

function validateWorkspaces(entriesWorkspace: TutorialEntriesWorkspace, triggersWorkspace: TutorialTriggersWorkspace) {
  const errors = [
    ...duplicateIds(entriesWorkspace.entries, "tutorial entry"),
    ...duplicateIds(triggersWorkspace.groups, "root trigger group"),
    ...duplicateIds(triggersWorkspace.eventGroups, "event trigger group"),
    ...duplicateIds(triggersWorkspace.areas, "area trigger"),
  ];

  if (!entriesWorkspace.entries.length) errors.push("At least one tutorial entry is required.");
  return errors;
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const entriesWorkspace = body?.entriesWorkspace as TutorialEntriesWorkspace | undefined;
    const triggersWorkspace = body?.triggersWorkspace as TutorialTriggersWorkspace | undefined;

    if (!entriesWorkspace || !Array.isArray(entriesWorkspace.entries)) {
      return NextResponse.json({ ok: false, error: "A tutorial entries workspace is required." }, { status: 400 });
    }
    if (!triggersWorkspace || !Array.isArray(triggersWorkspace.groups) || !Array.isArray(triggersWorkspace.eventGroups) || !Array.isArray(triggersWorkspace.areas)) {
      return NextResponse.json({ ok: false, error: "A tutorial triggers workspace is required." }, { status: 400 });
    }

    const validationErrors = validateWorkspaces(entriesWorkspace, triggersWorkspace);
    if (validationErrors.length) {
      return NextResponse.json({ ok: false, error: validationErrors.join(" ") }, { status: 400 });
    }

    const entriesPath = path.join(localGameSource.gameRootPath, DATA_FILE_PATHS.tutorialEntries);
    const triggersPath = path.join(localGameSource.gameRootPath, DATA_FILE_PATHS.tutorialTriggers);
    const entriesText = stringifyTutorialEntriesFile(entriesWorkspace);
    const triggersText = stringifyTutorialTriggersFile(triggersWorkspace);

    await fsp.mkdir(path.dirname(entriesPath), { recursive: true });
    await fsp.writeFile(entriesPath, `${entriesText}\n`, "utf-8");
    await fsp.writeFile(triggersPath, `${triggersText}\n`, "utf-8");

    return NextResponse.json({
      ok: true,
      savedPaths: [entriesPath, triggersPath],
      savedEntries: entriesWorkspace.entries.length,
      savedTriggerGroups: triggersWorkspace.groups.length,
      savedEventGroups: triggersWorkspace.eventGroups.length,
      savedAreas: triggersWorkspace.areas.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
