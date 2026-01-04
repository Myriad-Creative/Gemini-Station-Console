import { Mod, Outlier } from "@lib/types";

export function collectStatKeys(mods: Mod[]): string[] {
  const s = new Set<string>();
  for (const m of mods) for (const k of Object.keys(m.stats)) s.add(k);
  return Array.from(s).sort();
}

export function cohortKeyOf(m: Mod) {
  return `${m.slot}::${m.levelRequirement}::${m.rarity}`;
}

export function computeCohorts(mods: Mod[]): Map<string, Mod[]> {
  const map = new Map<string, Mod[]>();
  for (const m of mods) {
    const key = cohortKeyOf(m);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

function mean(xs: number[]) { return xs.reduce((a,b)=>a+b,0)/xs.length; }
function std(xs: number[]) {
  const m = mean(xs);
  const v = xs.reduce((a,b)=>a+(b-m)*(b-m),0) / Math.max(1, xs.length-1);
  return Math.sqrt(v);
}

export function computeOutliers(mods: Mod[], zThreshold: number): Outlier[] {
  const out: Outlier[] = [];
  const cohorts = computeCohorts(mods);
  for (const [key, group] of cohorts.entries()) {
    if (group.length < 3) continue;
    const [slot, levelStr, rarityStr] = key.split("::");
    const level = Number(levelStr);
    const rarity = Number(rarityStr);
    const statKeys = collectStatKeys(group);
    for (const stat of statKeys) {
      const values = group.map(m => m.stats[stat] ?? 0);
      const mu = mean(values);
      const sd = std(values);
      if (sd === 0) continue;
      for (let i=0;i<group.length;i++) {
        const z = (values[i] - mu) / sd;
        if (Math.abs(z) >= zThreshold) {
          const m = group[i];
          out.push({ modId: m.id, name: m.name, slot, level, rarity, stat, z, cohortSize: group.length });
        }
      }
    }
  }
  return out;
}

export function computeCompositeScore(m: Mod, weightsGlobal: Record<string, number>, weightsPerSlot?: Record<string, Record<string, number>>, abilityWeight=1) {
  const statTotal = Object.values(m.stats || {}).reduce((sum, val) => sum + Number(val ?? 0), 0);
  const abilitiesScore = (m.abilities?.length || 0) * 5;
  return statTotal + abilitiesScore;
}
