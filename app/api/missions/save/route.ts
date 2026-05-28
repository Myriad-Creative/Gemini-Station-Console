import fsp from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { loadAll } from "@lib/datastore";
import { exportMissionDraft, missionFilename, validateMissionDrafts, withMissionEditTimestamp, type MissionDraft } from "@lib/mission-authoring";
import { parseMissionJsonText } from "@lib/mission-lab/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SavedRewardSummary = {
  credits: number | null;
  xp: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRewardNumber(rewards: Record<string, unknown>, key: string) {
  const value = rewards[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readRewardSummary(mission: unknown): SavedRewardSummary {
  const rewards = asRecord(asRecord(mission).rewards);
  return {
    credits: readRewardNumber(rewards, "credits"),
    xp: readRewardNumber(rewards, "xp"),
  };
}

function toPortableRelativePath(rootPath: string, targetPath: string) {
  return path.relative(rootPath, targetPath).split(path.sep).join("/");
}

function resolveMissionRelativePath(rootPath: string, relativePath: unknown) {
  if (typeof relativePath !== "string" || !relativePath.trim()) return null;
  if (path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(rootPath, relativePath);
  const root = path.resolve(rootPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

async function listMissionJsonFiles(rootPath: string) {
  const files: string[] = [];

  async function walk(currentPath: string) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        files.push(absolutePath);
      }
    }
  }

  await walk(rootPath);
  return files;
}

async function findMissionFilesById(rootPath: string, missionId: string) {
  if (!missionId.trim()) return [];
  const matches: string[] = [];
  const files = await listMissionJsonFiles(rootPath);
  for (const file of files) {
    try {
      const parsed = parseMissionJsonText(await fsp.readFile(file, "utf-8"));
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) continue;
      if (String((parsed.value as Record<string, unknown>).id ?? "").trim() === missionId) {
        matches.push(file);
      }
    } catch {
      // Ignore unreadable files here; mission diagnostics report parse problems separately.
    }
  }
  return matches;
}

export async function POST(req: NextRequest) {
  const localGameSource = getLocalGameSourceState();
  if (!localGameSource.active || !localGameSource.missionsRootPath || !localGameSource.available.missions) {
    return NextResponse.json({ ok: false, error: "No active local game mission folder is configured." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mission = body?.mission as MissionDraft | undefined;
    const index = Number.isInteger(body?.index) ? Number(body.index) : 0;
    const knownMissionIds = Array.isArray(body?.knownMissionIds) ? body.knownMissionIds.map((entry: unknown) => String(entry)) : [];
    if (!mission || typeof mission !== "object") {
      return NextResponse.json({ ok: false, error: "A mission draft is required." }, { status: 400 });
    }

    const errors = validateMissionDrafts([mission], knownMissionIds).filter((issue) => issue.level === "error");
    if (errors.length) {
      return NextResponse.json({ ok: false, error: errors.map((issue) => issue.message).join(" ") }, { status: 400 });
    }

    const stampedMission = withMissionEditTimestamp(mission);
    const sourcePath = resolveMissionRelativePath(localGameSource.missionsRootPath, stampedMission.sourceRelativePath);
    const existingPaths = await findMissionFilesById(localGameSource.missionsRootPath, stampedMission.id.trim());
    let targetPath = sourcePath;

    if (!targetPath && existingPaths.length === 1) {
      targetPath = existingPaths[0];
    }

    if (!targetPath && existingPaths.length > 1) {
      return NextResponse.json(
        {
          ok: false,
          error: `Mission id "${stampedMission.id.trim()}" already exists in multiple files: ${existingPaths.map((file) => toPortableRelativePath(localGameSource.missionsRootPath!, file)).join(", ")}. Clean up the duplicate mission files before saving this draft.`,
        },
        { status: 409 },
      );
    }

    if (!targetPath) {
      targetPath = path.join(localGameSource.missionsRootPath, missionFilename(stampedMission, index));
    }

    const filename = path.basename(targetPath);
    const savedRelativePath = toPortableRelativePath(localGameSource.missionsRootPath, targetPath);
    const savedMission: MissionDraft = {
      ...stampedMission,
      sourceRelativePath: savedRelativePath,
    };

    const exportedMission = exportMissionDraft(savedMission);
    const expectedRewards = readRewardSummary(exportedMission);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    await fsp.writeFile(targetPath, `${JSON.stringify(exportedMission, null, 2)}\n`, "utf-8");

    const savedParseResult = parseMissionJsonText(await fsp.readFile(targetPath, "utf-8"));
    if (!savedParseResult.value || typeof savedParseResult.value !== "object" || Array.isArray(savedParseResult.value)) {
      return NextResponse.json({ ok: false, error: "Mission was written, but the saved file could not be read back as a JSON object." }, { status: 500 });
    }
    const savedRewards = readRewardSummary(savedParseResult.value);
    if (savedRewards.credits !== expectedRewards.credits) {
      return NextResponse.json(
        {
          ok: false,
          error: "Mission was written, but rewards.credits did not match the exported mission.",
        },
        { status: 500 },
      );
    }
    await loadAll();

    return NextResponse.json({
      ok: true,
      savedPath: targetPath,
      sourceRelativePath: savedRelativePath,
      filename,
      mission: savedMission,
      duplicateMissionPaths:
        existingPaths.length > 1
          ? existingPaths.map((file) => toPortableRelativePath(localGameSource.missionsRootPath!, file))
          : [],
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
