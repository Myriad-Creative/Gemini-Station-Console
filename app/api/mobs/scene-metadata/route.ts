import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpriteScale = {
  x: number;
  y: number;
};

type SceneSpriteMetadata = {
  scene: string;
  spriteNodeName: string | null;
  spriteScale: SpriteScale | null;
  error?: string;
};

const DEFAULT_SPRITE_SCALE: SpriteScale = { x: 1, y: 1 };

function resolveResPath(gameRootPath: string, resPath: string) {
  const trimmed = resPath.trim();
  if (!trimmed.startsWith("res://")) throw new Error("Only res:// scene paths are supported.");

  const root = path.resolve(gameRootPath);
  const absolute = path.resolve(root, trimmed.replace(/^res:\/\//, ""));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Scene path resolves outside the configured game root.");
  }

  return absolute;
}

function parseNodeAttribute(block: string, attribute: string) {
  const header = block.match(/^\[node([^\]]*)\]/)?.[1] ?? "";
  const match = header.match(new RegExp(`${attribute}="([^"]*)"`));
  return match?.[1] ?? "";
}

function parseVector2(value: string): SpriteScale | null {
  const match = value.match(/Vector2\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)/);
  if (!match) return null;

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

function parseSpriteMetadata(scene: string, contents: string): SceneSpriteMetadata {
  const nodeBlocks = contents.split(/\n(?=\[)/).filter((block) => block.startsWith("[node "));
  const spriteBlocks = nodeBlocks.filter((block) => parseNodeAttribute(block, "type") === "Sprite2D");
  const selectedBlock =
    spriteBlocks.find((block) => parseNodeAttribute(block, "name") === "Sprite2D") ??
    spriteBlocks.find((block) => parseNodeAttribute(block, "name") !== "SelectionRing") ??
    null;

  if (!selectedBlock) {
    return {
      scene,
      spriteNodeName: null,
      spriteScale: null,
      error: "No Sprite2D node was found in this scene.",
    };
  }

  const scaleLine = selectedBlock.match(/(?:^|\n)scale\s*=\s*(Vector2\([^\n]+\))/);
  const spriteScale = scaleLine ? parseVector2(scaleLine[1]) : DEFAULT_SPRITE_SCALE;

  return {
    scene,
    spriteNodeName: parseNodeAttribute(selectedBlock, "name") || null,
    spriteScale: spriteScale ?? DEFAULT_SPRITE_SCALE,
  };
}

async function readSceneMetadata(gameRootPath: string, scene: string): Promise<SceneSpriteMetadata> {
  try {
    const absolute = resolveResPath(gameRootPath, scene);
    const contents = await fs.readFile(absolute, "utf-8");
    return parseSpriteMetadata(scene, contents);
  } catch (error) {
    return {
      scene,
      spriteNodeName: null,
      spriteScale: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function POST(req: NextRequest) {
  const local = getLocalGameSourceState();
  if (!local.active || !local.gameRootPath) {
    return NextResponse.json({ ok: false, error: "Local game source is not configured." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const scenes: string[] = Array.isArray(body?.scenes)
    ? Array.from(new Set<string>(body.scenes.map((entry: unknown) => String(entry ?? "").trim()).filter(Boolean))).slice(0, 300)
    : [];

  const entries = await Promise.all(scenes.map((scene) => readSceneMetadata(local.gameRootPath as string, scene)));
  const metadata = Object.fromEntries(entries.map((entry) => [entry.scene, entry]));

  return NextResponse.json({
    ok: true,
    metadata,
  });
}
