import type {
  MissionFilterOptions,
  MissionFilterState,
  MissionSortKey,
  NormalizedMission,
} from "@lib/mission-lab/types";
import { dedupeStrings, missionSortValue, parseNumberValue } from "@lib/mission-lab/utils";

export function createDefaultMissionFilterState(): MissionFilterState {
  return {
    search: "",
    folders: [],
    categories: [],
    arcs: [],
    tags: [],
    factions: [],
    classes: [],
    modes: [],
    objectiveTypes: [],
    levelMin: "",
    levelMax: "",
    hasPrerequisites: "all",
    repeatable: "all",
    sortBy: "title",
    sortDirection: "asc",
    selectedMissionKey: null,
    focusedMissionKey: null,
  };
}

function sortStringList(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function buildMissionFilterOptions(missions: NormalizedMission[]): MissionFilterOptions {
  const levels = missions.map((mission) => mission.level).filter((value): value is number => value != null);

  return {
    folders: sortStringList(dedupeStrings(missions.map((mission) => mission.folderName))),
    categories: sortStringList(dedupeStrings(missions.map((mission) => mission.derivedCategory ?? "").filter(Boolean))),
    arcs: sortStringList(dedupeStrings(missions.flatMap((mission) => mission.arcs))),
    tags: sortStringList(dedupeStrings(missions.flatMap((mission) => mission.tags))),
    factions: sortStringList(dedupeStrings(missions.map((mission) => mission.faction ?? "").filter(Boolean))),
    classes: sortStringList(dedupeStrings(missions.map((mission) => mission.classLabel))),
    modes: sortStringList(dedupeStrings(missions.map((mission) => mission.primaryMode ?? "").filter(Boolean))),
    objectiveTypes: sortStringList(dedupeStrings(missions.flatMap((mission) => mission.objectiveTypes))),
    minLevel: levels.length ? Math.min(...levels) : null,
    maxLevel: levels.length ? Math.max(...levels) : null,
  };
}

function missionMatchesSearch(mission: NormalizedMission, search: string) {
  if (!search) return true;
  const normalized = search.toLowerCase();
  const haystacks = [
    mission.title,
    mission.id,
    mission.folderName,
    mission.faction ?? "",
    mission.derivedCategory ?? "",
    ...mission.tags,
    ...mission.arcs,
  ];
  return haystacks.some((value) => value.toLowerCase().includes(normalized));
}

function filterBySelectedValues(selected: string[], values: string[]) {
  if (!selected.length) return true;
  return selected.some((entry) => values.includes(entry));
}

function compareMissionValues(left: NormalizedMission, right: NormalizedMission, sortBy: MissionSortKey, direction: "asc" | "desc") {
  const leftValue = missionSortValue(left, sortBy);
  const rightValue = missionSortValue(right, sortBy);
  const multiplier = direction === "asc" ? 1 : -1;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    if (leftValue !== rightValue) return (leftValue - rightValue) * multiplier;
    return left.title.localeCompare(right.title) * multiplier;
  }

  const comparison = String(leftValue).localeCompare(String(rightValue));
  if (comparison !== 0) return comparison * multiplier;
  return left.title.localeCompare(right.title) * multiplier;
}

export function applyMissionFilters(missions: NormalizedMission[], filters: MissionFilterState) {
  const levelMin = parseNumberValue(filters.levelMin);
  const levelMax = parseNumberValue(filters.levelMax);

  return [...missions]
    .filter((mission) => missionMatchesSearch(mission, filters.search.trim()))
    .filter((mission) => (!filters.folders.length ? true : filters.folders.includes(mission.folderName)))
    .filter((mission) => (!filters.categories.length ? true : filters.categories.includes(mission.derivedCategory ?? "")))
    .filter((mission) => filterBySelectedValues(filters.arcs, mission.arcs))
    .filter((mission) => filterBySelectedValues(filters.tags, mission.tags))
    .filter((mission) => (!filters.factions.length ? true : filters.factions.includes(mission.faction ?? "")))
    .filter((mission) => (!filters.classes.length ? true : filters.classes.includes(mission.classLabel)))
    .filter((mission) => (!filters.modes.length ? true : filters.modes.includes(mission.primaryMode ?? "")))
    .filter((mission) => filterBySelectedValues(filters.objectiveTypes, mission.objectiveTypes))
    .filter((mission) => (levelMin == null ? true : (mission.level ?? -1) >= levelMin))
    .filter((mission) => (levelMax == null ? true : (mission.level ?? Number.MAX_SAFE_INTEGER) <= levelMax))
    .filter((mission) => {
      if (filters.hasPrerequisites === "all") return true;
      return filters.hasPrerequisites === "yes" ? mission.hasPrerequisites : !mission.hasPrerequisites;
    })
    .filter((mission) => {
      if (filters.repeatable === "all") return true;
      return filters.repeatable === "yes" ? mission.repeatable : !mission.repeatable;
    })
    .sort((left, right) => compareMissionValues(left, right, filters.sortBy, filters.sortDirection));
}
