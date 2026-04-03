import { createDraftKey, createUniqueId, objectWithoutKeys, parseExtraJsonObject, stringifyJson, copySnippetWithKey } from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type { MapPoiDraft, MapRegionDraft, MapWorkspace } from "@lib/data-tools/types";

function createPoiDraftFromRecord(record?: Record<string, unknown>): MapPoiDraft {
  const sector = record?.sector && typeof record.sector === "object" ? (record.sector as Record<string, unknown>) : {};
  const pos = record?.pos && typeof record.pos === "object" ? (record.pos as Record<string, unknown>) : {};
  return {
    key: createDraftKey("poi"),
    id: String(record?.id ?? ""),
    name: String(record?.name ?? ""),
    type: String(record?.type ?? ""),
    map: Boolean(record?.map),
    sectorX: String(sector.x ?? ""),
    sectorY: String(sector.y ?? ""),
    posX: String(pos.x ?? ""),
    posY: String(pos.y ?? ""),
    extraJson: stringifyJson(objectWithoutKeys(record ?? {}, ["id", "name", "type", "map", "sector", "pos"])),
  };
}

function createRegionDraftFromRecord(record?: Record<string, unknown>): MapRegionDraft {
  const rect = record?.rect && typeof record.rect === "object" ? (record.rect as Record<string, unknown>) : {};
  return {
    key: createDraftKey("region"),
    id: String(record?.id ?? ""),
    name: String(record?.name ?? ""),
    rectX: String(rect.x ?? ""),
    rectY: String(rect.y ?? ""),
    rectW: String(rect.w ?? ""),
    rectH: String(rect.h ?? ""),
    discovered: Boolean(record?.discovered),
    extraJson: stringifyJson(objectWithoutKeys(record ?? {}, ["id", "name", "rect", "discovered"])),
  };
}

function exportPoiDraft(draft: MapPoiDraft) {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    type: draft.type.trim(),
    map: draft.map,
    sector: {
      x: Number(draft.sectorX || 0),
      y: Number(draft.sectorY || 0),
    },
    pos: {
      x: Number(draft.posX || 0),
      y: Number(draft.posY || 0),
    },
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for POI "${draft.id || draft.name || "untitled"}"`),
  };
}

function exportRegionDraft(draft: MapRegionDraft) {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    rect: {
      x: Number(draft.rectX || 0),
      y: Number(draft.rectY || 0),
      w: Number(draft.rectW || 0),
      h: Number(draft.rectH || 0),
    },
    discovered: draft.discovered,
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for region "${draft.id || draft.name || "untitled"}"`),
  };
}

export function createBlankPoi(existingIds: string[] = []): MapPoiDraft {
  return createPoiDraftFromRecord({
    id: createUniqueId("new_poi", existingIds),
    name: "New POI",
    type: "ship",
    map: true,
    sector: { x: 0, y: 0 },
    pos: { x: 0, y: 0 },
  });
}

export function clonePoi(draft: MapPoiDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("poi"),
    id: createUniqueId(`${draft.id || "poi"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function createBlankRegion(existingIds: string[] = []): MapRegionDraft {
  return createRegionDraftFromRecord({
    id: createUniqueId("new_region", existingIds),
    name: "New Region",
    rect: { x: 0, y: 0, w: 5000, h: 5000 },
    discovered: false,
  });
}

export function cloneRegion(draft: MapRegionDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("region"),
    id: createUniqueId(`${draft.id || "region"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function createBlankMapWorkspace(): MapWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    pois: [createBlankPoi()],
    regions: [createBlankRegion()],
  };
}

export function importMapWorkspace(poiText: string | null, regionsText: string | null, sourceLabel: string | null): MapWorkspace {
  const warnings: string[] = [];
  const pois: MapPoiDraft[] = [];
  const regions: MapRegionDraft[] = [];

  if (poiText) {
    const parsed = parseTolerantJsonText(poiText);
    warnings.push(...parsed.warnings.map((warning) => `poi.json: ${warning}`));
    if (parsed.errors.length) throw new Error(parsed.errors.map((error) => `poi.json: ${error}`).join(" "));
    const root = parsed.value as Record<string, unknown>;
    if (!root || typeof root !== "object" || !Array.isArray(root.pois)) {
      throw new Error("poi.json must contain a top-level { pois: [] } object.");
    }
    for (const record of root.pois) {
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      pois.push(createPoiDraftFromRecord(record as Record<string, unknown>));
    }
  }

  if (regionsText) {
    const parsed = parseTolerantJsonText(regionsText);
    warnings.push(...parsed.warnings.map((warning) => `regions.json: ${warning}`));
    if (parsed.errors.length) throw new Error(parsed.errors.map((error) => `regions.json: ${error}`).join(" "));
    const root = parsed.value as Record<string, unknown>;
    if (!root || typeof root !== "object" || !Array.isArray(root.regions)) {
      throw new Error("regions.json must contain a top-level { regions: [] } object.");
    }
    for (const record of root.regions) {
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      regions.push(createRegionDraftFromRecord(record as Record<string, unknown>));
    }
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: warnings,
    pois: pois.length ? pois : [createBlankPoi()],
    regions: regions.length ? regions : [createBlankRegion()],
  };
}

export function stringifyPoiFile(workspace: MapWorkspace) {
  return JSON.stringify({ pois: workspace.pois.map(exportPoiDraft) }, null, 2);
}

export function stringifyRegionsFile(workspace: MapWorkspace) {
  return JSON.stringify({ regions: workspace.regions.map(exportRegionDraft) }, null, 2);
}

export function stringifySinglePoi(draft: MapPoiDraft) {
  return JSON.stringify(exportPoiDraft(draft), null, 2);
}

export function stringifySingleRegion(draft: MapRegionDraft) {
  return JSON.stringify(exportRegionDraft(draft), null, 2);
}

export function copySinglePoiWithRoot(draft: MapPoiDraft) {
  return copySnippetWithKey("poi", exportPoiDraft(draft));
}

export function copySingleRegionWithRoot(draft: MapRegionDraft) {
  return copySnippetWithKey("region", exportRegionDraft(draft));
}
