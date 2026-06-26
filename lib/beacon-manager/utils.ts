import {
  createDraftKey,
  createUniqueId,
  objectWithoutKeys,
  parseExtraJsonObject,
  stringifyJson,
  toStringArray,
} from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type { BeaconDraft, BeaconScanTierDraft, BeaconValidationIssue, BeaconWorkspace } from "@lib/beacon-manager/types";

const KNOWN_BEACON_KEYS = [
  "id",
  "title",
  "display_name",
  "xp",
  "faction",
  "class",
  "tags",
  "missions_available",
  "grant_mission_ids_on_scan",
  "grant_missions_on_scan",
  "scan_mission_ids",
  "scan",
];

const KNOWN_SCAN_KEYS = ["Faction", "Class", "Notes", "tiers"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function compactArray(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function maybeJson(value: Record<string, unknown>) {
  return Object.keys(value).length ? stringifyJson(value) : "";
}

function cleanObject<T extends Record<string, unknown>>(value: T) {
  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null) continue;
    if (typeof entry === "string" && !entry.trim()) continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    if (isRecord(entry) && Object.keys(entry).length === 0) continue;
    cleaned[key] = entry;
  }
  return cleaned;
}

function scanTiersFromRecord(tiers: Record<string, unknown>): BeaconScanTierDraft[] {
  return Object.entries(tiers)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([level, value]) => ({
      key: createDraftKey("beacon-tier"),
      level,
      text: typeof value === "string" ? value : stringifyJson(value),
    }));
}

export function createBeaconDraftFromRecord(record: Record<string, unknown>, fallbackId = "new_nav_beacon"): BeaconDraft {
  const id = stringValue(record.id, fallbackId).trim() || fallbackId;
  const scan = asRecord(record.scan);
  return {
    key: createDraftKey("beacon"),
    id,
    title: stringValue(record.title, id),
    displayName: stringValue(record.display_name, stringValue(record.title, id)),
    xp: stringValue(record.xp, ""),
    faction: stringValue(record.faction, stringValue(scan.Faction, "")),
    beaconClass: stringValue(record.class, stringValue(scan.Class, "Navigation Beacon")),
    tags: compactArray(toStringArray(record.tags)),
    missionsAvailable: compactArray(toStringArray(record.missions_available)),
    grantMissionIdsOnScan: compactArray(toStringArray(record.grant_mission_ids_on_scan ?? record.grant_missions_on_scan ?? record.scan_mission_ids)),
    scanFaction: stringValue(scan.Faction, stringValue(record.faction, "")),
    scanClass: stringValue(scan.Class, stringValue(record.class, "Navigation Beacon")),
    scanNotes: stringValue(scan.Notes, ""),
    scanTiers: scanTiersFromRecord(asRecord(scan.tiers)),
    scanExtraJson: maybeJson(objectWithoutKeys(scan, KNOWN_SCAN_KEYS)),
    extraJson: maybeJson(objectWithoutKeys(record, KNOWN_BEACON_KEYS)),
  };
}

export function createBlankBeacon(existingIds: string[] = []): BeaconDraft {
  const id = createUniqueId("new_nav_beacon", existingIds);
  return {
    key: createDraftKey("beacon"),
    id,
    title: "New Navigation Beacon",
    displayName: "New Navigation Beacon",
    xp: "0",
    faction: "Independent",
    beaconClass: "Navigation Beacon",
    tags: ["navigation_beacon", "beacon", "scannable"],
    missionsAvailable: [],
    grantMissionIdsOnScan: [],
    scanFaction: "Independent",
    scanClass: "Navigation Beacon",
    scanNotes: "",
    scanTiers: [],
    scanExtraJson: "",
    extraJson: "",
  };
}

export function duplicateBeaconDraft(beacon: BeaconDraft, existingIds: string[]) {
  const id = createUniqueId(`${beacon.id || "nav_beacon"}_copy`, existingIds);
  return {
    ...beacon,
    key: createDraftKey("beacon"),
    id,
    title: `${beacon.title || beacon.displayName || beacon.id} Copy`,
    displayName: `${beacon.displayName || beacon.title || beacon.id} Copy`,
    scanTiers: beacon.scanTiers.map((tier) => ({ ...tier, key: createDraftKey("beacon-tier") })),
  };
}

export function createBlankBeaconWorkspace(): BeaconWorkspace {
  return {
    beacons: [],
    extraJson: "",
    sourceLabel: "New beacon workspace",
    parseWarnings: [],
  };
}

export function importBeaconWorkspace(text: string, sourceLabel: string): BeaconWorkspace {
  const parsed = parseTolerantJsonText(text);
  const rootValue = parsed.value;
  let beaconEntries: Array<[string, unknown]> = [];
  let extraJson = "";

  if (Array.isArray(rootValue)) {
    beaconEntries = rootValue.map((entry, index) => [`beacon_${index + 1}`, entry]);
  } else if (isRecord(rootValue) && Array.isArray(rootValue.beacons)) {
    beaconEntries = rootValue.beacons.map((entry, index) => [`beacon_${index + 1}`, entry]);
    extraJson = maybeJson(objectWithoutKeys(rootValue, ["beacons"]));
  } else if (isRecord(rootValue)) {
    beaconEntries = Object.entries(rootValue);
  }

  return {
    beacons: beaconEntries
      .map(([id, entry]) => createBeaconDraftFromRecord(asRecord(entry), id))
      .filter((beacon) => beacon.id.trim()),
    extraJson,
    sourceLabel,
    parseWarnings: parsed.errors,
  };
}

export function exportBeaconDraft(beacon: BeaconDraft) {
  const extra = parseExtraJsonObject(beacon.extraJson, `Extra JSON for ${beacon.id || beacon.title}`);
  const scanExtra = parseExtraJsonObject(beacon.scanExtraJson, `Scan extra JSON for ${beacon.id || beacon.title}`);
  const tiers: Record<string, string> = {};
  for (const tier of beacon.scanTiers) {
    const level = tier.level.trim();
    if (!level) continue;
    tiers[level] = tier.text;
  }
  const xp = beacon.xp.trim() ? Number(beacon.xp) : null;
  return cleanObject({
    ...extra,
    id: beacon.id.trim(),
    title: beacon.title.trim(),
    display_name: beacon.displayName.trim(),
    xp: xp !== null && Number.isFinite(xp) ? xp : undefined,
    faction: beacon.faction.trim(),
    class: beacon.beaconClass.trim(),
    tags: compactArray(beacon.tags),
    missions_available: compactArray(beacon.missionsAvailable),
    grant_mission_ids_on_scan: compactArray(beacon.grantMissionIdsOnScan),
    scan: cleanObject({
      ...scanExtra,
      Faction: beacon.scanFaction.trim(),
      Class: beacon.scanClass.trim(),
      Notes: beacon.scanNotes.trim(),
      tiers,
    }),
  });
}

export function workspaceToBeaconFile(workspace: BeaconWorkspace) {
  return {
    ...parseExtraJsonObject(workspace.extraJson, "Top-level extra JSON"),
    beacons: workspace.beacons.map(exportBeaconDraft),
  };
}

export function stringifyBeaconWorkspace(workspace: BeaconWorkspace) {
  return stringifyJson(workspaceToBeaconFile(workspace));
}

export function validateBeaconDrafts(workspace: BeaconWorkspace | null): BeaconValidationIssue[] {
  if (!workspace) {
    return [{ level: "error", field: "workspace", message: "No beacon workspace is loaded." }];
  }
  const issues: BeaconValidationIssue[] = [];
  const ids = new Map<string, string[]>();
  for (const beacon of workspace.beacons) {
    const id = beacon.id.trim();
    if (!id) {
      issues.push({ level: "error", beaconKey: beacon.key, field: "id", message: "Every beacon needs an ID." });
    } else {
      ids.set(id, [...(ids.get(id) ?? []), beacon.key]);
    }
    if (!beacon.title.trim() && !beacon.displayName.trim()) {
      issues.push({ level: "warning", beaconKey: beacon.key, field: "title", message: `Beacon "${id || "unnamed"}" has no title or display name.` });
    }
    if (beacon.xp.trim()) {
      const xp = Number(beacon.xp);
      if (!Number.isFinite(xp) || xp < 0) {
        issues.push({ level: "error", beaconKey: beacon.key, field: "xp", message: `Beacon "${id || beacon.title}" needs a non-negative XP value.` });
      }
    }
    for (const tier of beacon.scanTiers) {
      if (!tier.level.trim()) {
        issues.push({ level: "error", beaconKey: beacon.key, field: "scan.tiers", message: `Beacon "${id || beacon.title}" has a blank scan tier key.` });
      }
    }
    try {
      parseExtraJsonObject(beacon.extraJson, `Extra JSON for ${id || beacon.title}`);
      parseExtraJsonObject(beacon.scanExtraJson, `Scan extra JSON for ${id || beacon.title}`);
    } catch (error) {
      issues.push({ level: "error", beaconKey: beacon.key, field: "extraJson", message: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const [id, keys] of ids.entries()) {
    if (keys.length > 1) {
      issues.push({ level: "error", field: "id", message: `Beacon ID "${id}" is duplicated.` });
    }
  }
  try {
    parseExtraJsonObject(workspace.extraJson, "Top-level extra JSON");
  } catch (error) {
    issues.push({ level: "error", field: "extraJson", message: error instanceof Error ? error.message : String(error) });
  }
  return issues;
}
