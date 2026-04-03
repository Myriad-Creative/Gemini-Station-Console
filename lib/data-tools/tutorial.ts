import {
  createDraftKey,
  createUniqueId,
  objectWithoutKeys,
  parseExtraJsonObject,
  stringifyJson,
} from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type {
  TutorialAreaTriggerDraft,
  TutorialEntriesWorkspace,
  TutorialEntryDraft,
  TutorialTriggerGroupDraft,
  TutorialTriggersWorkspace,
} from "@lib/data-tools/types";

function createTutorialEntryDraft(record?: Record<string, unknown>): TutorialEntryDraft {
  return {
    key: createDraftKey("tutorial-entry"),
    id: String(record?.id ?? ""),
    title: String(record?.title ?? ""),
    image: String(record?.image ?? ""),
    body: String(record?.body ?? ""),
    category: String(record?.category ?? ""),
    tags: Array.isArray(record?.tags) ? record.tags.map((tag) => String(tag ?? "")) : [],
    order: String(record?.order ?? ""),
    showOnce: Boolean(record?.show_once),
    pauseGame: Boolean(record?.pause_game),
    extraJson: stringifyJson(
      objectWithoutKeys(record ?? {}, ["id", "title", "image", "body", "category", "tags", "order", "show_once", "pause_game"]),
    ),
  };
}

function exportTutorialEntryDraft(draft: TutorialEntryDraft) {
  return {
    id: draft.id.trim(),
    title: draft.title.trim(),
    image: draft.image.trim(),
    body: draft.body,
    category: draft.category.trim(),
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    order: Number(draft.order || 0),
    show_once: draft.showOnce,
    pause_game: draft.pauseGame,
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for tutorial entry "${draft.id || draft.title || "untitled"}"`),
  };
}

export function createBlankTutorialEntriesWorkspace(): TutorialEntriesWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    version: "1",
    entries: [createBlankTutorialEntry()],
  };
}

export function createBlankTutorialEntry(existingIds: string[] = []): TutorialEntryDraft {
  return createTutorialEntryDraft({
    id: createUniqueId("tutorial_entry", existingIds),
    title: "New Tutorial Entry",
    image: "",
    body: "",
    category: "General",
    tags: [],
    order: 0,
    show_once: false,
    pause_game: false,
  });
}

export function cloneTutorialEntry(draft: TutorialEntryDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("tutorial-entry"),
    id: createUniqueId(`${draft.id || "tutorial_entry"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importTutorialEntriesWorkspace(text: string | null, sourceLabel: string | null): TutorialEntriesWorkspace {
  if (!text) return createBlankTutorialEntriesWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || !Array.isArray(root.entries)) {
    throw new Error("info_entries.json must contain a top-level { version, entries: [] } object.");
  }
  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    version: String(root.version ?? "1"),
    entries: root.entries
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => createTutorialEntryDraft(entry)),
  };
}

export function stringifyTutorialEntriesFile(workspace: TutorialEntriesWorkspace) {
  return JSON.stringify(
    {
      version: Number(workspace.version || 1),
      entries: workspace.entries.map(exportTutorialEntryDraft),
    },
    null,
    2,
  );
}

export function stringifySingleTutorialEntry(draft: TutorialEntryDraft) {
  return JSON.stringify(exportTutorialEntryDraft(draft), null, 2);
}

function createTriggerGroupDraft(id: string, infoIds: unknown): TutorialTriggerGroupDraft {
  return {
    key: createDraftKey("tutorial-trigger-group"),
    id,
    infoIds: Array.isArray(infoIds) ? infoIds.map((entry) => String(entry ?? "")) : [],
  };
}

function createAreaDraft(record?: Record<string, unknown>): TutorialAreaTriggerDraft {
  const position = Array.isArray(record?.position) ? record.position : [];
  return {
    key: createDraftKey("tutorial-area"),
    id: String(record?.id ?? ""),
    positionX: String(position[0] ?? ""),
    positionY: String(position[1] ?? ""),
    radius: String(record?.radius ?? ""),
    infoIds: Array.isArray(record?.info_ids) ? record.info_ids.map((entry) => String(entry ?? "")) : [],
    once: Boolean(record?.once),
    extraJson: stringifyJson(objectWithoutKeys(record ?? {}, ["id", "position", "radius", "info_ids", "once"])),
  };
}

function exportAreaDraft(draft: TutorialAreaTriggerDraft) {
  return {
    id: draft.id.trim(),
    position: [Number(draft.positionX || 0), Number(draft.positionY || 0)],
    radius: Number(draft.radius || 0),
    info_ids: draft.infoIds.map((infoId) => infoId.trim()).filter(Boolean),
    once: draft.once,
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for tutorial area "${draft.id || "untitled"}"`),
  };
}

export function createBlankTutorialTriggersWorkspace(): TutorialTriggersWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    version: "1",
    groups: [createTriggerGroupDraft("_startup", [])],
    eventGroups: [],
    areas: [],
    extraJson: "{}",
  };
}

export function createBlankTutorialGroup(existingIds: string[] = []): TutorialTriggerGroupDraft {
  return createTriggerGroupDraft(createUniqueId("tutorial_group", existingIds), []);
}

export function cloneTutorialGroup(draft: TutorialTriggerGroupDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("tutorial-trigger-group"),
    id: createUniqueId(`${draft.id || "tutorial_group"}_copy`, existingIds),
  };
}

export function createBlankTutorialArea(existingIds: string[] = []): TutorialAreaTriggerDraft {
  return createAreaDraft({
    id: createUniqueId("tutorial_area", existingIds),
    position: [0, 0],
    radius: 1000,
    info_ids: [],
    once: true,
  });
}

export function cloneTutorialArea(draft: TutorialAreaTriggerDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("tutorial-area"),
    id: createUniqueId(`${draft.id || "tutorial_area"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importTutorialTriggersWorkspace(text: string | null, sourceLabel: string | null): TutorialTriggersWorkspace {
  if (!text) return createBlankTutorialTriggersWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("info_triggers.json must contain a top-level object.");
  }

  const groups: TutorialTriggerGroupDraft[] = [];
  const eventGroups: TutorialTriggerGroupDraft[] = [];
  const areas: TutorialAreaTriggerDraft[] = [];

  for (const [key, value] of Object.entries(root)) {
    if (key === "version" || key === "events" || key === "areas") continue;
    groups.push(createTriggerGroupDraft(key, value));
  }

  const events = root.events && typeof root.events === "object" && !Array.isArray(root.events) ? (root.events as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(events)) {
    eventGroups.push(createTriggerGroupDraft(key, value));
  }

  const areaEntries = Array.isArray(root.areas) ? root.areas : [];
  for (const area of areaEntries) {
    if (!area || typeof area !== "object" || Array.isArray(area)) continue;
    areas.push(createAreaDraft(area as Record<string, unknown>));
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    version: String(root.version ?? "1"),
    groups,
    eventGroups,
    areas,
    extraJson: stringifyJson(objectWithoutKeys(root, ["version", "events", "areas", ...groups.map((group) => group.id)])),
  };
}

export function stringifyTutorialTriggersFile(workspace: TutorialTriggersWorkspace) {
  const root: Record<string, unknown> = {
    version: Number(workspace.version || 1),
  };

  for (const group of workspace.groups) {
    root[group.id.trim()] = group.infoIds.map((infoId) => infoId.trim()).filter(Boolean);
  }

  root.events = Object.fromEntries(
    workspace.eventGroups.map((group) => [group.id.trim(), group.infoIds.map((infoId) => infoId.trim()).filter(Boolean)]),
  );
  root.areas = workspace.areas.map(exportAreaDraft);

  Object.assign(root, parseExtraJsonObject(workspace.extraJson, "Extra JSON for info_triggers.json"));

  return JSON.stringify(root, null, 2);
}
