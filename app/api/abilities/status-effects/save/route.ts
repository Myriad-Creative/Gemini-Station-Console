import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { stringifyStatusEffectDraft, stringifyStatusEffectIndexJson, syncDerivedStatusEffectFields, validateStatusEffectDrafts } from "@lib/ability-manager/utils";
import { getLocalGameSourceState } from "@lib/local-game-source";
import type { StatusEffectDraft } from "@lib/ability-manager/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAbsolutePath(value: string | null | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.resolve(value);
}

async function saveAllStatusEffects(gameRoot: string, rawDrafts: unknown[]) {
  const drafts = rawDrafts.map((entry) => syncDerivedStatusEffectFields(entry as StatusEffectDraft));
  const errors = validateStatusEffectDrafts(drafts).filter((issue) => issue.level === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        ok: false,
        error: errors.map((issue) => issue.message).join(" "),
      },
      { status: 400 },
    );
  }

  const statusEffectsRoot = path.join(gameRoot, "data", "database", "status_effects");
  const statusEffectsJsonRoot = path.join(statusEffectsRoot, "json");
  const loadedDatabase = loadAbilityManagerDatabase(gameRoot);
  const savedPathsByKey: Record<string, string> = {};
  const nextIndexDrafts = drafts.map((draft) => {
    const targetPathResolved = path.resolve(path.join(statusEffectsJsonRoot, draft.fileName.trim()));
    savedPathsByKey[draft.key] = targetPathResolved;
    return {
      ...draft,
      sourcePath: targetPathResolved,
    };
  });
  const nextTargetPaths = new Set(Object.values(savedPathsByKey));
  const removedPaths = loadedDatabase.statusEffects
    .map((effect) => normalizeAbsolutePath(effect.sourcePath))
    .filter((sourcePath): sourcePath is string => typeof sourcePath === "string")
    .filter((sourcePath) => !nextTargetPaths.has(sourcePath));

  await fsp.mkdir(statusEffectsJsonRoot, { recursive: true });
  await Promise.all(
    drafts.map((draft) => {
      const targetPathResolved = savedPathsByKey[draft.key];
      return fsp.writeFile(targetPathResolved, stringifyStatusEffectDraft(draft), "utf-8");
    }),
  );
  await Promise.all(removedPaths.map((filePath) => fsp.rm(filePath, { force: true })));

  const indexPath = path.join(statusEffectsRoot, "_StatusEffectIndex.json");
  await fsp.writeFile(indexPath, stringifyStatusEffectIndexJson(nextIndexDrafts), "utf-8");

  return NextResponse.json({
    ok: true,
    savedCount: drafts.length,
    removedCount: removedPaths.length,
    indexPath,
    savedPathsByKey,
  });
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.drafts)) {
      return await saveAllStatusEffects(localGameSource.gameRootPath, body.drafts);
    }

    const rawDraft = body?.draft;
    if (!rawDraft || typeof rawDraft !== "object") {
      return NextResponse.json({ ok: false, error: "A status effect draft is required." }, { status: 400 });
    }

    const draft = syncDerivedStatusEffectFields(rawDraft as StatusEffectDraft);
    const errors = validateStatusEffectDrafts([draft]).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json(
        {
          ok: false,
          error: errors.map((issue) => issue.message).join(" "),
        },
        { status: 400 },
      );
    }

    const gameRoot = localGameSource.gameRootPath;
    const statusEffectsRoot = path.join(gameRoot, "data", "database", "status_effects");
    const statusEffectsJsonRoot = path.join(statusEffectsRoot, "json");
    const targetPath = path.join(statusEffectsJsonRoot, draft.fileName.trim());
    const targetPathResolved = path.resolve(targetPath);
    const sourcePathResolved = normalizeAbsolutePath(draft.sourcePath);

    const loadedDatabase = loadAbilityManagerDatabase(gameRoot);
    const conflicts = loadedDatabase.statusEffects.filter((effect) => {
      const effectSourcePath = normalizeAbsolutePath(effect.sourcePath);
      if (sourcePathResolved && effectSourcePath === sourcePathResolved) return false;
      return effect.numericId.trim() === draft.numericId.trim() || effect.fileName.trim().toLowerCase() === draft.fileName.trim().toLowerCase();
    });

    if (conflicts.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Another saved status effect already uses numeric id ${draft.numericId.trim()} or file name ${draft.fileName.trim()}.`,
        },
        { status: 400 },
      );
    }

    const statusEffectJson = stringifyStatusEffectDraft(draft);
    const nextIndexDrafts = loadedDatabase.statusEffects
      .filter((effect) => {
        const effectSourcePath = normalizeAbsolutePath(effect.sourcePath);
        return sourcePathResolved ? effectSourcePath !== sourcePathResolved : true;
      })
      .concat({
        ...draft,
        sourcePath: targetPathResolved,
      });

    await fsp.mkdir(statusEffectsJsonRoot, { recursive: true });
    await fsp.writeFile(targetPathResolved, statusEffectJson, "utf-8");

    if (sourcePathResolved && sourcePathResolved !== targetPathResolved) {
      await fsp.rm(sourcePathResolved, { force: true });
    }

    const indexPath = path.join(statusEffectsRoot, "_StatusEffectIndex.json");
    await fsp.writeFile(indexPath, stringifyStatusEffectIndexJson(nextIndexDrafts), "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: targetPathResolved,
      indexPath,
      numericId: draft.numericId.trim(),
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
