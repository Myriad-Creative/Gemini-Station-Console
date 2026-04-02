import { parseLooseJson } from "@lib/json";
import type {
  MerchantLabImportResult,
  MerchantLabParseStrategy,
  MerchantLabSourceShape,
  MerchantLabSourceType,
  MerchantLabSummary,
  MerchantLabWorkspace,
  MerchantProfileDraft,
  MerchantProfileValidationIssue,
} from "@lib/merchant-lab/types";

type JsonObject = Record<string, unknown>;

const MERCHANT_PROFILE_RESERVED_KEYS = ["id", "name", "description", "items", "mods"] as const;

let draftCounter = 0;

function createDraftKey() {
  draftCounter += 1;
  return `merchant-profile-${draftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stripKeys(source: JsonObject, keys: readonly string[]) {
  const hidden = new Set(keys);
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (!hidden.has(key)) next[key] = value;
  }
  return next;
}

function formatJsonBlock(source: JsonObject) {
  return Object.keys(source).length ? JSON.stringify(source, null, 2) : "";
}

function parseObjectTextarea(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};

  let parsed: unknown;
  try {
    parsed = parseLooseJson(trimmed);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as JsonObject;
}

function normalizeIdList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (value === null || value === undefined) return [];
  const scalar = String(value).trim();
  return scalar ? [scalar] : [];
}

function cleanObject(source: JsonObject) {
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    next[key] = value;
  }
  return next;
}

function toExportReferenceId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "merchant_profile_001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }

  return `${trimmed}_001`;
}

function normalizeImportedProfile(source: JsonObject, sourceIndex: number): MerchantProfileDraft {
  return {
    key: createDraftKey(),
    sourceIndex,
    id: String(source.id ?? "").trim(),
    name: String(source.name ?? "").trim(),
    description: String(source.description ?? "").trim(),
    items: normalizeIdList(source.items),
    mods: normalizeIdList(source.mods),
    extra_json: formatJsonBlock(stripKeys(source, MERCHANT_PROFILE_RESERVED_KEYS)),
  };
}

function normalizeImportedRoot(root: unknown) {
  if (Array.isArray(root)) {
    return {
      shape: "array" as MerchantLabSourceShape,
      profiles: root.map((entry, index) => normalizeImportedProfile(asObject(entry), index)),
    };
  }

  if (root && typeof root === "object") {
    return {
      shape: "record" as MerchantLabSourceShape,
      profiles: Object.entries(root as JsonObject).map(([fallbackId, value], index) =>
        normalizeImportedProfile({ id: fallbackId, ...asObject(value) }, index),
      ),
    };
  }

  throw new Error("Merchant profile import expects a JSON array or object map.");
}

export function nextGeneratedMerchantProfileId(existingIds: string[], previousId?: string) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = incrementTrailingNumber(previousId || "");
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

export function createBlankMerchantProfile(existingIds: string[] = []): MerchantProfileDraft {
  return {
    key: createDraftKey(),
    sourceIndex: -1,
    id: nextGeneratedMerchantProfileId(existingIds, "merchant_profile_000"),
    name: "",
    description: "",
    items: [],
    mods: [],
    extra_json: "",
  };
}

export function createBlankMerchantWorkspace(): MerchantLabWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    sourceShape: "array",
    parseStrategy: "strict",
    strictJsonValid: true,
    importedAt: new Date().toISOString(),
    profiles: [createBlankMerchantProfile()],
  };
}

export function cloneMerchantProfile(source: MerchantProfileDraft, existingIds: string[]) {
  return {
    ...source,
    key: createDraftKey(),
    id: nextGeneratedMerchantProfileId(existingIds, source.id || "merchant_profile_000"),
    items: [...source.items],
    mods: [...source.mods],
  } satisfies MerchantProfileDraft;
}

export function importMerchantWorkspace(
  text: string,
  sourceLabel: string | null,
  sourceType: MerchantLabSourceType = "uploaded",
): MerchantLabImportResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  let parsed: unknown;
  let parseStrategy: MerchantLabParseStrategy = "strict";
  let strictJsonValid = true;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    strictJsonValid = false;
    parseStrategy = "loose";
    parsed = parseLooseJson(cleaned);
  }

  const normalized = normalizeImportedRoot(parsed);
  return {
    workspace: {
      sourceType,
      sourceLabel,
      sourceShape: normalized.shape,
      parseStrategy,
      strictJsonValid,
      importedAt: new Date().toISOString(),
      profiles: normalized.profiles.length ? normalized.profiles : [createBlankMerchantProfile()],
    },
    warnings: strictJsonValid ? [] : ["Imported with tolerant JSON parsing because the file is not strict JSON."],
  };
}

export function validateMerchantProfiles(profiles: MerchantProfileDraft[]): MerchantProfileValidationIssue[] {
  const issues: MerchantProfileValidationIssue[] = [];
  const ids = new Map<string, string[]>();

  for (const profile of profiles) {
    const id = profile.id.trim();
    if (!id) {
      issues.push({
        level: "error",
        profileKey: profile.key,
        field: "id",
        message: "Merchant profile ID is required.",
      });
    } else {
      const current = ids.get(id) ?? [];
      current.push(profile.key);
      ids.set(id, current);
    }

    if (profile.extra_json.trim()) {
      try {
        const extra = parseObjectTextarea(profile.extra_json, "Extra JSON");
        const reservedKeys = Object.keys(extra).filter((key) =>
          MERCHANT_PROFILE_RESERVED_KEYS.includes(key as (typeof MERCHANT_PROFILE_RESERVED_KEYS)[number]),
        );
        if (reservedKeys.length) {
          issues.push({
            level: "warning",
            profileKey: profile.key,
            field: "extra_json",
            message: `Extra JSON includes reserved keys that will be ignored: ${reservedKeys.join(", ")}.`,
          });
        }
      } catch (error) {
        issues.push({
          level: "error",
          profileKey: profile.key,
          field: "extra_json",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duplicateItems = new Set<string>();
    const seenItems = new Set<string>();
    for (const itemId of profile.items.map((entry) => entry.trim()).filter(Boolean)) {
      if (seenItems.has(itemId)) duplicateItems.add(itemId);
      seenItems.add(itemId);
    }
    if (duplicateItems.size) {
      issues.push({
        level: "warning",
        profileKey: profile.key,
        field: "items",
        message: `Duplicate item ids in profile: ${Array.from(duplicateItems).join(", ")}.`,
      });
    }

    const duplicateMods = new Set<string>();
    const seenMods = new Set<string>();
    for (const modId of profile.mods.map((entry) => entry.trim()).filter(Boolean)) {
      if (seenMods.has(modId)) duplicateMods.add(modId);
      seenMods.add(modId);
    }
    if (duplicateMods.size) {
      issues.push({
        level: "warning",
        profileKey: profile.key,
        field: "mods",
        message: `Duplicate mod ids in profile: ${Array.from(duplicateMods).join(", ")}.`,
      });
    }
  }

  for (const [id, profileKeys] of ids.entries()) {
    if (profileKeys.length < 2) continue;
    for (const profileKey of profileKeys) {
      issues.push({
        level: "error",
        profileKey,
        field: "id",
        message: `Merchant profile ID "${id}" already exists in this workspace.`,
      });
    }
  }

  return issues;
}

export function summarizeMerchantWorkspace(
  workspace: MerchantLabWorkspace | null,
  issues: MerchantProfileValidationIssue[],
): MerchantLabSummary {
  if (!workspace) {
    return {
      totalProfiles: 0,
      totalItemRefs: 0,
      totalModRefs: 0,
      duplicateIdCount: 0,
      errorCount: 0,
      warningCount: 0,
    };
  }

  const duplicateIds = new Set(
    issues
      .filter((issue) => issue.field === "id" && issue.message.includes("already exists"))
      .map((issue) => issue.message.match(/"(.+?)"/)?.[1] ?? issue.message),
  );

  return {
    totalProfiles: workspace.profiles.length,
    totalItemRefs: workspace.profiles.reduce((total, profile) => total + profile.items.length, 0),
    totalModRefs: workspace.profiles.reduce((total, profile) => total + profile.mods.length, 0),
    duplicateIdCount: duplicateIds.size,
    errorCount: issues.filter((issue) => issue.level === "error").length,
    warningCount: issues.filter((issue) => issue.level === "warning").length,
  };
}

export function serializeMerchantProfile(profile: MerchantProfileDraft) {
  const extra = parseObjectTextarea(profile.extra_json, "Extra JSON");
  const known = cleanObject({
    id: profile.id.trim(),
    name: profile.name.trim(),
    description: profile.description.trim(),
    items: profile.items.map((entry) => toExportReferenceId(entry)).filter((entry) => entry !== undefined),
    mods: profile.mods.map((entry) => toExportReferenceId(entry)).filter((entry) => entry !== undefined),
  });

  const next = { ...known } as JsonObject;
  for (const [key, value] of Object.entries(extra)) {
    if (MERCHANT_PROFILE_RESERVED_KEYS.includes(key as (typeof MERCHANT_PROFILE_RESERVED_KEYS)[number])) continue;
    next[key] = value;
  }

  return next;
}

export function serializeMerchantWorkspace(workspace: MerchantLabWorkspace) {
  const serialized = workspace.profiles.map((profile) => serializeMerchantProfile(profile));
  if (workspace.sourceShape === "record") {
    return serialized.reduce<Record<string, unknown>>((accumulator, profile) => {
      accumulator[String(profile.id)] = profile;
      return accumulator;
    }, {});
  }
  return serialized;
}

export function stringifyMerchantWorkspace(workspace: MerchantLabWorkspace) {
  return JSON.stringify(serializeMerchantWorkspace(workspace), null, 2);
}

function indentJsonBlock(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${prefix}${line}`))
    .join("\n");
}

export function stringifySingleMerchantProfile(profile: MerchantProfileDraft) {
  const serialized = serializeMerchantProfile(profile);
  const entries = Object.entries(serialized);
  if (!entries.length) return "{}";

  return `{\n${entries
    .map(([key, value]) => {
      const valueString =
        (key === "items" || key === "mods") && Array.isArray(value)
          ? JSON.stringify(value)
          : JSON.stringify(value, null, 2);
      return `  ${JSON.stringify(key)}: ${indentJsonBlock(valueString, "  ")}`;
    })
    .join(",\n")}\n}`;
}

export function updateMerchantProfileAt(
  workspace: MerchantLabWorkspace,
  profileKey: string,
  updater: (current: MerchantProfileDraft) => MerchantProfileDraft,
) {
  return {
    ...workspace,
    profiles: workspace.profiles.map((profile) => (profile.key === profileKey ? updater(profile) : profile)),
  };
}

export function deleteMerchantProfileAt(workspace: MerchantLabWorkspace, profileKey: string) {
  return {
    ...workspace,
    profiles: workspace.profiles.filter((profile) => profile.key !== profileKey),
  };
}

export function insertMerchantProfileAfter(
  workspace: MerchantLabWorkspace,
  afterProfileKey: string | null,
  nextProfile: MerchantProfileDraft,
) {
  if (!afterProfileKey) {
    return {
      ...workspace,
      profiles: [...workspace.profiles, nextProfile],
    };
  }

  const index = workspace.profiles.findIndex((profile) => profile.key === afterProfileKey);
  if (index === -1) {
    return {
      ...workspace,
      profiles: [...workspace.profiles, nextProfile],
    };
  }

  return {
    ...workspace,
    profiles: [...workspace.profiles.slice(0, index + 1), nextProfile, ...workspace.profiles.slice(index + 1)],
  };
}

export function duplicateMerchantProfileIdMap(profiles: MerchantProfileDraft[]) {
  const byId = new Map<string, string[]>();
  for (const profile of profiles) {
    const id = profile.id.trim();
    if (!id) continue;
    const current = byId.get(id) ?? [];
    current.push(profile.key);
    byId.set(id, current);
  }
  return new Map(Array.from(byId.entries()).filter(([, profileKeys]) => profileKeys.length > 1));
}
