import { parseLooseJson } from "@lib/json";
import type {
  CommsContactDraft,
  CommsContactValidationIssue,
  CommsLabImportResult,
  CommsLabParseStrategy,
  CommsLabSourceType,
  CommsLabSummary,
  CommsLabWorkspace,
} from "@lib/comms-manager/types";

type JsonObject = Record<string, unknown>;

export const DEFAULT_COMMS_PORTRAIT = "res://assets/comms/temp.png";

let draftCounter = 0;

function createDraftKey() {
  draftCounter += 1;
  return `comms-contact-${draftCounter}`;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function normalizeDialog(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? ""));
  }
  if (value === null || value === undefined) return [];
  return [String(value)];
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
  if (!trimmed) return "contact_001";

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
  }

  return `${trimmed}_001`;
}

function slugifyContactName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return slug || "contact";
}

function normalizeImportedContact(source: JsonObject, fallbackId: string, sourceIndex: number): CommsContactDraft {
  const meta = asObject(source.meta);
  return {
    key: createDraftKey(),
    sourceIndex,
    id: String(source.id ?? fallbackId).trim(),
    name: String(source.name ?? "").trim(),
    portrait: String(source.portrait ?? "").trim(),
    greeting: String(source.greeting ?? "").trim(),
    dialog: normalizeDialog(source.dialog),
    notes: String(meta.notes ?? "").trim(),
  };
}

function normalizeImportedRoot(root: unknown) {
  if (Array.isArray(root)) {
    return root.map((entry, index) => normalizeImportedContact(asObject(entry), `contact_${index + 1}`, index));
  }

  if (root && typeof root === "object") {
    return Object.entries(root as JsonObject).map(([id, value], index) => normalizeImportedContact(asObject(value), id, index));
  }

  throw new Error("Comms import expects a JSON object map or array.");
}

function exportContact(draft: CommsContactDraft) {
  return cleanObject({
    name: draft.name.trim(),
    portrait: resolvedPortraitPath(draft.portrait),
    greeting: draft.greeting,
    ...(draft.dialog.length ? { dialog: [...draft.dialog] } : {}),
    meta: {
      notes: draft.notes,
    },
  });
}

function exportWorkspaceObject(workspace: CommsLabWorkspace) {
  return Object.fromEntries(
    workspace.contacts
      .map((contact) => [contact.id.trim(), exportContact(contact)] as const)
      .filter(([id]) => Boolean(id)),
  );
}

export function resolvedPortraitPath(value: string) {
  const trimmed = value.trim();
  return trimmed || DEFAULT_COMMS_PORTRAIT;
}

export function nextGeneratedCommsId(existingIds: string[], previousId?: string) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = incrementTrailingNumber(previousId || "contact_000");
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

export function generateCommsIdFromName(name: string, existingIds: string[]) {
  const taken = new Set(existingIds.map((entry) => entry.trim()).filter(Boolean));
  let candidate = slugifyContactName(name);
  while (taken.has(candidate)) {
    candidate = incrementTrailingNumber(candidate);
  }
  return candidate;
}

export function createBlankCommsContact(existingIds: string[] = []): CommsContactDraft {
  return {
    key: createDraftKey(),
    sourceIndex: -1,
    id: nextGeneratedCommsId(existingIds),
    name: "",
    portrait: "",
    greeting: "",
    dialog: [],
    notes: "",
  };
}

export function createBlankCommsWorkspace(): CommsLabWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseStrategy: "strict",
    strictJsonValid: true,
    importedAt: new Date().toISOString(),
    contacts: [createBlankCommsContact()],
  };
}

export function cloneCommsContact(source: CommsContactDraft, existingIds: string[]) {
  return {
    ...source,
    key: createDraftKey(),
    id: nextGeneratedCommsId(existingIds, source.id || "contact_000"),
    dialog: [...source.dialog],
  } satisfies CommsContactDraft;
}

export function importCommsWorkspace(
  text: string,
  sourceLabel: string | null,
  sourceType: CommsLabSourceType = "uploaded",
): CommsLabImportResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  let parsed: unknown;
  let parseStrategy: CommsLabParseStrategy = "strict";
  let strictJsonValid = true;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    strictJsonValid = false;
    parseStrategy = "loose";
    parsed = parseLooseJson(cleaned);
  }

  const contacts = normalizeImportedRoot(parsed);
  return {
    workspace: {
      sourceType,
      sourceLabel,
      parseStrategy,
      strictJsonValid,
      importedAt: new Date().toISOString(),
      contacts: contacts.length ? contacts : [createBlankCommsContact()],
    },
    warnings: strictJsonValid ? [] : ["Imported with tolerant JSON parsing because the file is not strict JSON."],
  };
}

export function updateCommsContactAt(
  workspace: CommsLabWorkspace,
  contactKey: string,
  updater: (current: CommsContactDraft) => CommsContactDraft,
) {
  return {
    ...workspace,
    contacts: workspace.contacts.map((contact) => (contact.key === contactKey ? updater(contact) : contact)),
  } satisfies CommsLabWorkspace;
}

export function insertCommsContactAfter(
  workspace: CommsLabWorkspace,
  afterKey: string | null,
  nextContact: CommsContactDraft,
) {
  if (!afterKey) {
    return { ...workspace, contacts: [nextContact, ...workspace.contacts] } satisfies CommsLabWorkspace;
  }

  const next = [...workspace.contacts];
  const index = next.findIndex((contact) => contact.key === afterKey);
  if (index === -1) {
    next.unshift(nextContact);
  } else {
    next.splice(index + 1, 0, nextContact);
  }
  return { ...workspace, contacts: next } satisfies CommsLabWorkspace;
}

export function deleteCommsContactAt(workspace: CommsLabWorkspace, contactKey: string) {
  const next = workspace.contacts.filter((contact) => contact.key !== contactKey);
  return {
    ...workspace,
    contacts: next.length ? next : [createBlankCommsContact()],
  } satisfies CommsLabWorkspace;
}

export function duplicateCommsIdMap(contacts: CommsContactDraft[]) {
  const duplicates = new Map<string, string[]>();
  for (const contact of contacts) {
    const id = contact.id.trim();
    if (!id) continue;
    const current = duplicates.get(id) ?? [];
    current.push(contact.key);
    duplicates.set(id, current);
  }
  return new Map(Array.from(duplicates.entries()).filter(([, keys]) => keys.length > 1));
}

export function validateCommsContacts(contacts: CommsContactDraft[]): CommsContactValidationIssue[] {
  const issues: CommsContactValidationIssue[] = [];
  const ids = new Map<string, string[]>();

  for (const contact of contacts) {
    const id = contact.id.trim();
    if (!id) {
      issues.push({
        level: "error",
        contactKey: contact.key,
        field: "id",
        message: "Contact ID is required.",
      });
    } else {
      const current = ids.get(id) ?? [];
      current.push(contact.key);
      ids.set(id, current);
    }

    if (!contact.name.trim()) {
      issues.push({
        level: "warning",
        contactKey: contact.key,
        field: "name",
        message: "Contact name is blank.",
      });
    }
  }

  for (const [id, contactKeys] of ids.entries()) {
    if (contactKeys.length < 2) continue;
    for (const contactKey of contactKeys) {
      issues.push({
        level: "error",
        contactKey,
        field: "id",
        message: `Contact ID "${id}" already exists in this workspace.`,
      });
    }
  }

  return issues;
}

export function summarizeCommsWorkspace(
  workspace: CommsLabWorkspace | null,
  issues: CommsContactValidationIssue[],
): CommsLabSummary {
  if (!workspace) {
    return {
      totalContacts: 0,
      dialogLineCount: 0,
      notedContacts: 0,
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
    totalContacts: workspace.contacts.length,
    dialogLineCount: workspace.contacts.reduce((sum, contact) => sum + contact.dialog.length, 0),
    notedContacts: workspace.contacts.filter((contact) => contact.notes.trim()).length,
    duplicateIdCount: duplicateIds.size,
    errorCount: issues.filter((issue) => issue.level === "error").length,
    warningCount: issues.filter((issue) => issue.level === "warning").length,
  };
}

export function stringifyCommsWorkspace(workspace: CommsLabWorkspace) {
  return JSON.stringify(exportWorkspaceObject(workspace), null, 2);
}

export function stringifySingleCommsContact(contact: CommsContactDraft) {
  const wrapped = JSON.stringify({ [contact.id.trim() || "contact_id"]: exportContact(contact) }, null, 2);
  return wrapped.replace(/^\{\n/, "").replace(/\n\}$/, "");
}
