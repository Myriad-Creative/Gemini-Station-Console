import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { statusEffectOptionsFromDatabase, stringifyAbilityDraft, stringifyAbilityIndexJson, syncDerivedAbilityFields, validateAbilityDrafts } from "@lib/ability-manager/utils";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { AbilityDraft } from "@lib/ability-manager/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAbsolutePath(value: string | null | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.resolve(value);
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawDraft = body?.draft;
    if (!rawDraft || typeof rawDraft !== "object") {
      return NextResponse.json({ ok: false, error: "An ability draft is required." }, { status: 400 });
    }

    const gameRoot = localGameSource.gameRootPath;
    const loadedDatabase = loadAbilityManagerDatabase(gameRoot);
    const draft = syncDerivedAbilityFields(rawDraft as AbilityDraft);
    const errors = validateAbilityDrafts([draft], statusEffectOptionsFromDatabase(loadedDatabase)).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json(
        {
          ok: false,
          error: errors.map((issue) => issue.message).join(" "),
        },
        { status: 400 },
      );
    }

    const abilitiesJsonRoot = path.join(gameRoot, "data", "database", "abilities", "json");
    const targetPath = path.join(abilitiesJsonRoot, draft.fileName.trim());
    const targetPathResolved = path.resolve(targetPath);
    const sourcePathResolved = normalizeAbsolutePath(draft.sourcePath);

    const conflicts = loadedDatabase.abilities.filter((ability) => {
      const abilitySourcePath = normalizeAbsolutePath(ability.sourcePath);
      if (sourcePathResolved && abilitySourcePath === sourcePathResolved) return false;
      return ability.id.trim() === draft.id.trim() || ability.fileName.trim().toLowerCase() === draft.fileName.trim().toLowerCase();
    });

    if (conflicts.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Another saved ability already uses id ${draft.id.trim()} or file name ${draft.fileName.trim()}.`,
        },
        { status: 400 },
      );
    }

    const abilityJson = stringifyAbilityDraft(draft);
    const nextIndexDrafts = loadedDatabase.abilities
      .filter((ability) => {
        const abilitySourcePath = normalizeAbsolutePath(ability.sourcePath);
        return sourcePathResolved ? abilitySourcePath !== sourcePathResolved : true;
      })
      .concat({
        ...draft,
        sourcePath: targetPathResolved,
      });

    await fsp.mkdir(abilitiesJsonRoot, { recursive: true });
    await fsp.writeFile(targetPathResolved, abilityJson, "utf-8");

    if (sourcePathResolved && sourcePathResolved !== targetPathResolved) {
      await fsp.rm(sourcePathResolved, { force: true });
    }

    const indexPath = path.join(abilitiesJsonRoot, "_AbilityIndex.json");
    await fsp.writeFile(indexPath, stringifyAbilityIndexJson(nextIndexDrafts), "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: targetPathResolved,
      indexPath,
      abilityId: draft.id.trim(),
      fileName: draft.fileName.trim(),
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
