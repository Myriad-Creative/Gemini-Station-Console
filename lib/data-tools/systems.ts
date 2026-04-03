import {
  copySnippetWithKey,
  createDraftKey,
  createUniqueId,
  objectWithoutKeys,
  parseExtraJsonObject,
  stringifyJson,
} from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type {
  HazardBarrierProfileDraft,
  HazardBarrierProfilesWorkspace,
  ShipStatDescriptionDraft,
  ShipStatDescriptionsWorkspace,
  StageDraft,
  StagesWorkspace,
  ZoneDraft,
  ZonesWorkspace,
} from "@lib/data-tools/types";

function createShipStatDraft(id: string, record?: Record<string, unknown>): ShipStatDescriptionDraft {
  return {
    key: createDraftKey("ship-stat"),
    id,
    label: String(record?.label ?? ""),
    title: String(record?.title ?? ""),
    decimals: String(record?.decimals ?? ""),
    description: String(record?.description ?? ""),
    extraJson: stringifyJson(objectWithoutKeys(record ?? {}, ["label", "title", "decimals", "description"])),
  };
}

function exportShipStatDraft(draft: ShipStatDescriptionDraft) {
  return {
    label: draft.label.trim(),
    title: draft.title.trim(),
    decimals: Number(draft.decimals || 0),
    description: draft.description,
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for ship stat "${draft.id || "untitled"}"`),
  };
}

export function createBlankShipStatsWorkspace(): ShipStatDescriptionsWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    stats: [createBlankShipStat()],
  };
}

export function createBlankShipStat(existingIds: string[] = []): ShipStatDescriptionDraft {
  const id = createUniqueId("new_stat", existingIds);
  return createShipStatDraft(id, {
    label: "New Stat",
    title: "New Stat",
    decimals: 0,
    description: "",
  });
}

export function cloneShipStat(draft: ShipStatDescriptionDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("ship-stat"),
    id: createUniqueId(`${draft.id || "ship_stat"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importShipStatsWorkspace(text: string | null, sourceLabel: string | null): ShipStatDescriptionsWorkspace {
  if (!text) return createBlankShipStatsWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("ShipStatDescriptions.json must contain a top-level object.");
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    stats: Object.entries(root)
      .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => createShipStatDraft(id, value as Record<string, unknown>)),
  };
}

export function stringifyShipStatsFile(workspace: ShipStatDescriptionsWorkspace) {
  const root = Object.fromEntries(workspace.stats.map((draft) => [draft.id.trim(), exportShipStatDraft(draft)]));
  return JSON.stringify(root, null, 2);
}

export function copySingleShipStat(draft: ShipStatDescriptionDraft) {
  return copySnippetWithKey(draft.id.trim(), exportShipStatDraft(draft));
}

function createZoneDraft(id: string, record?: Record<string, unknown>): ZoneDraft {
  const sector = Array.isArray(record?.sector_id) ? record.sector_id : [];
  const pos = Array.isArray(record?.pos) ? record.pos : [];
  return {
    key: createDraftKey("zone"),
    id,
    name: String(record?.name ?? ""),
    active: Boolean(record?.active),
    showHudOnEnter: Boolean(record?.show_hud_on_enter),
    sectorX: String(sector[0] ?? ""),
    sectorY: String(sector[1] ?? ""),
    activationRadius: String(record?.activation_radius ?? ""),
    activationRadiusBorder: Boolean(record?.activation_radius_border),
    posX: String(pos[0] ?? ""),
    posY: String(pos[1] ?? ""),
    boundsJson: stringifyJson(record?.bounds ?? {}),
    stagesJson: stringifyJson(record?.stages ?? []),
    mobsJson: stringifyJson(record?.mobs ?? []),
    extraJson: stringifyJson(
      objectWithoutKeys(record ?? {}, [
        "name",
        "active",
        "show_hud_on_enter",
        "sector_id",
        "activation_radius",
        "activation_radius_border",
        "pos",
        "bounds",
        "stages",
        "mobs",
      ]),
    ),
  };
}

function exportZoneDraft(draft: ZoneDraft) {
  return {
    name: draft.name.trim(),
    active: draft.active,
    show_hud_on_enter: draft.showHudOnEnter,
    sector_id: [Number(draft.sectorX || 0), Number(draft.sectorY || 0)],
    activation_radius: Number(draft.activationRadius || 0),
    activation_radius_border: draft.activationRadiusBorder,
    pos: [Number(draft.posX || 0), Number(draft.posY || 0)],
    bounds: JSON.parse(draft.boundsJson || "{}") as Record<string, unknown>,
    stages: JSON.parse(draft.stagesJson || "[]") as unknown[],
    mobs: JSON.parse(draft.mobsJson || "[]") as unknown[],
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for zone "${draft.id || "untitled"}"`),
  };
}

export function createBlankZonesWorkspace(): ZonesWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    zones: [createBlankZone()],
  };
}

export function createBlankZone(existingIds: string[] = []): ZoneDraft {
  const id = createUniqueId("new_zone", existingIds);
  return createZoneDraft(id, {
    name: "New Zone",
    active: true,
    show_hud_on_enter: false,
    sector_id: [0, 0],
    activation_radius: 10000,
    activation_radius_border: false,
    pos: [0, 0],
    bounds: { shape: "ellipse", width: 5000, height: 5000 },
    stages: [],
    mobs: [],
  });
}

export function cloneZone(draft: ZoneDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("zone"),
    id: createUniqueId(`${draft.id || "zone"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importZonesWorkspace(text: string | null, sourceLabel: string | null): ZonesWorkspace {
  if (!text) return createBlankZonesWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("Zones.json must contain a top-level object.");
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    zones: Object.entries(root)
      .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => createZoneDraft(id, value as Record<string, unknown>)),
  };
}

export function stringifyZonesFile(workspace: ZonesWorkspace) {
  const root = Object.fromEntries(workspace.zones.map((draft) => [draft.id.trim(), exportZoneDraft(draft)]));
  return JSON.stringify(root, null, 2);
}

export function copySingleZone(draft: ZoneDraft) {
  return copySnippetWithKey(draft.id.trim(), exportZoneDraft(draft));
}

function createStageDraft(id: string, record?: Record<string, unknown>): StageDraft {
  return {
    key: createDraftKey("stage"),
    id,
    shape: String(record?.shape ?? ""),
    width: String(record?.width ?? ""),
    height: String(record?.height ?? ""),
    edgeFalloff: String(record?.edge_falloff ?? ""),
    collision: Boolean(record?.collision),
    zindex: String(record?.zindex ?? ""),
    scaleMin: String(record?.scale_min ?? ""),
    scaleMax: String(record?.scale_max ?? ""),
    gridStep: String(record?.grid_step ?? ""),
    jitter: String(record?.jitter ?? ""),
    materialsJson: stringifyJson(record?.materials ?? []),
    extraJson: stringifyJson(
      objectWithoutKeys(record ?? {}, [
        "shape",
        "width",
        "height",
        "edge_falloff",
        "collision",
        "zindex",
        "scale_min",
        "scale_max",
        "grid_step",
        "jitter",
        "materials",
      ]),
    ),
  };
}

function exportStageDraft(draft: StageDraft) {
  return {
    shape: draft.shape.trim(),
    width: Number(draft.width || 0),
    height: Number(draft.height || 0),
    edge_falloff: Number(draft.edgeFalloff || 0),
    collision: draft.collision,
    zindex: Number(draft.zindex || 0),
    materials: JSON.parse(draft.materialsJson || "[]") as unknown[],
    scale_min: Number(draft.scaleMin || 0),
    scale_max: Number(draft.scaleMax || 0),
    grid_step: Number(draft.gridStep || 0),
    jitter: Number(draft.jitter || 0),
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for stage "${draft.id || "untitled"}"`),
  };
}

export function createBlankStagesWorkspace(): StagesWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    stages: [createBlankStage()],
  };
}

export function createBlankStage(existingIds: string[] = []): StageDraft {
  const id = createUniqueId("new_stage", existingIds);
  return createStageDraft(id, {
    shape: "ellipse",
    width: 1000,
    height: 1000,
    edge_falloff: 100,
    collision: false,
    zindex: 0,
    materials: [],
    scale_min: 1,
    scale_max: 1,
    grid_step: 100,
    jitter: 0,
  });
}

export function cloneStage(draft: StageDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("stage"),
    id: createUniqueId(`${draft.id || "stage"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importStagesWorkspace(text: string | null, sourceLabel: string | null): StagesWorkspace {
  if (!text) return createBlankStagesWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("Stages.json must contain a top-level object.");
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    stages: Object.entries(root)
      .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => createStageDraft(id, value as Record<string, unknown>)),
  };
}

export function stringifyStagesFile(workspace: StagesWorkspace) {
  const root = Object.fromEntries(workspace.stages.map((draft) => [draft.id.trim(), exportStageDraft(draft)]));
  return JSON.stringify(root, null, 2);
}

export function copySingleStage(draft: StageDraft) {
  return copySnippetWithKey(draft.id.trim(), exportStageDraft(draft));
}

function createHazardBarrierDraft(id: string, record?: Record<string, unknown>): HazardBarrierProfileDraft {
  return {
    key: createDraftKey("hazard-profile"),
    id,
    baseStageProfile: String(record?.base_stage_profile ?? ""),
    statusEffectId: String(record?.status_effect_id ?? ""),
    blockerWidthRatio: String(record?.blocker_width_ratio ?? ""),
    visualWidthMultiplier: String(record?.visual_width_multiplier ?? ""),
    visualDensityMultiplier: String(record?.visual_density_multiplier ?? ""),
    visualScaleMultiplier: String(record?.visual_scale_multiplier ?? ""),
    visualAlphaMultiplier: String(record?.visual_alpha_multiplier ?? ""),
    zindex: String(record?.zindex ?? ""),
    extraJson: stringifyJson(
      objectWithoutKeys(record ?? {}, [
        "base_stage_profile",
        "status_effect_id",
        "blocker_width_ratio",
        "visual_width_multiplier",
        "visual_density_multiplier",
        "visual_scale_multiplier",
        "visual_alpha_multiplier",
        "zindex",
      ]),
    ),
  };
}

function exportHazardBarrierDraft(draft: HazardBarrierProfileDraft) {
  return {
    base_stage_profile: draft.baseStageProfile.trim(),
    status_effect_id: Number(draft.statusEffectId || 0),
    blocker_width_ratio: Number(draft.blockerWidthRatio || 0),
    visual_width_multiplier: Number(draft.visualWidthMultiplier || 0),
    visual_density_multiplier: Number(draft.visualDensityMultiplier || 0),
    visual_scale_multiplier: Number(draft.visualScaleMultiplier || 0),
    visual_alpha_multiplier: Number(draft.visualAlphaMultiplier || 0),
    zindex: Number(draft.zindex || 0),
    ...parseExtraJsonObject(draft.extraJson, `Extra JSON for hazard barrier profile "${draft.id || "untitled"}"`),
  };
}

export function createBlankHazardBarrierProfilesWorkspace(): HazardBarrierProfilesWorkspace {
  return {
    sourceType: "blank",
    sourceLabel: null,
    parseWarnings: [],
    profiles: [createBlankHazardBarrierProfile()],
  };
}

export function createBlankHazardBarrierProfile(existingIds: string[] = []): HazardBarrierProfileDraft {
  const id = createUniqueId("hazard_profile", existingIds);
  return createHazardBarrierDraft(id, {
    base_stage_profile: "",
    status_effect_id: 0,
    blocker_width_ratio: 1,
    visual_width_multiplier: 1,
    visual_density_multiplier: 1,
    visual_scale_multiplier: 1,
    visual_alpha_multiplier: 1,
    zindex: 0,
  });
}

export function cloneHazardBarrierProfile(draft: HazardBarrierProfileDraft, existingIds: string[] = []) {
  return {
    ...draft,
    key: createDraftKey("hazard-profile"),
    id: createUniqueId(`${draft.id || "hazard_profile"}_copy`, existingIds),
    extraJson: draft.extraJson || "{}",
  };
}

export function importHazardBarrierProfilesWorkspace(
  text: string | null,
  sourceLabel: string | null,
): HazardBarrierProfilesWorkspace {
  if (!text) return createBlankHazardBarrierProfilesWorkspace();
  const parsed = parseTolerantJsonText(text);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const root = parsed.value as Record<string, unknown>;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("HazardBarrierProfiles.json must contain a top-level object.");
  }

  return {
    sourceType: "shared",
    sourceLabel,
    parseWarnings: parsed.warnings,
    profiles: Object.entries(root)
      .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
      .map(([id, value]) => createHazardBarrierDraft(id, value as Record<string, unknown>)),
  };
}

export function stringifyHazardBarrierProfilesFile(workspace: HazardBarrierProfilesWorkspace) {
  const root = Object.fromEntries(workspace.profiles.map((draft) => [draft.id.trim(), exportHazardBarrierDraft(draft)]));
  return JSON.stringify(root, null, 2);
}

export function copySingleHazardBarrierProfile(draft: HazardBarrierProfileDraft) {
  return copySnippetWithKey(draft.id.trim(), exportHazardBarrierDraft(draft));
}
