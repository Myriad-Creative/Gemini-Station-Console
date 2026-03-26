import type { NormalizedMission } from "@lib/mission-lab/types";

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return false;
}

export function listFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => stringOrNull(entry))
      .filter((entry): entry is string => !!entry);
  }

  const single = stringOrNull(value);
  return single ? [single] : [];
}

export function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeTaxonomyList(value: unknown) {
  const rawEntries = listFromUnknown(value);
  const placeholders = rawEntries.filter((entry) => {
    const normalized = entry.trim().toLowerCase();
    return !normalized || normalized === "none" || normalized === "null" || normalized === "n/a";
  });

  const normalized = dedupeStrings(
    rawEntries.filter((entry) => {
      const lowered = entry.trim().toLowerCase();
      return lowered && lowered !== "none" && lowered !== "null" && lowered !== "n/a";
    }),
  );

  return { rawEntries, normalized, placeholders };
}

export function humanizeToken(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function summarizeObjectiveSource(raw: Record<string, unknown>, type: string, count: number | null) {
  const explicitObjective = stringOrNull(raw.objective ?? raw.objective_text ?? raw.goal ?? raw.label ?? raw.title);
  if (explicitObjective) return explicitObjective;

  const subject = stringOrNull(
    raw.target_name ??
      raw.target ??
      raw.npc_name ??
      raw.speaker_name ??
      raw.item_name ??
      raw.location_name ??
      raw.destination ??
      raw.system ??
      raw.sector,
  );

  const targetIds = extractTargetIds(raw);
  const joinedTargets = targetIds.slice(0, 3).join(", ");
  const fallbackSubject = subject || joinedTargets || null;

  switch (type) {
    case "talk":
      return fallbackSubject ? `Talk to ${fallbackSubject}.` : "Talk to the target.";
    case "hail":
      return fallbackSubject ? `Hail ${fallbackSubject}.` : "Hail the target.";
    case "scan":
      return fallbackSubject
        ? `Scan ${count ?? 1} ${fallbackSubject}.`
        : `Scan ${count ?? 1} target${count === 1 ? "" : "s"}.`;
    case "sell":
      return fallbackSubject
        ? `Sell ${count ?? 1} ${fallbackSubject}.`
        : `Sell ${count ?? 1} item${count === 1 ? "" : "s"}.`;
    case "kill":
      return fallbackSubject
        ? `Kill ${count ?? 1} ${fallbackSubject}.`
        : `Eliminate ${count ?? 1} target${count === 1 ? "" : "s"}.`;
    case "travel":
      return fallbackSubject ? `Travel to ${fallbackSubject}.` : "Travel to the destination.";
    case "collect":
      return fallbackSubject
        ? `Collect ${count ?? 1} ${fallbackSubject}.`
        : `Collect ${count ?? 1} item${count === 1 ? "" : "s"}.`;
    case "buy":
      return fallbackSubject
        ? `Buy ${count ?? 1} ${fallbackSubject}.`
        : `Buy ${count ?? 1} item${count === 1 ? "" : "s"}.`;
    case "explore":
      return fallbackSubject ? `Explore ${fallbackSubject}.` : "Explore the target area.";
    case "repair":
      return fallbackSubject
        ? `Repair ${count ?? 1} ${fallbackSubject}.`
        : `Repair ${count ?? 1} target${count === 1 ? "" : "s"}.`;
    default:
      if (fallbackSubject && count != null) return `${humanizeToken(type)} ${count} ${fallbackSubject}.`;
      if (fallbackSubject) return `${humanizeToken(type)} ${fallbackSubject}.`;
      if (count != null) return `${humanizeToken(type)} ${count}.`;
      return humanizeToken(type);
  }
}

export function extractTargetIds(raw: Record<string, unknown>) {
  const fromArray = Array.isArray(raw.target_ids)
    ? (raw.target_ids as unknown[]).map((entry) => String(entry).trim()).filter(Boolean)
    : [];

  const singleValueCandidates = [
    raw.target_id,
    raw.npc_id,
    raw.mob_id,
    raw.item_id,
    raw.location_id,
    raw.destination_id,
    raw.mod_id,
  ];

  const singles = singleValueCandidates
    .map((entry) => stringOrNull(entry))
    .filter((entry): entry is string => !!entry);

  return dedupeStrings([...fromArray, ...singles]);
}

export function missionSortValue(mission: NormalizedMission, sortBy: string) {
  switch (sortBy) {
    case "id":
      return mission.id;
    case "level":
      return mission.level ?? -1;
    case "folder":
      return mission.folderName;
    case "faction":
      return mission.faction ?? "";
    case "mode":
      return mission.primaryMode ?? "";
    case "objectiveCount":
      return mission.objectiveCount;
    case "prerequisiteCount":
      return mission.prerequisiteCount;
    case "title":
    default:
      return mission.title;
  }
}
