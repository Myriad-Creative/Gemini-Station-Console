export type StatMap = Record<string, number>;

export interface Mod {
  id: string;
  name: string;
  slot: string;
  classRestriction?: string[];
  levelRequirement: number;
  itemLevel?: number;
  rarity: number;
  durability?: number;
  sellPrice?: number;
  stats: StatMap;
  abilities: (number | string)[];
  icon?: string;
  description?: string;
}

export interface Ability {
  id: number | string;
  name?: string;
  description?: string;
  cooldown?: number;
  energy_cost?: number;
  resource?: string;
}

export interface Mob {
  id: string;
  displayName?: string;
  level?: number;
  faction?: string;
  abilities?: (number | string)[];
  stats?: StatMap;
}

export interface MissionObjective {
  type: string;
  target_ids?: string[];
  count?: number;
  description?: string;
}

export interface Mission {
  id: string;
  title: string;
  giver_id?: string;
  faction?: string;
  arcs?: string[];
  tags?: string[];
  has_explicit_gating: boolean;
  level_min?: number;
  level_max?: number;
  inferred_level?: number;
  repeatable?: boolean;
  objectives: MissionObjective[];
}

export interface Item {
  id: string;
  name: string;
  levelRequirement: number;
  rarity: number;
  icon?: string;
  type?: string;
  stats?: Record<string, number>;
}

export interface Summary {
  missionsByBand: { band: string; count: number }[];
  modsCoverage: { slot: string; level: number; count: number }[];
  modsCoverageBands: { slot: string; band: string; count: number }[];
  bandLabels: string[];
  rarityCounts: { rarity: number; count: number }[];
  holes: Hole[];
  outliers: Outlier[];
}

export interface Hole {
  slot: string;
  level: number;
  count: number;
  required: number;
}

export interface Outlier {
  modId: string;
  name: string;
  slot: string;
  level: number;
  rarity: number;
  stat: string;
  z: number;
  cohortSize: number;
}
