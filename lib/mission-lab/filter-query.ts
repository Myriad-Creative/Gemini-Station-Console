import { createDefaultMissionFilterState } from "@lib/mission-lab/filters";
import type { MissionBooleanFilter, MissionFilterState, MissionSortKey } from "@lib/mission-lab/types";

const SORT_KEYS = new Set<MissionSortKey>([
  "title",
  "id",
  "level",
  "folder",
  "faction",
  "mode",
  "objectiveCount",
  "prerequisiteCount",
]);

function readMultiValue(searchParams: URLSearchParams, key: string, fallback: string[]) {
  if (!searchParams.has(key)) return fallback;
  return searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);
}

function readStringValue(searchParams: URLSearchParams, key: string, fallback: string) {
  if (!searchParams.has(key)) return fallback;
  return searchParams.get(key) ?? "";
}

function readBooleanFilter(searchParams: URLSearchParams, key: string, fallback: MissionBooleanFilter): MissionBooleanFilter {
  if (!searchParams.has(key)) return fallback;
  const value = searchParams.get(key);
  return value === "yes" || value === "no" ? value : "all";
}

function readSortKey(searchParams: URLSearchParams, fallback: MissionSortKey) {
  if (!searchParams.has("sortBy")) return fallback;
  const sortBy = searchParams.get("sortBy") as MissionSortKey | null;
  return sortBy && SORT_KEYS.has(sortBy) ? sortBy : "title";
}

export function readMissionFilterState(searchParams: URLSearchParams, fallback?: MissionFilterState): MissionFilterState {
  const base = fallback ?? createDefaultMissionFilterState();
  const direction = searchParams.has("sortDirection") ? searchParams.get("sortDirection") : base.sortDirection;

  return {
    search: readStringValue(searchParams, "search", base.search),
    folders: readMultiValue(searchParams, "folders", base.folders),
    categories: readMultiValue(searchParams, "categories", base.categories),
    arcs: readMultiValue(searchParams, "arcs", base.arcs),
    tags: readMultiValue(searchParams, "tags", base.tags),
    factions: readMultiValue(searchParams, "factions", base.factions),
    classes: readMultiValue(searchParams, "classes", base.classes),
    modes: readMultiValue(searchParams, "modes", base.modes),
    objectiveTypes: readMultiValue(searchParams, "objectiveTypes", base.objectiveTypes),
    levelMin: readStringValue(searchParams, "levelMin", base.levelMin),
    levelMax: readStringValue(searchParams, "levelMax", base.levelMax),
    hasPrerequisites: readBooleanFilter(searchParams, "hasPrerequisites", base.hasPrerequisites),
    repeatable: readBooleanFilter(searchParams, "repeatable", base.repeatable),
    sortBy: readSortKey(searchParams, base.sortBy),
    sortDirection: direction === "desc" ? "desc" : "asc",
    selectedMissionKey: searchParams.has("selectedMissionKey")
      ? searchParams.get("selectedMissionKey")
      : base.selectedMissionKey,
    focusedMissionKey: searchParams.has("focusedMissionKey")
      ? searchParams.get("focusedMissionKey")
      : base.focusedMissionKey,
  };
}
