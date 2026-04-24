import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { normalizeTalentWorkspace, stringifyTalentWorkspace, validateTalentWorkspace } from "@lib/talent-manager/utils";
import type { TalentWorkspace } from "@lib/talent-manager/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TALENT_TREES_RELATIVE_PATH = path.join("data", "database", "talents", "TalentTrees.json");

function talentTreesPath(gameRoot: string) {
  return path.join(gameRoot, TALENT_TREES_RELATIVE_PATH);
}

function countSpecLocalTalentTemplates(workspace: TalentWorkspace) {
  return workspace.classes.reduce((classTotal, talentClass) => {
    return (
      classTotal +
      talentClass.specializations.reduce((specTotal, spec) => {
        return specTotal + (spec.talent_templates?.length ?? 0);
      }, 0)
    );
  }, 0);
}

function unavailableResponse() {
  return NextResponse.json({ ok: false, error: "No active local game root is configured." }, { status: 404 });
}

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return unavailableResponse();
  }

  try {
    const sourcePath = talentTreesPath(localGameSource.gameRootPath);
    const text = await fsp.readFile(sourcePath, "utf-8");
    const parsed = parseTolerantJsonText(text);
    if (!parsed.value) {
      return NextResponse.json({ ok: false, error: parsed.errors.join(" ") || "Could not parse TalentTrees.json." }, { status: 500 });
    }

    const workspace = normalizeTalentWorkspace(parsed.value);
    return NextResponse.json({
      ok: true,
      sourceLabel: "Local game source",
      sourcePath,
      workspace,
      warnings: [...parsed.warnings, ...parsed.errors],
      validation: validateTalentWorkspace(workspace),
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

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.gameRootPath || !localGameSource.available.data) {
    return unavailableResponse();
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.workspace || typeof body.workspace !== "object") {
      return NextResponse.json({ ok: false, error: "A talent workspace is required." }, { status: 400 });
    }

    const workspace = normalizeTalentWorkspace(body.workspace as TalentWorkspace);
    const validation = validateTalentWorkspace(workspace);
    const errors = validation.filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.map((issue) => issue.message).join(" "), validation }, { status: 400 });
    }

    const sourcePath = talentTreesPath(localGameSource.gameRootPath);
    await fsp.mkdir(path.dirname(sourcePath), { recursive: true });
    await fsp.writeFile(sourcePath, stringifyTalentWorkspace(workspace), "utf-8");

    return NextResponse.json({
      ok: true,
      savedPath: sourcePath,
      savedClasses: workspace.classes.length,
      savedTalentTemplates: workspace.talent_templates.length,
      savedSpecTalentTemplates: countSpecLocalTalentTemplates(workspace),
      validation,
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
