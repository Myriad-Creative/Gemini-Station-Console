import { parseLooseJson } from "@lib/json";
import type {
  ItemDraft,
  ItemManagerImportResult,
  ItemManagerParseStrategy,
  ItemManagerSourceType,
  ItemManagerSummary,
  ItemManagerWorkspace,
  ItemValidationIssue,
} from "@lib/item-manager/types";

type JsonObject = Record<string, unknown>;

const MODELED_KEYS = new Set(["id", "name", "description", "icon", "type", "category", "rarity", "size", "sell_price", "buy_price", "stackable", "max_stack"]);
export const DEFAULT_ITEM_ICON = "icon_lootbox.png";
export const ITEM_TYPE_OPTIONS = [
  "Trade Good",
  "Raw Material",
  "Refined Material",
  "Fuel",
  "Component",
  "Supply",
  "Hazardous",
  "Special",
] as const;
export const ITEM_RARITY_OPTIONS = [
  { value: "1", label: "Common" },
  { value: "2", label: "Uncommon" },
  { value: "3", label: "Rare" },
  { value: "4", label: "Epic" },
  { value: "5", label: "Legendary" },
] as const;
export const ITEM_RARITY_LABEL: Record<string, string> = Object.fromEntries(ITEM_RARITY_OPTIONS.map((entry) => [entry.value, entry.label]));
export const ITEM_RARITY_COLOR: Record<string, string> = {
  "1": "#FFFFFF",
  "2": "#3CB371",
  "3": "#6495ED",
  "4": "#663399",
  "5": "#FFA500",
};

let draftCounter = 0;

function createDraftKey() {
  draftCounter += 1;
  return `item-draft-${draftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
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

function incrementTrailingNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "item_001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }

  return `${trimmed}_001`;
}

export function normalizeComparableItemId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
}

function normalizeImportedItem(source: JsonObject, fallbackId: string, sourceIndex: number): ItemDraft {
  const extra: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (!MODELED_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  return {
    key: createDraftKey(),
    sourceIndex,
    id: String(source.id ?? fallbackId).trim(),
    name: String(source.name ?? "").trim(),
    description: String(source.description ?? "").trim(),
    icon: String(source.icon ?? "").trim(),
    rarity: source.rarity === undefined || source.rarity === null ? "" : String(source.rarity).trim(),
    type: String(source.type ?? source.category ?? "").trim(),
    size: source.size === undefined || source.size === null ? "" : String(source.size).trim(),
    sellPrice: source.sell_price === undefined || source.sell_price === null ? "" : String(source.sell_price).trim(),
    buyPrice: source.buy_price === undefined || source.buy_price === null ? "" : String(source.buy_price).trim(),
    stackable: Boolean(source.stackable),
    maxStack: source.max_stack === undefined || source.max_stack === null ? "" : String(source.max_stack).trim(),
    extraJson: Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "",
  };
}

function normalizeImportedRoot(root: unknown) {
  if (Array.isArray(root)) {
    return root.map((entry, index) => normalizeImportedItem(asObject(entry), String(index + 1), index));
  }

  if (root && typeof root === "object") {
    return Object.entries(root as JsonObject).map(([id, value], index) => normalizeImportedItem(asObject(value), id, index));
  }

  throw new Error("Item manager expects items.json to be a JSON array or object.");
}

function parseExtraJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, data: {} as JsonObject };

  const parsed = parseLooseJson(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Additional runtime JSON must be a JSON object.");
  }

  const objectValue = { ...(parsed as JsonObject) };
  for (const key of MODELED_KEYS) {
    delete objectValue[key];
  }
  return { ok: true as const, data: objectValue };
}

function coerceIdValue(value: string) {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function coerceRarityValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Number(trimmed);
}

function exportItem(draft: ItemDraft) {
  const extra = parseExtraJson(draft.extraJson).data;
  return cleanObject({
    id: coerceIdValue(draft.id),
    name: draft.name.trim(),
    description: draft.description.trim(),
    icon: resolvedItemIconPath(draft.icon),
    rarity: coerceRarityValue(draft.rarity),
    type: draft.type.trim(),
    size: draft.size.trim() ? Number(draft.size.trim()) : undefined,
    sell_price: draft.sellPrice.trim() ? Number(draft.sellPrice.trim()) : undefined,
    buy_price: draft.buyPrice.trim() ? Number(draft.buyPrice.trim()) : undefined,
    stackable: draft.stackable,
    max_stack: draft.maxStack.trim() ? Number(draft.maxStack.trim()) : undefined,
    ...extra,
  });
}

function hasNumericIds(existingIds: string[]) {
  return existingIds.some((value) => /^-?\d+(?:\.\d+)?$/.test(value.trim()));
}

export function resolvedItemIconPath(value: string) {
  const trimmed = value.trim();
  return trimmed || DEFAULT_ITEM_ICON;
}

export function nextGeneratedItemId(existingIds: string[], previousId?: string) {
  const normalizedIds = existingIds.map((value) => normalizeComparableItemId(value)).filter(Boolean);
  const taken = new Set(normalizedIds);

  const previousTrimmed = previousId?.trim() ?? "";
  if (/^-?\d+(?:\.\d+)?$/.test(previousTrimmed)) {
    let candidate = String(Math.floor(Number(previousTrimmed)) + 1);
    while (taken.has(candidate)) {
      candidate = String(Number(candidate) + 1);
    }
    return candidate;
  }

  if (hasNumericIds(normalizedIds)) {
    const maxNumericId = Math.max(...normalizedIds.filter((value) => /^-?\d+(?:\.\d+)?$/.test(value)).map((value) => Math.floor(Number(value))));
    let candidate = String(maxNumericId + 1);
    while (taken.has(candidate)) {
      candidate = String(Number(candidate) + 1);
    }
    return candidate;
  }

  let candidate = incrementTrailingNumber(previousTrimmed || "item_000");
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

export function createBlankItem(existingIds: string[] = []): ItemDraft {
  return {
    key: createDraftKey(),
    sourceIndex: -1,
    id: nextGeneratedItemId(existingIds),
    name: "",
    description: "",
    icon: "",
    rarity: "1",
    type: ITEM_TYPE_OPTIONS[0],
    size: "",
    sellPrice: "",
    buyPrice: "",
    stackable: false,
    maxStack: "",
    extraJson: "",
  };
}

export function createBlankItemWorkspace(): ItemManagerWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseStrategy: "strict",
    strictJsonValid: true,
    importedAt: new Date().toISOString(),
    items: [],
  };
}

export function cloneItemDraft(source: ItemDraft, existingIds: string[]) {
  return {
    ...source,
    key: createDraftKey(),
    id: nextGeneratedItemId(existingIds, source.id || "0"),
  } satisfies ItemDraft;
}

export function importItemWorkspace(
  text: string,
  sourceLabel: string | null,
  sourceType: ItemManagerSourceType = "local",
): ItemManagerImportResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  let parsed: unknown;
  let parseStrategy: ItemManagerParseStrategy = "strict";
  let strictJsonValid = true;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    strictJsonValid = false;
    parseStrategy = "loose";
    parsed = parseLooseJson(cleaned);
  }

  const items = normalizeImportedRoot(parsed);
  return {
    workspace: {
      sourceType,
      sourceLabel,
      parseStrategy,
      strictJsonValid,
      importedAt: new Date().toISOString(),
      items,
    },
    warnings: strictJsonValid ? [] : ["Imported with tolerant JSON parsing because items.json is not strict JSON."],
  };
}

export function updateItemDraftAt(
  workspace: ItemManagerWorkspace,
  itemKey: string,
  updater: (current: ItemDraft) => ItemDraft,
) {
  return {
    ...workspace,
    items: workspace.items.map((item) => (item.key === itemKey ? updater(item) : item)),
  } satisfies ItemManagerWorkspace;
}

export function insertItemDraftAfter(workspace: ItemManagerWorkspace, afterKey: string | null, nextItem: ItemDraft) {
  if (!afterKey) {
    return { ...workspace, items: [nextItem, ...workspace.items] } satisfies ItemManagerWorkspace;
  }

  const next = [...workspace.items];
  const index = next.findIndex((item) => item.key === afterKey);
  if (index === -1) {
    next.unshift(nextItem);
  } else {
    next.splice(index + 1, 0, nextItem);
  }
  return { ...workspace, items: next } satisfies ItemManagerWorkspace;
}

export function deleteItemDraftAt(workspace: ItemManagerWorkspace, itemKey: string) {
  return {
    ...workspace,
    items: workspace.items.filter((item) => item.key !== itemKey),
  } satisfies ItemManagerWorkspace;
}

export function duplicateItemIdMap(items: ItemDraft[]) {
  const duplicates = new Map<string, string[]>();
  for (const item of items) {
    const id = normalizeComparableItemId(item.id);
    if (!id) continue;
    const current = duplicates.get(id) ?? [];
    current.push(item.key);
    duplicates.set(id, current);
  }
  return new Map(Array.from(duplicates.entries()).filter(([, keys]) => keys.length > 1));
}

export function validateItemDrafts(items: ItemDraft[]): ItemValidationIssue[] {
  const issues: ItemValidationIssue[] = [];
  const ids = new Map<string, string[]>();

  for (const item of items) {
    const id = normalizeComparableItemId(item.id);
    if (!id) {
      issues.push({
        level: "error",
        itemKey: item.key,
        field: "id",
        message: "Item ID is required.",
      });
    } else {
      const current = ids.get(id) ?? [];
      current.push(item.key);
      ids.set(id, current);
    }

    if (!item.name.trim()) {
      issues.push({
        level: "error",
        itemKey: item.key,
        field: "name",
        message: "Item name is required.",
      });
    }

    if (!item.rarity.trim()) {
      issues.push({
        level: "warning",
        itemKey: item.key,
        field: "rarity",
        message: "Item rarity is blank.",
      });
    } else if (Number.isNaN(Number(item.rarity))) {
      issues.push({
        level: "error",
        itemKey: item.key,
        field: "rarity",
        message: "Item rarity must be numeric.",
      });
    } else if (!ITEM_RARITY_OPTIONS.some((entry) => entry.value === item.rarity.trim())) {
      issues.push({
        level: "warning",
        itemKey: item.key,
        field: "rarity",
        message: "Item rarity should be one of the supported rarity values.",
      });
    }

    if (!item.type.trim()) {
      issues.push({
        level: "warning",
        itemKey: item.key,
        field: "type",
        message: "Item type is blank.",
      });
    } else if (!ITEM_TYPE_OPTIONS.includes(item.type.trim() as (typeof ITEM_TYPE_OPTIONS)[number])) {
      issues.push({
        level: "warning",
        itemKey: item.key,
        field: "type",
        message: "Item type is not one of the supported item categories.",
      });
    }

    for (const [field, label, value] of [
      ["size", "Size", item.size],
      ["sellPrice", "Sell Price", item.sellPrice],
      ["buyPrice", "Buy Price", item.buyPrice],
      ["maxStack", "Stack Size", item.maxStack],
    ] as const) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (Number.isNaN(Number(trimmed))) {
        issues.push({
          level: "error",
          itemKey: item.key,
          field,
          message: `${label} must be numeric.`,
        });
      }
    }

    try {
      parseExtraJson(item.extraJson);
    } catch (error) {
      issues.push({
        level: "error",
        itemKey: item.key,
        field: "extraJson",
        message: error instanceof Error ? error.message : "Additional runtime JSON is invalid.",
      });
    }
  }

  for (const [id, itemKeys] of ids.entries()) {
    if (itemKeys.length < 2) continue;
    for (const itemKey of itemKeys) {
      issues.push({
        level: "error",
        itemKey,
        field: "id",
        message: `Item ID "${id}" already exists in this workspace.`,
      });
    }
  }

  return issues;
}

export function summarizeItemWorkspace(workspace: ItemManagerWorkspace | null, issues: ItemValidationIssue[]): ItemManagerSummary {
  if (!workspace) {
    return {
      totalItems: 0,
      typedItems: 0,
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
    totalItems: workspace.items.length,
    typedItems: workspace.items.filter((item) => item.type.trim()).length,
    duplicateIdCount: duplicateIds.size,
    errorCount: issues.filter((issue) => issue.level === "error").length,
    warningCount: issues.filter((issue) => issue.level === "warning").length,
  };
}

export function stringifyItemWorkspace(workspace: ItemManagerWorkspace) {
  return JSON.stringify(workspace.items.map((item) => exportItem(item)), null, 2);
}

export function stringifySingleItem(item: ItemDraft) {
  return JSON.stringify(exportItem(item), null, 2);
}
