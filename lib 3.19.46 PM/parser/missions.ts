import path from "path";
import { listFilesRecursive, readJson } from "./fileutils";
import { Mission, MissionObjective, Mob } from "@lib/types";

export function parseMissions(repoRoot: string, mobIndex: Map<string, Mob>): Mission[] {
  const missionsRoot = path.join(repoRoot, "scripts", "system", "missions", "missions");
  const files = listFilesRecursive(missionsRoot, [".json"]);
  const missions: Mission[] = [];
  for (const f of files) {
    const raw = readJson<any>(f);
    if (!raw) continue;
    const id = String(raw.id ?? path.basename(f, ".json"));
    const objectives: MissionObjective[] = Array.isArray(raw.objectives) ? raw.objectives : [];
    const level_min = raw?.availability?.level_min ?? raw?.level_min ?? null;
    const level_max = raw?.availability?.level_max ?? raw?.level_max ?? null;
    const has_explicit = Number.isFinite(level_min) || Number.isFinite(level_max);

    let inferred: number | undefined = undefined;
    if (!has_explicit) {
      const targets: number[] = [];
      for (const obj of objectives) {
        if ((obj.type || "").toLowerCase() === "kill") {
          const ids = obj.target_ids ?? [];
          for (const tid of ids) {
            const mob = mobIndex.get(String(tid));
            if (mob?.level != null) targets.push(mob.level);
          }
        }
      }
      if (targets.length) inferred = Math.round(targets.reduce((a,b)=>a+b,0)/targets.length);
    }

    missions.push({
      id,
      title: String(raw.title ?? id),
      giver_id: raw.giver_id ?? undefined,
      faction: raw.faction ?? undefined,
      arcs: raw.arcs ?? raw.tags ?? undefined,
      tags: raw.tags ?? undefined,
      has_explicit_gating: !!has_explicit,
      level_min: Number.isFinite(level_min) ? Number(level_min) : undefined,
      level_max: Number.isFinite(level_max) ? Number(level_max) : undefined,
      inferred_level: inferred,
      repeatable: !!raw.repeatable,
      objectives
    });
  }
  return missions;
}
