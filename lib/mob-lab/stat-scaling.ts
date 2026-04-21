import { BUILT_IN_MOB_STAT_KEYS } from "@lib/mob-lab/constants";

export const MOB_STAT_RANK_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "elite", label: "Elite" },
] as const;

export type MobStatRank = (typeof MOB_STAT_RANK_OPTIONS)[number]["value"];

type StatMap = Record<string, number>;

const RANK_MULTIPLIERS: Record<MobStatRank, number> = {
  normal: 1,
  elite: 1.35,
};

const ROUNDING: Record<string, number> = {
  armor: 1,
  shields: 1,
  energy: 1,
  power: 1,
  evasion: 2,
  targeting: 2,
  sensors: 2,
  speed: 1,
  energy_regen_rate: 2,
  shield_regen: 2,
  hacking: 2,
  stealth: 2,
};

const CONSTANT_STATS: StatMap = {
  armor_regen: 0,
  threat_generation: 0,
  damage_reflect: 0,
  damage_reduction: 0,
  salvage_bonus: 0,
  heat_resistance: 0,
  overclock: 0,
};

const ANCHORS: Record<number, Partial<StatMap>> = {
  10: {
    armor: 50,
    shields: 100,
    energy: 150,
    power: 300,
    evasion: 15,
    energy_regen_rate: 10,
    shield_regen: 3,
    targeting: 10,
    hacking: 5,
    stealth: 3,
    sensors: 15,
    speed: 320,
    ...CONSTANT_STATS,
  },
  20: {
    armor: 80,
    shields: 160,
    energy: 185,
    power: 500,
    evasion: 22,
    energy_regen_rate: 13.5,
    shield_regen: 4.4,
    targeting: 17,
    hacking: 8.5,
    stealth: 5,
    sensors: 18.5,
    speed: 334,
  },
  30: { armor: 120, shields: 240, power: 750, targeting: 24, evasion: 28, sensors: 23 },
  40: { armor: 170, shields: 340, power: 1050, targeting: 32, evasion: 34, sensors: 28 },
  50: { armor: 230, shields: 460, power: 1400, targeting: 40, evasion: 40, sensors: 34 },
  60: { armor: 300, shields: 600, power: 1800, targeting: 48, evasion: 46, sensors: 40 },
  70: { armor: 380, shields: 760, power: 2250, targeting: 56, evasion: 52, sensors: 46 },
  80: { armor: 470, shields: 940, power: 2750, targeting: 64, evasion: 58, sensors: 52 },
  90: { armor: 570, shields: 1140, power: 3300, targeting: 72, evasion: 64, sensors: 58 },
  100: { armor: 680, shields: 1360, power: 3900, targeting: 80, evasion: 70, sensors: 65 },
};

function clampLevel(level: string | number) {
  const parsed = typeof level === "number" ? level : Number(level);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function earlyGameStats(level: number): StatMap {
  const l = clampLevel(level);
  return {
    armor: 5 * l,
    shields: 10 * l,
    energy: 100 + (l - 1) * (50 / 9),
    power: 10 + (l - 1) * (290 / 9),
    evasion: 5 + (l - 1) * (10 / 9),
    energy_regen_rate: 5 + (l - 1) * (5 / 9),
    shield_regen: 1 + (l - 1) * (2 / 9),
    targeting: (l - 1) * (10 / 9),
    hacking: (l - 1) * (5 / 9),
    stealth: (l - 1) * (3 / 9),
    sensors: 10 + (l - 1) * (5 / 9),
    speed: 300 + (l - 1) * (20 / 9),
    ...CONSTANT_STATS,
  };
}

function anchorStats(level: number) {
  const merged = {
    ...earlyGameStats(1),
    ...(ANCHORS[level] ?? {}),
  };
  const out: StatMap = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

function interpolatedStats(level: number): StatMap {
  const levels = Object.keys(ANCHORS)
    .map(Number)
    .sort((left, right) => left - right);
  const clamped = clampLevel(level);
  const first = levels[0];
  const last = levels[levels.length - 1];

  if (clamped <= first) return anchorStats(first);
  if (clamped >= last) return anchorStats(last);

  let lowerLevel = first;
  let upperLevel = last;
  for (const anchorLevel of levels) {
    if (anchorLevel <= clamped) lowerLevel = anchorLevel;
    if (anchorLevel >= clamped) {
      upperLevel = anchorLevel;
      break;
    }
  }

  if (lowerLevel === upperLevel) return anchorStats(lowerLevel);

  const lower = anchorStats(lowerLevel);
  const upper = anchorStats(upperLevel);
  const t = (clamped - lowerLevel) / (upperLevel - lowerLevel);
  const keys = new Set([...Object.keys(lower), ...Object.keys(upper)]);
  const out: StatMap = {};

  for (const key of keys) {
    const lowerValue = lower[key];
    const upperValue = upper[key];
    if (typeof lowerValue === "number" && typeof upperValue === "number") {
      out[key] = lowerValue + (upperValue - lowerValue) * t;
    } else if (typeof lowerValue === "number") {
      out[key] = lowerValue;
    } else if (typeof upperValue === "number") {
      out[key] = upperValue;
    }
  }

  return out;
}

function roundForStat(key: string, value: number) {
  const decimals = ROUNDING[key] ?? 2;
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function formatStatValue(key: string, value: number) {
  const rounded = roundForStat(key, value);
  if (Number.isInteger(rounded)) return String(rounded);
  const decimals = ROUNDING[key] ?? 2;
  return rounded.toFixed(decimals).replace(/\.?0+$/, "");
}

export function normalizeMobStatRank(value: string | undefined): MobStatRank {
  return value === "elite" ? "elite" : "normal";
}

export function generateMobStatsForLevel(level: string | number, rankValue: string | undefined = "normal") {
  const rank = normalizeMobStatRank(rankValue);
  const clampedLevel = clampLevel(level);
  const baseStats = clampedLevel <= 10 ? earlyGameStats(clampedLevel) : interpolatedStats(clampedLevel);
  const multiplier = RANK_MULTIPLIERS[rank];
  const generated: Record<string, string> = {};

  for (const statKey of BUILT_IN_MOB_STAT_KEYS) {
    if (statKey === "lootbox_count") continue;
    const baseValue = baseStats[statKey];
    if (typeof baseValue !== "number") continue;
    generated[statKey] = formatStatValue(statKey, baseValue * multiplier);
  }

  return generated;
}

export function mergeGeneratedMobStats(currentStats: Record<string, string>, level: string | number, rankValue: string | undefined) {
  return {
    ...currentStats,
    ...generateMobStatsForLevel(level, rankValue),
  };
}
