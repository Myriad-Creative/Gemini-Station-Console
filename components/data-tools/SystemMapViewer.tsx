"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { buildIconSrc } from "@lib/icon-src";
import { createDraftKey, createUniqueId } from "@lib/data-tools/common";
import { parseTolerantJsonText } from "@lib/data-tools/parse";
import type {
  SystemMapMobCatalogEntry,
  SystemMapMobSpawn,
  SystemMapPayload,
  SystemMapPoi,
  SystemMapRect,
  SystemMapRoute,
  SystemMapSceneBarrier,
  SystemMapSceneMobSpawn,
  SystemMapStagePlacement,
  SystemMapVec,
  SystemMapZone,
} from "@lib/system-map/types";
import type { ZoneDraft, ZoneMobSpawnDraft, ZonesManagerWorkspace } from "@lib/zones-manager/types";
import { createBlankZone, createBlankZoneMobSpawn, importZonesManagerWorkspace } from "@lib/zones-manager/utils";

type ToggleKey = "regions" | "environment" | "routes" | "zones" | "pois" | "stages" | "mobs" | "barriers" | "labels";
type Viewport = {
  width: number;
  height: number;
};
type Camera = {
  center: SystemMapVec;
  zoom: number;
};
type HoverInfo = {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  lines: string[];
  icon?: string;
};
type MapStatus = {
  tone: "success" | "error" | "neutral";
  message: string;
};
type ContextMenuState = {
  x: number;
  y: number;
  world: SystemMapVec;
  zoneId: string | null;
  routeId: string | null;
};
type RouteDraftForm = {
  mode: "create" | "edit";
  originalId: string;
  name: string;
  id: string;
  sectorX: string;
  sectorY: string;
  endpointAName: string;
  endpointBName: string;
  width: string;
  speedMultiplier: string;
  color: string;
  borderColor: string;
  opacity: string;
  borderPx: string;
  smoothingTension: string;
};
type ZoneDraftForm = {
  mode: "create" | "edit";
  originalId: string | null;
  name: string;
  id: string;
  worldX: string;
  worldY: string;
  activationRadius: string;
  boundsShape: "ellipse" | "rectangle";
  boundsWidth: string;
  boundsHeight: string;
  active: boolean;
  showHudOnEnter: boolean;
  poiMap: boolean;
  poiHidden: boolean;
  poiLabel: string;
  activationRadiusBorder: boolean;
};
type ZoneDragState = {
  zoneId: string;
  startScreen: SystemMapVec;
  startWorld: SystemMapVec;
  zoneStartWorld: SystemMapVec;
  moved: boolean;
};
type MobSpawnForm = {
  mode: "create" | "edit";
  zoneId: string;
  mobKey: string | null;
  mobId: string;
  localX: string;
  localY: string;
  count: string;
  radius: string;
  respawnDelay: string;
  angleDeg: string;
  levelMin: string;
  levelMax: string;
  rank: string;
};
type MobDragState = {
  zoneId: string;
  mobKey: string;
  startScreen: SystemMapVec;
  startWorld: SystemMapVec;
  mobStartWorld: SystemMapVec;
  moved: boolean;
};
type RouteDragState = {
  routeId: string;
  pointIndex: number;
  startScreen: SystemMapVec;
  startWorld: SystemMapVec;
  pointStartWorld: SystemMapVec;
  moved: boolean;
};

const DEFAULT_TOGGLES: Record<ToggleKey, boolean> = {
  regions: true,
  environment: true,
  routes: true,
  zones: true,
  pois: true,
  stages: true,
  mobs: true,
  barriers: true,
  labels: true,
};

const MIN_ZOOM = 0.00018;
const MAX_ZOOM = 0.12;
const DEFAULT_SECTOR_SIZE = 250000;
const DEFAULT_SECTOR_HALF_EXTENT = 125000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: SystemMapVec, b: SystemMapVec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatVec(value: SystemMapVec) {
  return `${formatNumber(value.x)}, ${formatNumber(value.y)}`;
}

function sanitizeZoneId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "new_zone"
  );
}

function sanitizeRouteId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "new_trade_route"
  );
}

function numberInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function normalizeBoundsShape(value: string): ZoneDraftForm["boundsShape"] {
  const normalized = value.trim().toLowerCase();
  return normalized === "rect" || normalized === "rectangle" ? "rectangle" : "ellipse";
}

function worldToSectorLocal(world: SystemMapVec, sectorSize = DEFAULT_SECTOR_SIZE, sectorHalfExtent = DEFAULT_SECTOR_HALF_EXTENT): { sector: SystemMapVec; local: SystemMapVec } {
  const sector = {
    x: Math.floor((world.x + sectorHalfExtent) / sectorSize),
    y: Math.floor((world.y + sectorHalfExtent) / sectorSize),
  };
  return {
    sector,
    local: {
      x: world.x - sector.x * sectorSize,
      y: world.y - sector.y * sectorSize,
    },
  };
}

function translateVec(value: SystemMapVec, delta: SystemMapVec): SystemMapVec {
  return {
    x: value.x + delta.x,
    y: value.y + delta.y,
  };
}

function zoneIdentity(zone: SystemMapZone) {
  return zone.originalId ?? zone.id;
}

function mobIdentity(mob: SystemMapMobSpawn) {
  return mob.key || `zone-mob-${mob.originalIndex ?? "new"}`;
}

function routeIdentity(route: SystemMapRoute) {
  return route.originalId ?? route.id;
}

function rectCenter(rect: SystemMapRect): SystemMapVec {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  };
}

function pointInRect(point: SystemMapVec, rect: SystemMapRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function pointInZoneBounds(point: SystemMapVec, zone: SystemMapZone) {
  const halfWidth = Math.max(1, zone.bounds.width / 2);
  const halfHeight = Math.max(1, zone.bounds.height / 2);
  const dx = point.x - zone.world.x;
  const dy = point.y - zone.world.y;
  if (zone.bounds.shape.toLowerCase() === "rect" || zone.bounds.shape.toLowerCase() === "rectangle") {
    return Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight;
  }
  return (dx * dx) / (halfWidth * halfWidth) + (dy * dy) / (halfHeight * halfHeight) <= 1;
}

function expandBounds(bounds: SystemMapRect | null, point: SystemMapVec): SystemMapRect {
  if (!bounds) {
    return { x: point.x, y: point.y, w: 0, h: 0 };
  }
  const minX = Math.min(bounds.x, point.x);
  const minY = Math.min(bounds.y, point.y);
  const maxX = Math.max(bounds.x + bounds.w, point.x);
  const maxY = Math.max(bounds.y + bounds.h, point.y);
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function mergeRect(bounds: SystemMapRect | null, rect: SystemMapRect): SystemMapRect {
  const a = expandBounds(bounds, { x: rect.x, y: rect.y });
  return expandBounds(a, { x: rect.x + rect.w, y: rect.y + rect.h });
}

function computeWorldBounds(payload: SystemMapPayload, zones: SystemMapZone[] = payload.zones, routes: SystemMapRoute[] = payload.routes): SystemMapRect {
  let bounds: SystemMapRect | null = null;
  for (const sector of payload.sectors) {
    bounds = mergeRect(bounds, sector.rect);
  }
  for (const zone of zones) {
    const radius = Math.max(zone.bounds.width / 2, zone.bounds.height / 2, 5000);
    bounds = mergeRect(bounds, { x: zone.world.x - radius, y: zone.world.y - radius, w: radius * 2, h: radius * 2 });
    for (const mob of zone.mobs) {
      for (const barrier of mob.sceneBarriers) {
        for (const point of barrier.worldPoints) {
          bounds = expandBounds(bounds, point);
        }
      }
    }
  }
  for (const poi of payload.pois) {
    bounds = expandBounds(bounds, poi.world);
  }
  for (const route of routes) {
    for (const point of route.points) {
      bounds = expandBounds(bounds, point);
    }
  }
  bounds = mergeRect(bounds, {
    x: -payload.config.asteroidBeltOuterRadius,
    y: -payload.config.asteroidBeltOuterRadius,
    w: payload.config.asteroidBeltOuterRadius * 2,
    h: payload.config.asteroidBeltOuterRadius * 2,
  });
  return bounds ?? { x: -1000, y: -1000, w: 2000, h: 2000 };
}

function pointToSegmentDistance(point: SystemMapVec, start: SystemMapVec, end: SystemMapVec) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return distance(point, {
    x: start.x + dx * t,
    y: start.y + dy * t,
  });
}

function routePathD(points: SystemMapVec[], smoothingTension: number) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const tangentScale = (1 - clamp(smoothingTension, 0, 1)) * 0.5;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const currentTangent = index === 0 ? { x: (next.x - current.x) * tangentScale, y: (next.y - current.y) * tangentScale } : { x: (next.x - previous.x) * tangentScale, y: (next.y - previous.y) * tangentScale };
    const nextTangent =
      index + 1 === points.length - 1 ? { x: (next.x - current.x) * tangentScale, y: (next.y - current.y) * tangentScale } : { x: (afterNext.x - current.x) * tangentScale, y: (afterNext.y - current.y) * tangentScale };
    const controlA = {
      x: current.x + currentTangent.x / 3,
      y: current.y + currentTangent.y / 3,
    };
    const controlB = {
      x: next.x - nextTangent.x / 3,
      y: next.y - nextTangent.y / 3,
    };
    path += ` C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function cameraForBounds(bounds: SystemMapRect, viewport: Viewport): Camera {
  const zoom = clamp(Math.min(viewport.width / Math.max(bounds.w, 1), viewport.height / Math.max(bounds.h, 1)) * 0.88, MIN_ZOOM, MAX_ZOOM);
  return {
    center: rectCenter(bounds),
    zoom,
  };
}

function safeIconSrc(icon: string, id: string, name: string) {
  return icon ? buildIconSrc(icon, id, name) : undefined;
}

function zoneFromDraftForm(form: ZoneDraftForm, payload: SystemMapPayload, id: string): SystemMapZone {
  const world = {
    x: Number(form.worldX),
    y: Number(form.worldY),
  };
  const { sector, local } = worldToSectorLocal(world, payload.config.sectorSize, payload.config.sectorHalfExtent);
  return {
    id,
    name: form.name.trim() || id,
    draft: true,
    active: form.active,
    showHudOnEnter: form.showHudOnEnter,
    poiMap: form.poiMap,
    poiHidden: form.poiHidden,
    poiLabel: form.poiLabel.trim(),
    sector,
    local,
    world,
    activationRadius: Number(form.activationRadius),
    activationRadiusBorder: form.activationRadiusBorder,
    bounds: {
      shape: form.boundsShape,
      width: Number(form.boundsWidth),
      height: Number(form.boundsHeight),
    },
    stages: [],
    mobs: [],
  };
}

function applyZoneFormToZone(form: ZoneDraftForm, baseZone: SystemMapZone, payload: SystemMapPayload, id: string): SystemMapZone {
  const world = {
    x: Number(form.worldX),
    y: Number(form.worldY),
  };
  const movedZone = moveZoneToWorld(baseZone, world, payload);
  return {
    ...movedZone,
    id,
    name: form.name.trim() || id,
    draft: baseZone.draft,
    modified: baseZone.draft ? baseZone.modified : true,
    originalId: baseZone.draft ? baseZone.originalId : baseZone.originalId ?? baseZone.id,
    active: form.active,
    showHudOnEnter: form.showHudOnEnter,
    poiMap: form.poiMap,
    poiHidden: form.poiHidden,
    poiLabel: form.poiLabel.trim(),
    activationRadius: Number(form.activationRadius),
    activationRadiusBorder: form.activationRadiusBorder,
    bounds: {
      shape: form.boundsShape,
      width: Number(form.boundsWidth),
      height: Number(form.boundsHeight),
    },
  };
}

function zoneToManagerDraft(zone: SystemMapZone, existingIds: string[]): ZoneDraft {
  const draft = createBlankZone(existingIds);
  return {
    ...draft,
    id: createUniqueId(zone.id, existingIds),
    name: zone.name,
    active: zone.active,
    showHudOnEnter: zone.showHudOnEnter,
    poiMap: zone.poiMap,
    poiHidden: zone.poiHidden,
    poiLabel: zone.poiLabel,
    sectorX: numberInputValue(zone.sector.x),
    sectorY: numberInputValue(zone.sector.y),
    posX: numberInputValue(zone.local.x),
    posY: numberInputValue(zone.local.y),
    activationRadius: numberInputValue(zone.activationRadius),
    activationRadiusBorder: zone.activationRadiusBorder,
    boundsShape: zone.bounds.shape,
    boundsWidth: numberInputValue(zone.bounds.width),
    boundsHeight: numberInputValue(zone.bounds.height),
    stages: [],
    mobs: zone.mobs.map((mob) => systemMapMobToManagerDraft(mob)),
  };
}

function applyZoneDetailsToManagerDraft(draft: ZoneDraft, zone: SystemMapZone): ZoneDraft {
  return {
    ...draft,
    id: zone.id,
    name: zone.name,
    active: zone.active,
    showHudOnEnter: zone.showHudOnEnter,
    poiMap: zone.poiMap,
    poiHidden: zone.poiHidden,
    poiLabel: zone.poiLabel,
    sectorX: numberInputValue(zone.sector.x),
    sectorY: numberInputValue(zone.sector.y),
    posX: numberInputValue(zone.local.x),
    posY: numberInputValue(zone.local.y),
    activationRadius: numberInputValue(zone.activationRadius),
    activationRadiusBorder: zone.activationRadiusBorder,
    boundsShape: zone.bounds.shape,
    boundsWidth: numberInputValue(zone.bounds.width),
    boundsHeight: numberInputValue(zone.bounds.height),
    mobs: zone.mobs.map((mob, index) => systemMapMobToManagerDraft(mob, draft.mobs[mob.originalIndex ?? index])),
  };
}

function systemMapMobToManagerDraft(mob: SystemMapMobSpawn, existingDraft?: ZoneMobSpawnDraft): ZoneMobSpawnDraft {
  const draft = existingDraft ?? createBlankZoneMobSpawn();
  return {
    ...draft,
    mobId: mob.mobId,
    count: numberInputValue(mob.count),
    radius: numberInputValue(mob.radius),
    respawnDelay: numberInputValue(mob.respawnDelay),
    posX: numberInputValue(mob.local.x),
    posY: numberInputValue(mob.local.y),
    angleDeg: numberInputValue(mob.angleDeg),
    levelMin: mob.levelMin === null ? "" : numberInputValue(mob.levelMin),
    levelMax: mob.levelMax === null ? "" : numberInputValue(mob.levelMax),
    rank: mob.rank,
  };
}

function mobCatalogEntryForId(catalog: SystemMapMobCatalogEntry[], mobId: string) {
  return catalog.find((entry) => entry.id === mobId) ?? null;
}

function createMobSpawnFromForm(form: MobSpawnForm, zone: SystemMapZone, catalog: SystemMapMobCatalogEntry[]): SystemMapMobSpawn {
  const entry = mobCatalogEntryForId(catalog, form.mobId);
  const local = {
    x: Number(form.localX),
    y: Number(form.localY),
  };
  return {
    key: form.mobKey ?? createDraftKey("map-zone-mob"),
    originalIndex: null,
    draft: form.mode === "create",
    modified: form.mode === "edit",
    mobId: form.mobId,
    displayName: entry?.displayName || form.mobId,
    local,
    world: translateVec(zone.world, local),
    count: Number(form.count),
    radius: Number(form.radius),
    respawnDelay: Number(form.respawnDelay),
    angleDeg: Number(form.angleDeg),
    levelMin: form.levelMin.trim() ? Number(form.levelMin) : null,
    levelMax: form.levelMax.trim() ? Number(form.levelMax) : null,
    rank: form.rank.trim() || "normal",
    faction: entry?.faction || "",
    sprite: entry?.sprite || "",
    scene: entry?.scene || "",
    missing: !entry,
    sceneSpawns: [],
    sceneBarriers: [],
  };
}

function createRouteDraftFromPoint(world: SystemMapVec, payload: SystemMapPayload, existingIds: string[]): SystemMapRoute {
  const roundedWorld = {
    x: Math.round(world.x),
    y: Math.round(world.y),
  };
  const id = createUniqueId(sanitizeRouteId("New Trade Route"), existingIds);
  const { sector } = worldToSectorLocal(roundedWorld, payload.config.sectorSize, payload.config.sectorHalfExtent);
  return {
    id,
    name: "New Trade Route",
    draft: true,
    originalId: id,
    sector,
    width: 2500,
    speedMultiplier: 2,
    color: "#9b2b00",
    borderColor: "#B0ECFE",
    opacity: 0.05,
    borderPx: 0,
    smoothingTension: 0.4,
    endpointAName: "Endpoint A",
    endpointBName: "Endpoint B",
    endpointA: roundedWorld,
    endpointB: roundedWorld,
    viaPoints: [],
    points: [roundedWorld],
  };
}

function routeToForm(route: SystemMapRoute, mode: RouteDraftForm["mode"]): RouteDraftForm {
  return {
    mode,
    originalId: routeIdentity(route),
    name: route.name || route.id,
    id: route.id,
    sectorX: numberInputValue(route.sector.x),
    sectorY: numberInputValue(route.sector.y),
    endpointAName: route.endpointAName,
    endpointBName: route.endpointBName,
    width: numberInputValue(route.width),
    speedMultiplier: numberInputValue(route.speedMultiplier),
    color: route.color,
    borderColor: route.borderColor,
    opacity: numberInputValue(route.opacity),
    borderPx: numberInputValue(route.borderPx),
    smoothingTension: numberInputValue(route.smoothingTension),
  };
}

function applyRouteFormToRouteValue(form: RouteDraftForm, route: SystemMapRoute, routes: SystemMapRoute[]): { error: string; route: null; form: null } | { error: ""; route: SystemMapRoute; form: RouteDraftForm } {
  const id = sanitizeRouteId(form.id);
  const sectorX = Number(form.sectorX);
  const sectorY = Number(form.sectorY);
  const width = Number(form.width);
  const speedMultiplier = Number(form.speedMultiplier);
  const opacity = Number(form.opacity);
  const borderPx = Number(form.borderPx);
  const smoothingTension = Number(form.smoothingTension);
  if (!form.name.trim()) {
    return { error: "Route name is required.", route: null, form: null };
  }
  if (!id) {
    return { error: "Route ID is required.", route: null, form: null };
  }
  if ([sectorX, sectorY, width, speedMultiplier, opacity, borderPx, smoothingTension].some((value) => !Number.isFinite(value))) {
    return { error: "Route sector, width, speed, opacity, border, and smoothing fields must be valid numbers.", route: null, form: null };
  }
  if (width <= 0 || speedMultiplier <= 0 || opacity < 0 || opacity > 1 || borderPx < 0 || smoothingTension < 0 || smoothingTension > 1) {
    return { error: "Route width and speed must be positive. Opacity and smoothing must be between 0 and 1.", route: null, form: null };
  }
  const idTaken = routes.some((entry) => routeIdentity(entry) !== form.originalId && entry.id === id);
  if (idTaken) {
    return { error: `Trade route ID "${id}" already exists.`, route: null, form: null };
  }

  return {
    error: "",
    form: {
      ...form,
      id,
      sectorX: numberInputValue(Math.round(sectorX)),
      sectorY: numberInputValue(Math.round(sectorY)),
      width: numberInputValue(width),
      speedMultiplier: numberInputValue(speedMultiplier),
      opacity: numberInputValue(opacity),
      borderPx: numberInputValue(borderPx),
      smoothingTension: numberInputValue(smoothingTension),
    },
    route: {
      ...route,
      id,
      name: form.name.trim(),
      modified: route.draft ? route.modified : true,
      originalId: route.draft ? route.originalId : route.originalId ?? route.id,
      sector: {
        x: Math.round(sectorX),
        y: Math.round(sectorY),
      },
      width,
      speedMultiplier,
      color: form.color.trim() || "#9b2b00",
      borderColor: form.borderColor.trim() || "#B0ECFE",
      opacity,
      borderPx,
      smoothingTension,
      endpointAName: form.endpointAName.trim() || "Endpoint A",
      endpointBName: form.endpointBName.trim() || "Endpoint B",
    },
  };
}

function moveZoneToWorld(zone: SystemMapZone, world: SystemMapVec, payload: SystemMapPayload): SystemMapZone {
  const { sector, local } = worldToSectorLocal(world, payload.config.sectorSize, payload.config.sectorHalfExtent);
  const delta = {
    x: world.x - zone.world.x,
    y: world.y - zone.world.y,
  };
  return {
    ...zone,
    modified: zone.draft ? zone.modified : true,
    originalId: zone.draft ? zone.originalId : zone.originalId ?? zone.id,
    sector,
    local,
    world,
    stages: zone.stages.map((stage) => ({
      ...stage,
      world: translateVec(stage.world, delta),
    })),
    mobs: zone.mobs.map((mob) => ({
      ...mob,
      world: translateVec(mob.world, delta),
      sceneSpawns: mob.sceneSpawns.map((sceneMob) => ({
        ...sceneMob,
        world: translateVec(sceneMob.world, delta),
      })),
      sceneBarriers: mob.sceneBarriers.map((barrier) => ({
        ...barrier,
        worldPoints: barrier.worldPoints.map((point) => translateVec(point, delta)),
      })),
    })),
  };
}

function moveMobSpawnToWorld(mob: SystemMapMobSpawn, world: SystemMapVec, zone: SystemMapZone): SystemMapMobSpawn {
  const delta = {
    x: world.x - mob.world.x,
    y: world.y - mob.world.y,
  };
  return {
    ...mob,
    modified: mob.draft ? mob.modified : true,
    local: {
      x: Math.round(world.x - zone.world.x),
      y: Math.round(world.y - zone.world.y),
    },
    world: {
      x: Math.round(world.x),
      y: Math.round(world.y),
    },
    sceneSpawns: mob.sceneSpawns.map((sceneMob) => ({
      ...sceneMob,
      world: translateVec(sceneMob.world, delta),
    })),
    sceneBarriers: mob.sceneBarriers.map((barrier) => ({
      ...barrier,
      worldPoints: barrier.worldPoints.map((point) => translateVec(point, delta)),
    })),
  };
}

function withRoutePoint(route: SystemMapRoute, pointIndex: number, world: SystemMapVec): SystemMapRoute {
  const roundedWorld = {
    x: Math.round(world.x),
    y: Math.round(world.y),
  };
  const nextPoints = route.points.map((point, index) => (index === pointIndex ? roundedWorld : point));
  const fallbackPoint = nextPoints[0] ?? roundedWorld;
  return {
    ...route,
    modified: route.draft ? route.modified : true,
    originalId: route.draft ? route.originalId : route.originalId ?? route.id,
    endpointA: nextPoints[0] ?? fallbackPoint,
    endpointB: nextPoints[nextPoints.length - 1] ?? fallbackPoint,
    viaPoints: nextPoints.slice(1, -1),
    points: nextPoints,
  };
}

function withRoutePointAppended(route: SystemMapRoute, world: SystemMapVec): SystemMapRoute {
  const roundedWorld = {
    x: Math.round(world.x),
    y: Math.round(world.y),
  };
  const nextPoints = [...route.points, roundedWorld];
  return {
    ...route,
    modified: route.draft ? route.modified : true,
    originalId: route.draft ? route.originalId : route.originalId ?? route.id,
    endpointA: nextPoints[0],
    endpointB: nextPoints[nextPoints.length - 1],
    viaPoints: nextPoints.slice(1, -1),
    points: nextPoints,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function routePointToLocal(point: SystemMapVec, sector: SystemMapVec, sectorSize: number): Record<string, number> {
  return {
    x: Math.round(point.x - sector.x * sectorSize),
    y: Math.round(point.y - sector.y * sectorSize),
  };
}

function routeToTradeRouteJson(route: SystemMapRoute, sectorSize: number, baseRoute?: unknown): Record<string, unknown> {
  const base = isPlainRecord(baseRoute) ? baseRoute : {};
  const baseEndpoints = isPlainRecord(base.endpoints) ? base.endpoints : {};
  const baseEndpointA = isPlainRecord(baseEndpoints.a) ? baseEndpoints.a : {};
  const baseEndpointB = isPlainRecord(baseEndpoints.b) ? baseEndpoints.b : {};
  const baseSmoothing = isPlainRecord(base.smoothing) ? base.smoothing : {};
  const baseSCurve = isPlainRecord(base.s_curve) ? base.s_curve : {};
  const sector = {
    x: Math.round(route.sector.x),
    y: Math.round(route.sector.y),
  };
  const endpointA = route.points[0] ?? route.endpointA;
  const endpointB = route.points[route.points.length - 1] ?? route.endpointB;
  const viaPoints = route.points.length > 2 ? route.points.slice(1, -1) : [];

  return {
    ...base,
    id: route.id,
    name: route.name || route.id,
    sector,
    width: route.width,
    speed_multiplier: route.speedMultiplier,
    color: route.color || "#9b2b00",
    border_color: route.borderColor || "#B0ECFE",
    opacity: route.opacity,
    border_px: route.borderPx,
    endpoints: {
      ...baseEndpoints,
      a: {
        ...baseEndpointA,
        ...routePointToLocal(endpointA, sector, sectorSize),
        name: route.endpointAName || "Endpoint A",
      },
      b: {
        ...baseEndpointB,
        ...routePointToLocal(endpointB, sector, sectorSize),
        name: route.endpointBName || "Endpoint B",
      },
    },
    points: viaPoints.map((point) => routePointToLocal(point, sector, sectorSize)),
    smoothing: {
      ...baseSmoothing,
      tension: route.smoothingTension,
    },
    s_curve: viaPoints.length ? base.s_curve : { ...baseSCurve, amplitude_factor: Number(baseSCurve.amplitude_factor ?? 0.3) },
  };
}

function zoneMatches(zone: SystemMapZone, query: string) {
  if (!query) return true;
  return [zone.id, zone.name, zone.poiLabel, zone.sector.x, zone.sector.y].join(" ").toLowerCase().includes(query);
}

function poiMatches(poi: SystemMapPoi, query: string) {
  if (!query) return true;
  return [poi.id, poi.name, poi.type, poi.source].join(" ").toLowerCase().includes(query);
}

function updateZonePois(pois: SystemMapPoi[], originalZoneId: string, zone: SystemMapZone): SystemMapPoi[] {
  const withoutZonePoi = pois.filter((poi) => !(poi.source === "zone" && poi.zoneId === originalZoneId));
  if (!zone.poiMap) return withoutZonePoi;
  return [
    ...withoutZonePoi,
    {
      id: zone.id,
      name: zone.poiLabel || zone.name,
      type: "zone",
      source: "zone" as const,
      zoneId: zone.id,
      sector: zone.sector,
      local: zone.local,
      world: zone.world,
      map: true,
      hidden: zone.poiHidden,
    },
  ];
}

function mobMatches(mob: SystemMapMobSpawn | SystemMapSceneMobSpawn, query: string) {
  if (!query) return true;
  return [mob.mobId, mob.displayName, mob.faction].join(" ").toLowerCase().includes(query);
}

function routeMatches(route: SystemMapRoute, query: string) {
  if (!query) return true;
  return [route.id, route.name, route.endpointAName, route.endpointBName].join(" ").toLowerCase().includes(query);
}

function stageMatches(stage: SystemMapStagePlacement, query: string) {
  if (!query) return true;
  return [stage.stageId, stage.name, stage.shape].join(" ").toLowerCase().includes(query);
}

function barrierMatches(barrier: SystemMapSceneBarrier, query: string) {
  if (!query) return true;
  return [barrier.nodeName, barrier.profileId, barrier.sourceScene].join(" ").toLowerCase().includes(query);
}

function isMapUiTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("[data-system-map-ui]");
}

export default function SystemMapViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; center: SystemMapVec } | null>(null);
  const zoneDragRef = useRef<ZoneDragState | null>(null);
  const mobDragRef = useRef<MobDragState | null>(null);
  const routeDragRef = useRef<RouteDragState | null>(null);
  const fittedRef = useRef(false);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<{ screen: SystemMapVec; world: SystemMapVec } | null>(null);
  const [payload, setPayload] = useState<SystemMapPayload | null>(null);
  const [error, setError] = useState("");
  const [viewport, setViewport] = useState<Viewport>({ width: 1200, height: 800 });
  const [camera, setCamera] = useState<Camera>({ center: { x: 0, y: 0 }, zoom: MIN_ZOOM });
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>(DEFAULT_TOGGLES);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [draftZones, setDraftZones] = useState<SystemMapZone[]>([]);
  const [draftRoutes, setDraftRoutes] = useState<SystemMapRoute[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneDraftForm | null>(null);
  const [routeForm, setRouteForm] = useState<RouteDraftForm | null>(null);
  const [mobSpawnForm, setMobSpawnForm] = useState<MobSpawnForm | null>(null);
  const [mobSpawnSearch, setMobSpawnSearch] = useState("");
  const [zoneIdManuallyEdited, setZoneIdManuallyEdited] = useState(false);
  const [routeIdManuallyEdited, setRouteIdManuallyEdited] = useState(false);
  const [editedZoneIds, setEditedZoneIds] = useState<string[]>([]);
  const [editedRouteIds, setEditedRouteIds] = useState<string[]>([]);
  const [pendingRouteStart, setPendingRouteStart] = useState(false);
  const [activeRouteAddId, setActiveRouteAddId] = useState<string | null>(null);
  const [draggingZoneId, setDraggingZoneId] = useState<string | null>(null);
  const [draggingMobKey, setDraggingMobKey] = useState<string | null>(null);
  const [draggingRouteHandle, setDraggingRouteHandle] = useState<string | null>(null);
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [savingZones, setSavingZones] = useState(false);
  const [savingRoutes, setSavingRoutes] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/system-map", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !data?.ok) {
          setError(data?.error ? String(data.error) : "Unable to load system map data.");
          return;
        }
        setPayload(data as SystemMapPayload);
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewport({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverFrameRef.current);
      }
    };
  }, []);

  const mapZones = useMemo(() => (payload ? [...payload.zones, ...draftZones] : []), [draftZones, payload]);
  const mapRoutes = useMemo(() => (payload ? [...payload.routes, ...draftRoutes] : []), [draftRoutes, payload]);
  const existingZoneIds = useMemo(() => mapZones.map((zone) => zone.id).filter(Boolean), [mapZones]);
  const existingRouteIds = useMemo(() => mapRoutes.map((route) => route.id).filter(Boolean), [mapRoutes]);
  const bounds = useMemo(() => (payload ? computeWorldBounds(payload, mapZones, mapRoutes) : null), [mapRoutes, mapZones, payload]);

  useEffect(() => {
    if (!payload || !bounds || fittedRef.current) return;
    fittedRef.current = true;
    setCamera(cameraForBounds(bounds, viewport));
  }, [bounds, payload, viewport]);

  const transform = `translate(${viewport.width / 2} ${viewport.height / 2}) scale(${camera.zoom}) translate(${-camera.center.x} ${-camera.center.y})`;

  function worldToScreen(point: SystemMapVec): SystemMapVec {
    return {
      x: (point.x - camera.center.x) * camera.zoom + viewport.width / 2,
      y: (point.y - camera.center.y) * camera.zoom + viewport.height / 2,
    };
  }

  function screenToWorld(point: SystemMapVec): SystemMapVec {
    return {
      x: (point.x - viewport.width / 2) / camera.zoom + camera.center.x,
      y: (point.y - viewport.height / 2) / camera.zoom + camera.center.y,
    };
  }

  function findZoneAtWorld(world: SystemMapVec) {
    const screenHitRadius = 14 / camera.zoom;
    for (let index = filteredZones.length - 1; index >= 0; index -= 1) {
      const zone = filteredZones[index];
      if (pointInZoneBounds(world, zone) || distance(world, zone.world) <= screenHitRadius) return zone;
    }
    return null;
  }

  function findRoutePointAtWorld(world: SystemMapVec) {
    const screenHitRadius = 11 / camera.zoom;
    for (let routeIndex = filteredRoutes.length - 1; routeIndex >= 0; routeIndex -= 1) {
      const route = filteredRoutes[routeIndex];
      for (let pointIndex = route.points.length - 1; pointIndex >= 0; pointIndex -= 1) {
        if (distance(world, route.points[pointIndex]) <= screenHitRadius) {
          return { route, pointIndex };
        }
      }
    }
    return null;
  }

  function findRouteAtWorld(world: SystemMapVec) {
    for (let routeIndex = filteredRoutes.length - 1; routeIndex >= 0; routeIndex -= 1) {
      const route = filteredRoutes[routeIndex];
      for (let index = 1; index < route.points.length; index += 1) {
        if (pointToSegmentDistance(world, route.points[index - 1], route.points[index]) <= Math.max(route.width / 2, 10 / camera.zoom)) {
          return route;
        }
      }
    }
    return null;
  }

  function findMobSpawnAtWorld(world: SystemMapVec) {
    const screenHitRadius = 14 / camera.zoom;
    for (let zoneIndex = filteredZones.length - 1; zoneIndex >= 0; zoneIndex -= 1) {
      const zone = filteredZones[zoneIndex];
      for (let mobIndex = zone.mobs.length - 1; mobIndex >= 0; mobIndex -= 1) {
        const mob = zone.mobs[mobIndex];
        if (distance(world, mob.world) <= screenHitRadius) {
          return { zone, mob };
        }
      }
    }
    return null;
  }

  function updateZoneInMap(zoneId: string, updater: (zone: SystemMapZone) => SystemMapZone) {
    const draftZone = draftZones.find((zone) => zoneIdentity(zone) === zoneId);
    if (draftZone) {
      setDraftZones((current) => current.map((zone) => (zoneIdentity(zone) === zoneId ? updater(zone) : zone)));
      return;
    }

    setPayload((current) => {
      if (!current) return current;
      const existing = current.zones.find((zone) => zoneIdentity(zone) === zoneId);
      if (!existing) return current;
      const nextZone = updater(existing);
      return {
        ...current,
        zones: current.zones.map((zone) => (zoneIdentity(zone) === zoneId ? nextZone : zone)),
        pois: updateZonePois(current.pois, zoneId, nextZone),
      };
    });
    setEditedZoneIds((current) => (current.includes(zoneId) ? current : [...current, zoneId]));
  }

  function updateRouteInMap(routeId: string, updater: (route: SystemMapRoute) => SystemMapRoute) {
    const draftRoute = draftRoutes.find((route) => routeIdentity(route) === routeId);
    if (draftRoute) {
      setDraftRoutes((current) => current.map((route) => (routeIdentity(route) === routeId ? updater(route) : route)));
      return;
    }

    setPayload((current) => {
      if (!current) return current;
      const existing = current.routes.find((route) => routeIdentity(route) === routeId);
      if (!existing) return current;
      const nextRoute = updater(existing);
      return {
        ...current,
        routes: current.routes.map((route) => (routeIdentity(route) === routeId ? nextRoute : route)),
      };
    });
    setEditedRouteIds((current) => (current.includes(routeId) ? current : [...current, routeId]));
  }

  function updateMobSpawnPosition(zoneId: string, mobKey: string, world: SystemMapVec) {
    updateZoneInMap(zoneId, (zone) => ({
      ...zone,
      modified: zone.draft ? zone.modified : true,
      mobs: zone.mobs.map((mob) => (mobIdentity(mob) === mobKey ? moveMobSpawnToWorld(mob, world, zone) : mob)),
    }));
  }

  function updateRoutePointPosition(routeId: string, pointIndex: number, world: SystemMapVec) {
    updateRouteInMap(routeId, (route) => withRoutePoint(route, pointIndex, world));
  }

  function appendRoutePoint(routeId: string, world: SystemMapVec) {
    updateRouteInMap(routeId, (route) => withRoutePointAppended(route, world));
  }

  function updateZonePosition(zoneId: string, world: SystemMapVec) {
    if (!payload) return;
    const roundedWorld = {
      x: Math.round(world.x),
      y: Math.round(world.y),
    };
    const draftZone = draftZones.find((zone) => zone.id === zoneId);
    if (draftZone) {
      setDraftZones((current) => current.map((zone) => (zone.id === zoneId ? moveZoneToWorld(zone, roundedWorld, payload) : zone)));
      return;
    }

    const existingZone = payload.zones.find((zone) => (zone.originalId ?? zone.id) === zoneId || zone.id === zoneId);
    if (!existingZone) return;
    const movedZone = moveZoneToWorld(existingZone, roundedWorld, payload);
    const originalId = movedZone.originalId ?? existingZone.id;
    setPayload((current) =>
      current
        ? {
            ...current,
            zones: current.zones.map((zone) => ((zone.originalId ?? zone.id) === originalId ? movedZone : zone)),
            pois: updateZonePois(current.pois, originalId, movedZone),
          }
        : current,
    );
    setEditedZoneIds((current) => (current.includes(originalId) ? current : [...current, originalId]));
  }

  function openZoneEditor(zone: SystemMapZone) {
    setZoneForm({
      mode: "edit",
      originalId: zone.originalId ?? zone.id,
      id: zone.id,
      name: zone.name || zone.id,
      worldX: numberInputValue(zone.world.x),
      worldY: numberInputValue(zone.world.y),
      activationRadius: numberInputValue(zone.activationRadius),
      boundsShape: normalizeBoundsShape(zone.bounds.shape),
      boundsWidth: numberInputValue(zone.bounds.width),
      boundsHeight: numberInputValue(zone.bounds.height),
      active: zone.active,
      showHudOnEnter: zone.showHudOnEnter,
      poiMap: zone.poiMap,
      poiHidden: zone.poiHidden,
      poiLabel: zone.poiLabel,
      activationRadiusBorder: zone.activationRadiusBorder,
    });
    setZoneIdManuallyEdited(true);
    setContextMenu(null);
    setStatus(null);
  }

  function openRouteEditor(route: SystemMapRoute) {
    setRouteForm(routeToForm(route, route.draft ? "create" : "edit"));
    setRouteIdManuallyEdited(true);
    setActiveRouteAddId(null);
    setPendingRouteStart(false);
    setContextMenu(null);
    setStatus(null);
  }

  function startRouteDraft(world: SystemMapVec) {
    if (!payload) return;
    const route = createRouteDraftFromPoint(world, payload, existingRouteIds);
    setDraftRoutes((current) => [...current, route]);
    setRouteForm(routeToForm(route, "create"));
    setRouteIdManuallyEdited(false);
    setPendingRouteStart(false);
    setActiveRouteAddId(routeIdentity(route));
    setContextMenu(null);
    setStatus({ tone: "neutral", message: "Route draft started. Click the map to add each route point, drag any route handle to adjust it, then save route changes to build." });
  }

  function fitAll() {
    if (!bounds) return;
    setCamera(cameraForBounds(bounds, viewport));
  }

  function resetSol() {
    setCamera({
      center: { x: 0, y: 0 },
      zoom: clamp(Math.min(viewport.width, viewport.height) / 520000, MIN_ZOOM, MAX_ZOOM),
    });
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (isMapUiTarget(event.target)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setCamera((current) => {
      const before = {
        x: (screen.x - viewport.width / 2) / current.zoom + current.center.x,
        y: (screen.y - viewport.height / 2) / current.zoom + current.center.y,
      };
      const nextZoom = clamp(current.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2), MIN_ZOOM, MAX_ZOOM);
      return {
        zoom: nextZoom,
        center: {
          x: before.x - (screen.x - viewport.width / 2) / nextZoom,
          y: before.y - (screen.y - viewport.height / 2) / nextZoom,
        },
      };
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isMapUiTarget(event.target)) return;
    setContextMenu(null);
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const world = screenToWorld(screen);
    const targetRoutePoint = toggles.routes ? findRoutePointAtWorld(world) : null;
    if (targetRoutePoint) {
      event.currentTarget.setPointerCapture(event.pointerId);
      routeDragRef.current = {
        routeId: routeIdentity(targetRoutePoint.route),
        pointIndex: targetRoutePoint.pointIndex,
        startScreen: screen,
        startWorld: world,
        pointStartWorld: targetRoutePoint.route.points[targetRoutePoint.pointIndex],
        moved: false,
      };
      setDraggingRouteHandle(`${routeIdentity(targetRoutePoint.route)}:${targetRoutePoint.pointIndex}`);
      clearHover();
      return;
    }
    if (pendingRouteStart) {
      startRouteDraft(world);
      clearHover();
      return;
    }
    if (activeRouteAddId) {
      appendRoutePoint(activeRouteAddId, world);
      setStatus({ tone: "neutral", message: "Added route point. Keep clicking to add points, or stop point mode in the route editor." });
      clearHover();
      return;
    }
    const targetMobSpawn = toggles.mobs ? findMobSpawnAtWorld(world) : null;
    if (targetMobSpawn) {
      event.currentTarget.setPointerCapture(event.pointerId);
      mobDragRef.current = {
        zoneId: zoneIdentity(targetMobSpawn.zone),
        mobKey: mobIdentity(targetMobSpawn.mob),
        startScreen: screen,
        startWorld: world,
        mobStartWorld: targetMobSpawn.mob.world,
        moved: false,
      };
      setDraggingMobKey(mobIdentity(targetMobSpawn.mob));
      clearHover();
      return;
    }
    const targetZone = toggles.zones ? findZoneAtWorld(world) : null;
    if (targetZone && event.metaKey) {
      event.currentTarget.setPointerCapture(event.pointerId);
      zoneDragRef.current = {
        zoneId: targetZone.id,
        startScreen: screen,
        startWorld: world,
        zoneStartWorld: targetZone.world,
        moved: false,
      };
      setDraggingZoneId(targetZone.id);
      clearHover();
      return;
    }
    if (targetZone) {
      openZoneEditor(targetZone);
      clearHover();
      return;
    }
    const targetRoute = toggles.routes ? findRouteAtWorld(world) : null;
    if (targetRoute) {
      openRouteEditor(targetRoute);
      clearHover();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      center: camera.center,
    };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const routeDrag = routeDragRef.current;
    if (routeDrag) {
      const route = mapRoutes.find((entry) => routeIdentity(entry) === routeDrag.routeId);
      if (routeDrag.moved) {
        setStatus({ tone: "success", message: `Moved point ${routeDrag.pointIndex + 1} on "${route?.name || routeDrag.routeId}". Use Save Route Changes To Build to write it into trade_routes.json.` });
      } else if (route) {
        openRouteEditor(route);
      }
    }
    const mobDrag = mobDragRef.current;
    if (mobDrag) {
      const zone = mapZones.find((entry) => zoneIdentity(entry) === mobDrag.zoneId);
      const mob = zone?.mobs.find((entry) => mobIdentity(entry) === mobDrag.mobKey);
      if (mobDrag.moved) {
        setStatus({ tone: "success", message: `Moved "${mob?.displayName || mobDrag.mobKey}". Use Save Zone Changes To Build to write the spawn position into Zones.json.` });
      } else if (zone && mob) {
        openMobSpawnEditor(zone, mob);
      }
    }
    const zoneDrag = zoneDragRef.current;
    if (zoneDrag?.moved) {
      const zone = mapZones.find((entry) => entry.id === zoneDrag.zoneId);
      setStatus({ tone: "success", message: `Moved "${zone?.name || zoneDrag.zoneId}". Use Save Zone Changes To Build to write the new coordinates into Zones.json.` });
    }
    mobDragRef.current = null;
    setDraggingMobKey(null);
    routeDragRef.current = null;
    setDraggingRouteHandle(null);
    zoneDragRef.current = null;
    setDraggingZoneId(null);
    dragRef.current = null;
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (isMapUiTarget(event.target)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const world = screenToWorld(screen);
    const targetZone = toggles.zones ? findZoneAtWorld(world) : null;
    const targetRoute = toggles.routes ? findRouteAtWorld(world) : null;
    setContextMenu({
      x: screen.x,
      y: screen.y,
      world,
      zoneId: targetZone ? zoneIdentity(targetZone) : null,
      routeId: targetRoute ? routeIdentity(targetRoute) : null,
    });
    clearHover();
  }

  function clearHover() {
    pendingHoverRef.current = null;
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHover((current) => (current ? null : current));
  }

  function scheduleHover(screen: SystemMapVec, world: SystemMapVec) {
    pendingHoverRef.current = { screen, world };
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const pending = pendingHoverRef.current;
      if (!pending) return;
      setHover(buildHover(pending.screen, pending.world));
    });
  }

  function buildHover(screen: SystemMapVec, world: SystemMapVec): HoverInfo | null {
    if (!payload) return null;
    const screenHitRadius = 14 / camera.zoom;

    if (toggles.mobs) {
      for (const zone of mapZones) {
        if (!zoneMatches(zone, normalizedQuery)) continue;
        for (const mob of zone.mobs) {
          if (!mobMatches(mob, normalizedQuery)) continue;
          if (distance(world, mob.world) <= screenHitRadius) {
            return {
              x: screen.x,
              y: screen.y,
              title: mob.displayName || mob.mobId,
              subtitle: `Zone spawn in ${zone.name}`,
              icon: safeIconSrc(mob.sprite, mob.mobId, mob.displayName),
              lines: [
                `Mob ID: ${mob.mobId}`,
                `Count: ${mob.count}`,
                `Radius: ${formatNumber(mob.radius)}`,
                `Level: ${mob.levelMin ?? "?"}-${mob.levelMax ?? "?"} (${mob.rank})`,
                `Faction: ${mob.faction || "not set"}`,
                `World: ${formatVec(mob.world)}`,
              ],
            };
          }

          for (const sceneMob of mob.sceneSpawns) {
            if (!mobMatches(sceneMob, normalizedQuery)) continue;
            if (distance(world, sceneMob.world) <= screenHitRadius) {
              return {
                x: screen.x,
                y: screen.y,
                title: sceneMob.displayName || sceneMob.mobId,
                subtitle: `Scene marker in ${mob.displayName || mob.mobId}`,
                icon: safeIconSrc(sceneMob.sprite, sceneMob.mobId, sceneMob.displayName),
                lines: [
                  `Mob ID: ${sceneMob.mobId}`,
                  `Node: ${sceneMob.nodeName || "unnamed marker"}`,
                  `Faction: ${sceneMob.faction || "not set"}`,
                  `Route: ${sceneMob.routeId || "none"}`,
                  `Scene: ${sceneMob.sourceScene}`,
                  `World: ${formatVec(sceneMob.world)}`,
                ],
              };
            }
          }
        }
      }
    }

    if (toggles.pois) {
      for (const poi of payload.pois) {
        if (!poiMatches(poi, normalizedQuery)) continue;
        if (distance(world, poi.world) <= 16 / camera.zoom) {
          return {
            x: screen.x,
            y: screen.y,
            title: poi.name || poi.id,
            subtitle: `${poi.source === "zone" ? "Zone POI" : "Legacy POI"} · ${poi.type}`,
            lines: [
              `ID: ${poi.id}`,
              `Sector: ${poi.sector.x}, ${poi.sector.y}`,
              `Local: ${formatVec(poi.local)}`,
              `World: ${formatVec(poi.world)}`,
              `Hidden until discovered: ${poi.hidden ? "yes" : "no"}`,
            ],
          };
        }
      }
    }

    if (toggles.stages) {
      for (const zone of mapZones) {
        if (!zoneMatches(zone, normalizedQuery)) continue;
        for (const stage of zone.stages) {
          if (!stageMatches(stage, normalizedQuery)) continue;
          const halfWidth = Math.max(1, stage.width / 2);
          const halfHeight = Math.max(1, stage.height / 2);
          const inStage =
            stage.shape.toLowerCase() === "rect" || stage.shape.toLowerCase() === "rectangle"
              ? Math.abs(world.x - stage.world.x) <= halfWidth && Math.abs(world.y - stage.world.y) <= halfHeight
              : ((world.x - stage.world.x) * (world.x - stage.world.x)) / (halfWidth * halfWidth) +
                  ((world.y - stage.world.y) * (world.y - stage.world.y)) / (halfHeight * halfHeight) <=
                1;
          if (inStage || distance(world, stage.world) <= screenHitRadius) {
            return {
              x: screen.x,
              y: screen.y,
              title: stage.name || stage.stageId,
              subtitle: `Stage in ${zone.name}`,
              lines: [
                `Stage ID: ${stage.stageId}`,
                `Shape: ${stage.shape}`,
                `Size: ${formatNumber(stage.width)} x ${formatNumber(stage.height)}`,
                `Materials: ${stage.materialCount}`,
                `Missing stage definition: ${stage.missing ? "yes" : "no"}`,
                `World: ${formatVec(stage.world)}`,
              ],
            };
          }
        }
      }
    }

    if (toggles.barriers) {
      for (const zone of mapZones) {
        if (!zoneMatches(zone, normalizedQuery)) continue;
        for (const mob of zone.mobs) {
          for (const barrier of mob.sceneBarriers) {
            if (!barrierMatches(barrier, normalizedQuery)) continue;
            for (let index = 1; index < barrier.worldPoints.length; index += 1) {
              const hitDistance = Math.max(barrier.bandWidth * barrier.visualWidthMultiplier * 0.5, 10 / camera.zoom);
              if (pointToSegmentDistance(world, barrier.worldPoints[index - 1], barrier.worldPoints[index]) <= hitDistance) {
                return {
                  x: screen.x,
                  y: screen.y,
                  title: barrier.nodeName || "Hazard Barrier",
                  subtitle: `Scene barrier in ${mob.displayName || mob.mobId}`,
                  lines: [
                    `Profile: ${barrier.profileId || "not set"}`,
                    `Band width: ${formatNumber(barrier.bandWidth)}`,
                    `Visual width: ${barrier.visualWidthMultiplier}x`,
                    `Points: ${barrier.worldPoints.length}`,
                    `Scene: ${barrier.sourceScene}`,
                  ],
                };
              }
            }
          }
        }
      }
    }

    if (toggles.zones) {
      for (const zone of mapZones) {
        if (!zoneMatches(zone, normalizedQuery)) continue;
        if (pointInZoneBounds(world, zone) || distance(world, zone.world) <= screenHitRadius) {
          return {
            x: screen.x,
              y: screen.y,
              title: zone.name || zone.id,
              subtitle: `${zone.draft ? "Unsaved draft" : zone.modified ? "Unsaved coordinate edit" : zone.active ? "Active" : "Inactive"} zone · sector ${zone.sector.x}, ${zone.sector.y}`,
              lines: [
                `Zone ID: ${zone.id}`,
              `POI: ${zone.poiMap ? zone.poiLabel || zone.name : "not shown on map"}`,
              `Activation radius: ${formatNumber(zone.activationRadius)}`,
              `Bounds: ${zone.bounds.shape}, ${formatNumber(zone.bounds.width)} x ${formatNumber(zone.bounds.height)}`,
              `Stages: ${zone.stages.length}`,
              `Zone mob rows: ${zone.mobs.length}`,
              `Scene mob markers: ${zone.mobs.reduce((sum, mob) => sum + mob.sceneSpawns.length, 0)}`,
              `World: ${formatVec(zone.world)}`,
            ],
          };
        }
      }
    }

    if (toggles.routes) {
      for (const route of mapRoutes) {
        if (!routeMatches(route, normalizedQuery)) continue;
        for (let index = 1; index < route.points.length; index += 1) {
          if (pointToSegmentDistance(world, route.points[index - 1], route.points[index]) <= Math.max(2500, 8 / camera.zoom)) {
            return {
              x: screen.x,
              y: screen.y,
              title: route.name || route.id,
              subtitle: `${route.draft ? "Unsaved draft" : route.modified ? "Unsaved route edit" : "Trade route"} · sector ${route.sector.x}, ${route.sector.y}`,
              lines: [
                `Route ID: ${route.id}`,
                `From: ${route.endpointAName}`,
                `To: ${route.endpointBName}`,
                `Width: ${formatNumber(route.width)}`,
                `Speed multiplier: ${route.speedMultiplier}`,
                `Points: ${route.points.length}`,
              ],
            };
          }
        }
      }
    }

    if (toggles.environment) {
      const originDistance = distance(world, { x: 0, y: 0 });
      if (originDistance <= payload.config.sunDangerRadius) {
        return {
          x: screen.x,
          y: screen.y,
          title: "Sun",
          subtitle: "System environment",
          lines: [
            `Sun radius: ${formatNumber(payload.config.sunRadius)}`,
            `Danger radius: ${formatNumber(payload.config.sunDangerRadius)}`,
            `World: 0, 0`,
          ],
        };
      }
      if (originDistance >= payload.config.asteroidBeltInnerRadius && originDistance <= payload.config.asteroidBeltOuterRadius) {
        return {
          x: screen.x,
          y: screen.y,
          title: "Asteroid Belt",
          subtitle: "Procedural environment band",
          lines: [
            `Inner radius: ${formatNumber(payload.config.asteroidBeltInnerRadius)}`,
            `Outer radius: ${formatNumber(payload.config.asteroidBeltOuterRadius)}`,
            `Mid radius: ${formatNumber(payload.config.asteroidBeltMidRadius)}`,
          ],
        };
      }
    }

    for (const sector of payload.sectors) {
      if (pointInRect(world, sector.rect)) {
        return {
          x: screen.x,
          y: screen.y,
          title: sector.name,
          subtitle: `Sector ${sector.x}, ${sector.y}`,
          lines: [`Bounds: ${formatVec({ x: sector.rect.x, y: sector.rect.y })} to ${formatVec({ x: sector.rect.x + sector.rect.w, y: sector.rect.y + sector.rect.h })}`],
        };
      }
    }

    return null;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isMapUiTarget(event.target)) {
      clearHover();
      return;
    }

    const mobDrag = mobDragRef.current;
    const routeDrag = routeDragRef.current;
    if (routeDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const screen = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const world = screenToWorld(screen);
      const nextWorld = {
        x: routeDrag.pointStartWorld.x + world.x - routeDrag.startWorld.x,
        y: routeDrag.pointStartWorld.y + world.y - routeDrag.startWorld.y,
      };
      if (!routeDrag.moved && distance(screen, routeDrag.startScreen) > 4) {
        routeDrag.moved = true;
      }
      updateRoutePointPosition(routeDrag.routeId, routeDrag.pointIndex, nextWorld);
      clearHover();
      return;
    }

    if (mobDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const screen = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const world = screenToWorld(screen);
      const nextWorld = {
        x: mobDrag.mobStartWorld.x + world.x - mobDrag.startWorld.x,
        y: mobDrag.mobStartWorld.y + world.y - mobDrag.startWorld.y,
      };
      if (!mobDrag.moved && distance(screen, mobDrag.startScreen) > 4) {
        mobDrag.moved = true;
      }
      updateMobSpawnPosition(mobDrag.zoneId, mobDrag.mobKey, nextWorld);
      clearHover();
      return;
    }

    const zoneDrag = zoneDragRef.current;
    if (zoneDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const screen = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const world = screenToWorld(screen);
      const nextWorld = {
        x: zoneDrag.zoneStartWorld.x + world.x - zoneDrag.startWorld.x,
        y: zoneDrag.zoneStartWorld.y + world.y - zoneDrag.startWorld.y,
      };
      if (!zoneDrag.moved && distance(screen, zoneDrag.startScreen) > 4) {
        zoneDrag.moved = true;
      }
      updateZonePosition(zoneDrag.zoneId, nextWorld);
      clearHover();
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      setCamera((current) => ({
        ...current,
        center: {
          x: drag.center.x - (event.clientX - drag.startX) / current.zoom,
          y: drag.center.y - (event.clientY - drag.startY) / current.zoom,
        },
      }));
      clearHover();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const screen = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    scheduleHover(screen, screenToWorld(screen));
  }

  function toggleLayer(key: ToggleKey) {
    setToggles((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function openCreateZoneForm(world: SystemMapVec) {
    const defaultName = "New Zone";
    setZoneForm({
      mode: "create",
      originalId: null,
      name: defaultName,
      id: createUniqueId(sanitizeZoneId(defaultName), existingZoneIds),
      worldX: numberInputValue(Math.round(world.x)),
      worldY: numberInputValue(Math.round(world.y)),
      activationRadius: "50000",
      boundsShape: "ellipse",
      boundsWidth: "15000",
      boundsHeight: "15000",
      active: false,
      showHudOnEnter: true,
      poiMap: false,
      poiHidden: false,
      poiLabel: "",
      activationRadiusBorder: false,
    });
    setZoneIdManuallyEdited(false);
    setContextMenu(null);
    setStatus(null);
  }

  function openCreateMobSpawnForm(zone: SystemMapZone, world: SystemMapVec) {
    const local = {
      x: Math.round(world.x - zone.world.x),
      y: Math.round(world.y - zone.world.y),
    };
    setMobSpawnForm({
      mode: "create",
      zoneId: zoneIdentity(zone),
      mobKey: null,
      mobId: payload?.mobCatalog[0]?.id ?? "",
      localX: numberInputValue(local.x),
      localY: numberInputValue(local.y),
      count: "1",
      radius: "0",
      respawnDelay: "30",
      angleDeg: "0",
      levelMin: "",
      levelMax: "",
      rank: "normal",
    });
    setMobSpawnSearch("");
    setContextMenu(null);
    setStatus(null);
  }

  function openMobSpawnEditor(zone: SystemMapZone, mob: SystemMapMobSpawn) {
    setMobSpawnForm({
      mode: "edit",
      zoneId: zoneIdentity(zone),
      mobKey: mobIdentity(mob),
      mobId: mob.mobId,
      localX: numberInputValue(mob.local.x),
      localY: numberInputValue(mob.local.y),
      count: numberInputValue(mob.count),
      radius: numberInputValue(mob.radius),
      respawnDelay: numberInputValue(mob.respawnDelay),
      angleDeg: numberInputValue(mob.angleDeg),
      levelMin: mob.levelMin === null ? "" : numberInputValue(mob.levelMin),
      levelMax: mob.levelMax === null ? "" : numberInputValue(mob.levelMax),
      rank: mob.rank || "normal",
    });
    setMobSpawnSearch(mob.displayName || mob.mobId);
    setContextMenu(null);
    setStatus(null);
  }

  function handleZoneNameChange(name: string) {
    setZoneForm((current) => {
      if (!current) return current;
      return {
        ...current,
        name,
        id: current.mode === "create" && !zoneIdManuallyEdited ? createUniqueId(sanitizeZoneId(name), existingZoneIds) : current.id,
      };
    });
  }

  function handleZoneIdChange(id: string) {
    setZoneIdManuallyEdited(true);
    setZoneForm((current) => (current ? { ...current, id: sanitizeZoneId(id) } : current));
  }

  function handleRouteNameChange(name: string) {
    setRouteForm((current) => {
      if (!current) return current;
      const reservedIds = existingRouteIds.filter((id) => id !== current.id && id !== current.originalId);
      return {
        ...current,
        name,
        id: current.mode === "create" && !routeIdManuallyEdited ? createUniqueId(sanitizeRouteId(name), reservedIds) : current.id,
      };
    });
  }

  function handleRouteIdChange(id: string) {
    setRouteIdManuallyEdited(true);
    setRouteForm((current) => (current ? { ...current, id: sanitizeRouteId(id) } : current));
  }

  function applyRouteForm() {
    if (!routeForm) return;
    const route = mapRoutes.find((entry) => routeIdentity(entry) === routeForm.originalId);
    if (!route) {
      setStatus({ tone: "error", message: "Could not find the route being edited." });
      return;
    }
    const applied = applyRouteFormToRouteValue(routeForm, route, mapRoutes);
    if (applied.error || !applied.route || !applied.form) {
      setStatus({ tone: "error", message: applied.error });
      return;
    }

    updateRouteInMap(routeForm.originalId, () => applied.route);
    setRouteForm(applied.form);
    setStatus({ tone: "success", message: `Applied route details for "${routeForm.name.trim()}". Use Save Route Changes To Build to write trade_routes.json.` });
  }

  function removeDraftRoute(routeId: string) {
    setDraftRoutes((current) => current.filter((route) => routeIdentity(route) !== routeId));
    setRouteForm((current) => (current?.originalId === routeId ? null : current));
    setActiveRouteAddId((current) => (current === routeId ? null : current));
    setStatus({ tone: "neutral", message: "Removed the unsaved trade route draft." });
  }

  function saveZoneForm() {
    if (!payload || !zoneForm) return;
    const id = sanitizeZoneId(zoneForm.id);
    const worldX = Number(zoneForm.worldX);
    const worldY = Number(zoneForm.worldY);
    const activationRadius = Number(zoneForm.activationRadius);
    const boundsWidth = Number(zoneForm.boundsWidth);
    const boundsHeight = Number(zoneForm.boundsHeight);
    if (!zoneForm.name.trim()) {
      setStatus({ tone: "error", message: "Zone name is required before adding it to the map." });
      return;
    }
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
      setStatus({ tone: "error", message: "Zone X and Y coordinates must be valid numbers." });
      return;
    }
    if (!Number.isFinite(activationRadius) || activationRadius < 0 || !Number.isFinite(boundsWidth) || boundsWidth < 1 || !Number.isFinite(boundsHeight) || boundsHeight < 1) {
      setStatus({ tone: "error", message: "Zone activation radius and bounds must be valid positive numbers." });
      return;
    }
    const originalId = zoneForm.originalId;
    const idTaken = mapZones.some((zone) => (zone.originalId ?? zone.id) !== originalId && zone.id === id);
    if (idTaken) {
      setStatus({ tone: "error", message: `Zone ID "${id}" already exists. Change the ID before applying this zone.` });
      return;
    }

    const normalizedForm = {
      ...zoneForm,
      id,
      worldX: numberInputValue(worldX),
      worldY: numberInputValue(worldY),
      activationRadius: numberInputValue(activationRadius),
      boundsWidth: numberInputValue(boundsWidth),
      boundsHeight: numberInputValue(boundsHeight),
    };

    if (zoneForm.mode === "create") {
      const zone = zoneFromDraftForm(normalizedForm, payload, id);
      setDraftZones((current) => [...current, zone]);
      setZoneForm(null);
      setStatus({ tone: "success", message: `Added draft zone "${zone.name}". Use Save Zone Changes To Build to write it into Zones.json.` });
      return;
    }

    if (!originalId) {
      setStatus({ tone: "error", message: "Could not identify the zone being edited." });
      return;
    }
    const baseZone = mapZones.find((zone) => (zone.originalId ?? zone.id) === originalId);
    if (!baseZone) {
      setStatus({ tone: "error", message: `Could not find zone "${originalId}" on the map.` });
      return;
    }

    const nextZone = {
      ...applyZoneFormToZone(normalizedForm, baseZone, payload, id),
      originalId,
    };
    if (baseZone.draft) {
      setDraftZones((current) => current.map((zone) => ((zone.originalId ?? zone.id) === originalId ? nextZone : zone)));
    } else {
      setPayload((current) =>
        current
          ? {
              ...current,
              zones: current.zones.map((zone) => ((zone.originalId ?? zone.id) === originalId ? nextZone : zone)),
              pois: updateZonePois(current.pois, originalId, nextZone),
            }
          : current,
      );
      setEditedZoneIds((current) => (current.includes(originalId) ? current : [...current, originalId]));
    }
    setZoneForm(null);
    setStatus({ tone: "success", message: `Updated "${nextZone.name}". Use Save Zone Changes To Build to write changes into Zones.json.` });
  }

  function saveMobSpawnForm() {
    if (!payload || !mobSpawnForm) return;
    const zone = mapZones.find((entry) => zoneIdentity(entry) === mobSpawnForm.zoneId);
    if (!zone) {
      setStatus({ tone: "error", message: "Could not identify which zone this mob spawn belongs to." });
      return;
    }
    const numericFields = [
      ["Local X", mobSpawnForm.localX],
      ["Local Y", mobSpawnForm.localY],
      ["Count", mobSpawnForm.count],
      ["Radius", mobSpawnForm.radius],
      ["Respawn Delay", mobSpawnForm.respawnDelay],
      ["Angle", mobSpawnForm.angleDeg],
    ];
    const invalidField = numericFields.find(([, value]) => !Number.isFinite(Number(value)));
    if (invalidField) {
      setStatus({ tone: "error", message: `${invalidField[0]} must be a valid number.` });
      return;
    }
    if (!mobSpawnForm.mobId.trim()) {
      setStatus({ tone: "error", message: "Choose a mob before adding the spawn point." });
      return;
    }
    if (mobSpawnForm.levelMin.trim() && !Number.isFinite(Number(mobSpawnForm.levelMin))) {
      setStatus({ tone: "error", message: "Level Min must be a valid number or blank." });
      return;
    }
    if (mobSpawnForm.levelMax.trim() && !Number.isFinite(Number(mobSpawnForm.levelMax))) {
      setStatus({ tone: "error", message: "Level Max must be a valid number or blank." });
      return;
    }

    const nextMob = createMobSpawnFromForm(mobSpawnForm, zone, payload.mobCatalog);
    updateZoneInMap(mobSpawnForm.zoneId, (currentZone) => {
      const existingIndex = mobSpawnForm.mobKey ? currentZone.mobs.findIndex((mob) => mobIdentity(mob) === mobSpawnForm.mobKey) : -1;
      const nextMobs =
        existingIndex >= 0
          ? currentZone.mobs.map((mob, index) => (index === existingIndex ? { ...nextMob, originalIndex: mob.originalIndex, draft: mob.draft, modified: mob.draft ? mob.modified : true } : mob))
          : [...currentZone.mobs, nextMob];
      return {
        ...currentZone,
        modified: currentZone.draft ? currentZone.modified : true,
        mobs: nextMobs,
      };
    });
    setMobSpawnForm(null);
    setStatus({ tone: "success", message: `${mobSpawnForm.mode === "create" ? "Added" : "Updated"} mob spawn "${nextMob.displayName}". Use Save Zone Changes To Build to write it into Zones.json.` });
  }

  async function handleSaveZoneChangesToBuild() {
    if ((!draftZones.length && !editedZoneIds.length) || savingZones) return;
    setSavingZones(true);
    setStatus(null);
    try {
      const sourceResponse = await fetch("/api/settings/data/source?kind=zones", { cache: "no-store" });
      const sourcePayload = await sourceResponse.json().catch(() => ({}));
      if (!sourceResponse.ok || !sourcePayload?.ok || typeof sourcePayload.text !== "string") {
        setStatus({ tone: "error", message: sourcePayload?.error || "Could not load the current Zones.json before saving." });
        return;
      }

      const workspace = importZonesManagerWorkspace(sourcePayload.text, sourcePayload.sourceLabel || "Local game source");
      const editedZones = mapZones.filter((zone) => !zone.draft && editedZoneIds.includes(zone.originalId ?? zone.id));
      const updatedExistingZones = workspace.zones.map((draft) => {
        const editedZone = editedZones.find((zone) => (zone.originalId ?? zone.id) === draft.id);
        return editedZone ? applyZoneDetailsToManagerDraft(draft, editedZone) : draft;
      });
      const existingIds = updatedExistingZones.map((zone) => zone.id);
      const managerDrafts: ZoneDraft[] = [];
      for (const zone of draftZones) {
        const managerDraft = zoneToManagerDraft(zone, [...existingIds, ...managerDrafts.map((entry) => entry.id)]);
        managerDrafts.push(managerDraft);
      }
      const nextWorkspace: ZonesManagerWorkspace = {
        ...workspace,
        zones: [...updatedExistingZones, ...managerDrafts],
      };

      const saveResponse = await fetch("/api/zones/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspace: nextWorkspace }),
      });
      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || !savePayload?.ok) {
        setStatus({ tone: "error", message: savePayload?.error || "Could not save zone drafts into Zones.json." });
        return;
      }

      const savedZones = draftZones.map((zone, index) => ({
        ...zone,
        id: managerDrafts[index]?.id ?? zone.id,
        draft: false,
        modified: false,
        originalId: undefined,
      }));
      setPayload((current) =>
        current
          ? {
              ...current,
              zones: [...current.zones.map((zone) => ({ ...zone, modified: false, originalId: undefined })), ...savedZones],
              pois: savedZones.reduce((pois, zone) => updateZonePois(pois, zone.id, zone), current.pois),
            }
          : current,
      );
      setDraftZones([]);
      setEditedZoneIds([]);
      const savedCount = savedZones.length + editedZones.length;
      setStatus({ tone: "success", message: `Saved ${savedCount} zone change${savedCount === 1 ? "" : "s"} into the live Zones.json file.` });
    } catch (saveError) {
      setStatus({ tone: "error", message: saveError instanceof Error ? saveError.message : String(saveError) });
    } finally {
      setSavingZones(false);
    }
  }

  async function handleSaveRouteChangesToBuild() {
    if ((!draftRoutes.length && !editedRouteIds.length) || savingRoutes || !payload) return;
    setSavingRoutes(true);
    setStatus(null);
    try {
      let routesForSave = mapRoutes;
      let draftRoutesForSave = draftRoutes;
      let editedRouteIdsForSave = editedRouteIds;
      if (routeForm) {
        const route = routesForSave.find((entry) => routeIdentity(entry) === routeForm.originalId);
        if (route) {
          const applied = applyRouteFormToRouteValue(routeForm, route, routesForSave);
          if (applied.error || !applied.route || !applied.form) {
            setStatus({ tone: "error", message: applied.error });
            return;
          }
          routesForSave = routesForSave.map((entry) => (routeIdentity(entry) === routeForm.originalId ? applied.route : entry));
          draftRoutesForSave = draftRoutesForSave.map((entry) => (routeIdentity(entry) === routeForm.originalId ? applied.route : entry));
          if (!applied.route.draft && !editedRouteIdsForSave.includes(routeForm.originalId)) {
            editedRouteIdsForSave = [...editedRouteIdsForSave, routeForm.originalId];
          }
          setRouteForm(applied.form);
        }
      }

      const incompleteRoute = [...draftRoutesForSave, ...routesForSave.filter((route) => !route.draft && editedRouteIdsForSave.includes(route.originalId ?? route.id))].find((route) => route.points.length < 2);
      if (incompleteRoute) {
        setStatus({ tone: "error", message: `Trade route "${incompleteRoute.name || incompleteRoute.id}" needs at least two points before saving.` });
        return;
      }

      const sourceResponse = await fetch("/api/settings/data/source?kind=tradeRoutes", { cache: "no-store" });
      const sourcePayload = await sourceResponse.json().catch(() => ({}));
      if (!sourceResponse.ok || !sourcePayload?.ok || typeof sourcePayload.text !== "string") {
        setStatus({ tone: "error", message: sourcePayload?.error || "Could not load the current trade_routes.json before saving." });
        return;
      }

      const parsed = parseTolerantJsonText(sourcePayload.text);
      if (!parsed.value || !isPlainRecord(parsed.value)) {
        setStatus({ tone: "error", message: parsed.errors[0] || "Could not parse trade_routes.json before saving." });
        return;
      }
      const sourceRoutes = Array.isArray(parsed.value.routes) ? parsed.value.routes : [];
      const editedRoutes = routesForSave.filter((route) => !route.draft && editedRouteIdsForSave.includes(route.originalId ?? route.id));
      const updatedRoutes = sourceRoutes.map((routeValue) => {
        const routeRecord = isPlainRecord(routeValue) ? routeValue : {};
        const routeId = typeof routeRecord.id === "string" ? routeRecord.id : "";
        const editedRoute = editedRoutes.find((route) => (route.originalId ?? route.id) === routeId);
        return editedRoute ? routeToTradeRouteJson(editedRoute, payload.config.sectorSize, routeRecord) : routeValue;
      });
      const existingSourceIds = new Set(
        sourceRoutes
          .map((routeValue) => (isPlainRecord(routeValue) && typeof routeValue.id === "string" ? routeValue.id : ""))
          .filter(Boolean),
      );
      for (const route of draftRoutesForSave) {
        if (existingSourceIds.has(route.id)) {
          setStatus({ tone: "error", message: `Trade route ID "${route.id}" already exists in the live trade_routes.json file.` });
          return;
        }
        updatedRoutes.push(routeToTradeRouteJson(route, payload.config.sectorSize));
      }

      const tradeRoutes = {
        ...parsed.value,
        version: typeof parsed.value.version === "number" ? parsed.value.version : 1,
        routes: updatedRoutes,
      };
      const saveResponse = await fetch("/api/trade-routes/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tradeRoutes }),
      });
      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || !savePayload?.ok) {
        setStatus({ tone: "error", message: savePayload?.error || "Could not save trade route changes into trade_routes.json." });
        return;
      }

      const savedExistingRoutes = routesForSave
        .filter((route) => !route.draft)
        .map((route) => ({
          ...route,
          modified: false,
          originalId: undefined,
        }));
      const savedDraftRoutes = draftRoutesForSave.map((route) => ({
        ...route,
        draft: false,
        modified: false,
        originalId: undefined,
      }));
      setPayload((current) =>
        current
          ? {
              ...current,
              routes: [...savedExistingRoutes, ...savedDraftRoutes],
            }
          : current,
      );
      setDraftRoutes([]);
      setEditedRouteIds([]);
      setActiveRouteAddId(null);
      setPendingRouteStart(false);
      const savedCount = savedDraftRoutes.length + editedRoutes.length;
      setStatus({ tone: "success", message: `Saved ${savedCount} trade route change${savedCount === 1 ? "" : "s"} into the live trade_routes.json file.` });
    } catch (saveError) {
      setStatus({ tone: "error", message: saveError instanceof Error ? saveError.message : String(saveError) });
    } finally {
      setSavingRoutes(false);
    }
  }

  const filteredZones = mapZones.filter((zone) => zoneMatches(zone, normalizedQuery));
  const filteredPois = payload?.pois.filter((poi) => poiMatches(poi, normalizedQuery)) ?? [];
  const filteredRoutes = mapRoutes.filter((route) => routeMatches(route, normalizedQuery));
  const sceneMobCount = mapZones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneSpawns.length, 0), 0);
  const sceneBarrierCount = mapZones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneBarriers.length, 0), 0);
  const zoneMobCount = mapZones.reduce((sum, zone) => sum + zone.mobs.length, 0);
  const hasZoneChanges = draftZones.length > 0 || editedZoneIds.length > 0;
  const hasRouteChanges = draftRoutes.length > 0 || editedRouteIds.length > 0;
  const filteredMobCatalog = useMemo(() => {
    const normalized = mobSpawnSearch.trim().toLowerCase();
    const catalog = payload?.mobCatalog ?? [];
    if (!normalized) return catalog.slice(0, 40);
    return catalog.filter((mob) => [mob.id, mob.displayName, mob.faction, mob.scene].join(" ").toLowerCase().includes(normalized)).slice(0, 40);
  }, [mobSpawnSearch, payload?.mobCatalog]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] cursor-grab overflow-hidden bg-[#030812] text-white active:cursor-grabbing"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={clearHover}
      onContextMenu={handleContextMenu}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(35,116,161,0.16),rgba(3,8,18,0.15)_28%,rgba(3,8,18,0.82)_72%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:38px_38px]" />

      {payload ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" width={viewport.width} height={viewport.height} role="img" aria-label="Interactive system map">
          <defs>
            <radialGradient id="system-map-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff7a8" stopOpacity="1" />
              <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
            </radialGradient>
          </defs>
          <g transform={transform}>
            {toggles.environment ? (
              <>
                <circle cx={0} cy={0} r={payload.config.asteroidBeltOuterRadius} fill="rgba(117,99,64,0.04)" stroke="rgba(251,191,36,0.30)" strokeWidth={2 / camera.zoom} />
                <circle cx={0} cy={0} r={payload.config.asteroidBeltInnerRadius} fill="none" stroke="rgba(251,191,36,0.20)" strokeWidth={2 / camera.zoom} />
                <circle cx={0} cy={0} r={payload.config.sunDangerRadius} fill="rgba(249,115,22,0.10)" stroke="rgba(253,186,116,0.55)" strokeWidth={2 / camera.zoom} />
                <circle cx={0} cy={0} r={payload.config.sunRadius} fill="url(#system-map-sun)" stroke="rgba(254,240,138,0.8)" strokeWidth={2 / camera.zoom} />
              </>
            ) : null}

            {payload.sectors.map((sector) => (
              <rect
                key={`${sector.x},${sector.y}`}
                x={sector.rect.x}
                y={sector.rect.y}
                width={sector.rect.w}
                height={sector.rect.h}
                fill="rgba(15,23,42,0.08)"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={2 / camera.zoom}
              />
            ))}

            {toggles.regions
              ? payload.sectors.flatMap((sector) =>
                  payload.regions.map((region) => {
                    const x = sector.x * payload.config.sectorSize + region.rect.x;
                    const y = sector.y * payload.config.sectorSize + region.rect.y;
                    return (
                      <rect
                        key={`${sector.x},${sector.y}:${region.id}`}
                        x={x}
                        y={y}
                        width={region.rect.w}
                        height={region.rect.h}
                        fill={region.discovered ? "rgba(34,197,94,0.012)" : "rgba(0,0,0,0.035)"}
                        stroke="rgba(255,255,255,0.055)"
                        strokeWidth={1 / camera.zoom}
                      />
                    );
                  }),
                )
              : null}

            {toggles.routes
              ? filteredRoutes.map((route) => {
                  const isChanged = route.draft || route.modified;
                  const routeKey = routeIdentity(route);
                  const pathD = routePathD(route.points, route.smoothingTension);
                  return (
                    <g key={routeKey}>
                      {route.borderPx > 0 && route.points.length > 1 ? (
                        <path
                          d={pathD}
                          fill="none"
                          stroke={route.borderColor || "#B0ECFE"}
                          strokeOpacity={Math.max(0.18, route.opacity)}
                          strokeWidth={Math.max(route.width + route.borderPx * 2, 900)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {route.points.length > 1 ? (
                        <path
                          d={pathD}
                          fill="none"
                          stroke={route.color || "#38bdf8"}
                          strokeOpacity={Math.max(0.18, route.opacity)}
                          strokeWidth={Math.max(route.width, 700)}
                          strokeDasharray={isChanged ? `${18 / camera.zoom} ${12 / camera.zoom}` : undefined}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                      {route.points.map((point, pointIndex) => {
                        const handleKey = `${routeKey}:${pointIndex}`;
                        const isEndpoint = pointIndex === 0 || pointIndex === route.points.length - 1;
                        return (
                          <circle
                            key={handleKey}
                            cx={point.x}
                            cy={point.y}
                            r={(draggingRouteHandle === handleKey ? 9 : isEndpoint ? 7 : 5) / camera.zoom}
                            fill={route.draft ? "#34d399" : route.modified ? "#facc15" : isEndpoint ? "#38bdf8" : "#a78bfa"}
                            stroke="rgba(255,255,255,0.78)"
                            strokeWidth={(draggingRouteHandle === handleKey ? 2 : 1) / camera.zoom}
                          />
                        );
                      })}
                    </g>
                  );
                })
              : null}

            {toggles.zones
              ? filteredZones.map((zone) => {
                  const isChanged = zone.draft || zone.modified;
                  const zoneColor = zone.draft ? "rgba(52,211,153,0.82)" : zone.modified ? "rgba(250,204,21,0.78)" : zone.active ? "rgba(34,211,238,0.55)" : "rgba(148,163,184,0.36)";
                  const zoneFill = zone.draft ? "rgba(52,211,153,0.09)" : zone.modified ? "rgba(250,204,21,0.075)" : zone.active ? "rgba(34,211,238,0.055)" : "rgba(148,163,184,0.035)";
                  return (
                    <g key={zone.id}>
                      {zone.bounds.shape.toLowerCase() === "rect" || zone.bounds.shape.toLowerCase() === "rectangle" ? (
                        <rect
                          x={zone.world.x - zone.bounds.width / 2}
                          y={zone.world.y - zone.bounds.height / 2}
                          width={zone.bounds.width}
                          height={zone.bounds.height}
                          fill={zoneFill}
                          stroke={zoneColor}
                          strokeDasharray={isChanged ? `${10 / camera.zoom} ${8 / camera.zoom}` : undefined}
                          strokeWidth={(draggingZoneId === zone.id ? 4 : 2) / camera.zoom}
                        />
                      ) : (
                        <ellipse
                          cx={zone.world.x}
                          cy={zone.world.y}
                          rx={zone.bounds.width / 2}
                          ry={zone.bounds.height / 2}
                          fill={zoneFill}
                          stroke={zoneColor}
                          strokeDasharray={isChanged ? `${10 / camera.zoom} ${8 / camera.zoom}` : undefined}
                          strokeWidth={(draggingZoneId === zone.id ? 4 : 2) / camera.zoom}
                        />
                      )}
                      <circle cx={zone.world.x} cy={zone.world.y} r={(draggingZoneId === zone.id ? 9 : 6) / camera.zoom} fill={zone.draft ? "#34d399" : zone.modified ? "#facc15" : zone.active ? "#22d3ee" : "#94a3b8"} />
                    </g>
                  );
                })
              : null}

            {toggles.barriers
              ? filteredZones.flatMap((zone) =>
                  zone.mobs.flatMap((mob) =>
                    mob.sceneBarriers.filter((barrier) => barrierMatches(barrier, normalizedQuery)).map((barrier) => (
                      <polyline
                        key={`${zone.id}:${mob.mobId}:${barrier.nodeName}:${barrier.profileId}:${barrier.worldPoints.length}`}
                        points={barrier.worldPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none"
                        stroke="rgba(251,146,60,0.62)"
                        strokeWidth={Math.max(500, barrier.bandWidth * Math.max(1, barrier.visualWidthMultiplier))}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )),
                  ),
                )
              : null}

            {toggles.stages
              ? filteredZones.flatMap((zone) =>
                  zone.stages.filter((stage) => stageMatches(stage, normalizedQuery)).map((stage) => {
                    const color = stage.missing ? "rgba(248,113,113,0.7)" : "rgba(168,85,247,0.62)";
                    if (stage.shape.toLowerCase() === "rect" || stage.shape.toLowerCase() === "rectangle") {
                      return (
                        <rect
                          key={`${zone.id}:${stage.stageId}:${stage.local.x}:${stage.local.y}`}
                          x={stage.world.x - stage.width / 2}
                          y={stage.world.y - stage.height / 2}
                          width={Math.max(500, stage.width)}
                          height={Math.max(500, stage.height)}
                          fill="rgba(168,85,247,0.06)"
                          stroke={color}
                          strokeWidth={2 / camera.zoom}
                        />
                      );
                    }
                    return (
                      <ellipse
                        key={`${zone.id}:${stage.stageId}:${stage.local.x}:${stage.local.y}`}
                        cx={stage.world.x}
                        cy={stage.world.y}
                        rx={Math.max(250, stage.width / 2)}
                        ry={Math.max(250, stage.height / 2)}
                        fill="rgba(168,85,247,0.06)"
                        stroke={color}
                        strokeWidth={2 / camera.zoom}
                      />
                    );
                  }),
                )
              : null}

            {toggles.mobs
              ? filteredZones.flatMap((zone) =>
                  zone.mobs.filter((mob) => mobMatches(mob, normalizedQuery)).flatMap((mob) => {
                    const mobKey = mobIdentity(mob);
                    const mobColor = mob.draft ? "#34d399" : mob.modified ? "#facc15" : mob.missing ? "#ef4444" : "#fb7185";
                    const items: JSX.Element[] = [
                      <g key={`${zone.id}:${mob.mobId}:${mob.local.x}:${mob.local.y}:spawn`}>
                        {mob.radius > 0 ? (
                          <circle
                            cx={mob.world.x}
                            cy={mob.world.y}
                            r={mob.radius}
                            fill={mob.draft ? "rgba(52,211,153,0.06)" : mob.modified ? "rgba(250,204,21,0.06)" : "rgba(248,113,113,0.055)"}
                            stroke={mob.draft ? "rgba(52,211,153,0.45)" : mob.modified ? "rgba(250,204,21,0.5)" : "rgba(248,113,113,0.45)"}
                            strokeWidth={1.5 / camera.zoom}
                          />
                        ) : null}
                        <circle cx={mob.world.x} cy={mob.world.y} r={(draggingMobKey === mobKey ? 9 : 6) / camera.zoom} fill={mobColor} stroke="rgba(255,255,255,0.75)" strokeWidth={(draggingMobKey === mobKey ? 2 : 1) / camera.zoom} />
                      </g>,
                    ];
                    for (const sceneMob of mob.sceneSpawns.filter((entry) => mobMatches(entry, normalizedQuery))) {
                      items.push(
                        <circle
                          key={`${zone.id}:${mob.mobId}:${sceneMob.nodeName}:${sceneMob.mobId}:${sceneMob.local.x}:${sceneMob.local.y}`}
                          cx={sceneMob.world.x}
                          cy={sceneMob.world.y}
                          r={4 / camera.zoom}
                          fill={sceneMob.missing ? "#ef4444" : "#f59e0b"}
                          stroke="rgba(255,255,255,0.68)"
                          strokeWidth={1 / camera.zoom}
                        />,
                      );
                    }
                    return items;
                  }),
                )
              : null}

            {toggles.pois
              ? filteredPois.map((poi) => (
                  <g key={`${poi.source}:${poi.id}`}>
                    <circle cx={poi.world.x} cy={poi.world.y} r={8 / camera.zoom} fill={poi.source === "zone" ? "#38bdf8" : "#f8fafc"} stroke={poi.hidden ? "#facc15" : "rgba(8,47,73,0.9)"} strokeWidth={2 / camera.zoom} />
                    <circle cx={poi.world.x} cy={poi.world.y} r={15 / camera.zoom} fill="none" stroke="rgba(125,211,252,0.36)" strokeWidth={1.5 / camera.zoom} />
                  </g>
                ))
              : null}
          </g>
        </svg>
      ) : null}

      {payload && toggles.labels ? (
        <div className="pointer-events-none absolute inset-0">
          {payload.sectors.map((sector) => {
            const point = worldToScreen(rectCenter(sector.rect));
            return (
              <div
                key={`${sector.x},${sector.y}:label`}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-2xl font-semibold uppercase tracking-[0.28em] text-white/[0.055]"
                style={{ left: point.x, top: point.y }}
              >
                {sector.name}
              </div>
            );
          })}
          {toggles.zones
              ? filteredZones.map((zone) => {
                const point = worldToScreen(zone.world);
                return (
                  <div
                    key={`${zone.id}:label`}
                    className={`absolute translate-x-3 -translate-y-1/2 whitespace-nowrap rounded border px-2 py-1 text-xs shadow-lg ${
                      zone.draft
                        ? "border-emerald-300/35 bg-emerald-950/85 text-emerald-100"
                        : zone.modified
                          ? "border-yellow-300/35 bg-yellow-950/80 text-yellow-100"
                          : "border-cyan-300/20 bg-[#061524]/80 text-cyan-100"
                    }`}
                    style={{ left: point.x, top: point.y }}
                  >
                    {zone.name}
                    {zone.draft ? " (draft)" : zone.modified ? " (edited)" : ""}
                  </div>
                );
              })
            : null}
          {toggles.pois
            ? filteredPois.map((poi) => {
                const point = worldToScreen(poi.world);
                return (
                  <div key={`${poi.source}:${poi.id}:label`} className="absolute translate-x-3 translate-y-2 whitespace-nowrap text-xs font-medium text-white/75 drop-shadow" style={{ left: point.x, top: point.y }}>
                    {poi.name}
                  </div>
                );
              })
            : null}
        </div>
      ) : null}

      <div
        data-system-map-ui="true"
        className="absolute left-5 top-5 w-[min(520px,calc(100vw-2.5rem))] cursor-default rounded-2xl border border-white/10 bg-[#07111d]/92 p-4 shadow-2xl backdrop-blur"
        onPointerEnter={clearHover}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerCancel={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-white">System Map</div>
            <div className="mt-1 text-sm text-white/55">
              {payload
                ? `${mapZones.length} zones${draftZones.length ? ` (${draftZones.length} draft${draftZones.length === 1 ? "" : "s"})` : ""} · ${mapRoutes.length} trade routes${draftRoutes.length ? ` (${draftRoutes.length} draft${draftRoutes.length === 1 ? "" : "s"})` : ""} · ${payload.pois.length} POIs · ${zoneMobCount} zone mob rows · ${sceneMobCount} scene markers · ${sceneBarrierCount} barriers`
                : "Loading local game source..."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={!hasZoneChanges || savingZones} onClick={() => void handleSaveZoneChangesToBuild()}>
              {savingZones ? "Saving..." : "Save Zone Changes To Build"}
            </button>
            <button type="button" className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={!hasRouteChanges || savingRoutes} onClick={() => void handleSaveRouteChangesToBuild()}>
              {savingRoutes ? "Saving..." : "Save Route Changes To Build"}
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-2 text-sm ${pendingRouteStart ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"}`}
              onClick={() => {
                setPendingRouteStart((current) => !current);
                setActiveRouteAddId(null);
                setStatus({ tone: "neutral", message: "Click the map to place the first point for a new trade route." });
              }}
            >
              New Trade Route
            </button>
            <button type="button" className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10" onClick={fitAll}>
              Fit All
            </button>
            <button type="button" className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10" onClick={resetSol}>
              Sol
            </button>
            <Link href="/data" className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
              Close
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <input className="input bg-black/30" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search zones, POIs, routes, stages, or mobs..." />
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {(Object.keys(DEFAULT_TOGGLES) as ToggleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded border px-2 py-1.5 text-xs capitalize ${toggles[key] ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/5 text-white/45"}`}
              onClick={() => toggleLayer(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-white/60">
          <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
            Zoom
            <div className="text-white">{camera.zoom.toFixed(5)}</div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
            Center
            <div className="truncate text-white">{formatVec(camera.center)}</div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
            Filtered
            <div className="text-white">{payload ? `${filteredZones.length} zones · ${filteredRoutes.length} routes` : "0 zones"}</div>
          </div>
        </div>

        {status ? (
          <div
            className={`mt-4 rounded border px-3 py-2 text-sm ${
              status.tone === "success"
                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                : status.tone === "error"
                  ? "border-red-400/25 bg-red-400/10 text-red-100"
                  : "border-white/10 bg-white/5 text-white/70"
            }`}
          >
            {status.message}
          </div>
        ) : null}

        {error ? <div className="mt-4 rounded border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}
        {payload?.warnings.length ? (
          <details className="mt-4 rounded border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
            <summary className="cursor-pointer">Data warnings ({payload.warnings.length})</summary>
            <div className="mt-2 max-h-36 space-y-1 overflow-auto text-xs text-yellow-50/80">
              {payload.warnings.map((warning, index) => (
                <div key={`${warning}:${index}`}>{warning}</div>
              ))}
            </div>
          </details>
        ) : null}

        <div className="mt-4 text-xs leading-5 text-white/45">Drag to pan. Scroll to zoom fluidly around the cursor. Click a zone or route to edit details. Hold Command and drag a zone to move it. Drag trade route handles to adjust route points. Right-click the map to add zones, mob spawns, or trade routes.</div>
      </div>

      {contextMenu ? (
        <div
          data-system-map-ui="true"
          className="absolute z-[120] min-w-56 cursor-default rounded-xl border border-white/10 bg-[#08111f]/95 p-2 text-sm shadow-2xl backdrop-blur"
          style={{ left: Math.min(contextMenu.x, viewport.width - 240), top: Math.min(contextMenu.y, viewport.height - 120) }}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs text-white/50">World {formatVec(contextMenu.world)}</div>
          {contextMenu.routeId ? (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10"
              onClick={() => {
                const route = mapRoutes.find((entry) => routeIdentity(entry) === contextMenu.routeId);
                if (route) openRouteEditor(route);
              }}
            >
              Edit Trade Route
            </button>
          ) : null}
          {contextMenu.zoneId ? (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10"
              onClick={() => {
                const zone = mapZones.find((entry) => zoneIdentity(entry) === contextMenu.zoneId);
                if (zone) openCreateMobSpawnForm(zone, contextMenu.world);
              }}
            >
              Add Mob Spawn Here
            </button>
          ) : null}
          <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10" onClick={() => openCreateZoneForm(contextMenu.world)}>
            Add Zone Here
          </button>
          <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10" onClick={() => startRouteDraft(contextMenu.world)}>
            Start Trade Route Here
          </button>
        </div>
      ) : null}

      {routeForm
        ? (() => {
            const route = mapRoutes.find((entry) => routeIdentity(entry) === routeForm.originalId);
            const isAddingPoints = activeRouteAddId === routeForm.originalId;
            return (
              <div
                data-system-map-ui="true"
                className="absolute right-5 top-5 z-[115] max-h-[calc(100vh-2.5rem)] w-[min(460px,calc(100vw-2.5rem))] cursor-default overflow-auto rounded-2xl border border-white/10 bg-[#07111d]/95 p-4 shadow-2xl backdrop-blur"
                onPointerEnter={clearHover}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onPointerCancel={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-semibold text-white">{routeForm.mode === "create" ? "New Trade Route" : "Edit Trade Route"}</div>
                    <div className="mt-1 text-sm text-white/55">Click the map to add route points. Drag the visible handles to adjust the path.</div>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                    onClick={() => {
                      setRouteForm(null);
                      setActiveRouteAddId(null);
                      setPendingRouteStart(false);
                    }}
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/65 sm:col-span-2">
                    Route Name
                    <input className="input mt-1" value={routeForm.name} onChange={(event) => handleRouteNameChange(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65 sm:col-span-2">
                    Route ID
                    <input className="input mt-1 font-mono" value={routeForm.id} onChange={(event) => handleRouteIdChange(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Sector X
                    <input className="input mt-1" type="number" value={routeForm.sectorX} onChange={(event) => setRouteForm((current) => (current ? { ...current, sectorX: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Sector Y
                    <input className="input mt-1" type="number" value={routeForm.sectorY} onChange={(event) => setRouteForm((current) => (current ? { ...current, sectorY: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Endpoint A Name
                    <input className="input mt-1" value={routeForm.endpointAName} onChange={(event) => setRouteForm((current) => (current ? { ...current, endpointAName: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Endpoint B Name
                    <input className="input mt-1" value={routeForm.endpointBName} onChange={(event) => setRouteForm((current) => (current ? { ...current, endpointBName: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Width
                    <input className="input mt-1" type="number" value={routeForm.width} onChange={(event) => setRouteForm((current) => (current ? { ...current, width: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Speed Multiplier
                    <input className="input mt-1" type="number" step="0.1" value={routeForm.speedMultiplier} onChange={(event) => setRouteForm((current) => (current ? { ...current, speedMultiplier: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Fill Color
                    <input className="input mt-1 font-mono" value={routeForm.color} onChange={(event) => setRouteForm((current) => (current ? { ...current, color: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Border Color
                    <input className="input mt-1 font-mono" value={routeForm.borderColor} onChange={(event) => setRouteForm((current) => (current ? { ...current, borderColor: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Opacity
                    <input className="input mt-1" type="number" min="0" max="1" step="0.01" value={routeForm.opacity} onChange={(event) => setRouteForm((current) => (current ? { ...current, opacity: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65">
                    Border Pixels
                    <input className="input mt-1" type="number" min="0" value={routeForm.borderPx} onChange={(event) => setRouteForm((current) => (current ? { ...current, borderPx: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <label className="text-sm text-white/65 sm:col-span-2">
                    Smoothing Tension
                    <input className="input mt-1" type="number" min="0" max="1" step="0.01" value={routeForm.smoothingTension} onChange={(event) => setRouteForm((current) => (current ? { ...current, smoothingTension: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">Route Points</div>
                      <div className="text-xs text-white/45">{route?.points.length ?? 0} point{route?.points.length === 1 ? "" : "s"} placed</div>
                    </div>
                    <button
                      type="button"
                      className={`rounded border px-3 py-2 text-sm ${
                        isAddingPoints ? "border-emerald-300/45 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setPendingRouteStart(false);
                        setActiveRouteAddId((current) => (current === routeForm.originalId ? null : routeForm.originalId));
                      }}
                    >
                      {isAddingPoints ? "Stop Adding Points" : "Add Points"}
                    </button>
                  </div>
                  <div className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-white/60">
                    {route?.points.map((point, index) => (
                      <div key={`${routeIdentity(route)}:${index}:point-row`} className="flex justify-between gap-2 rounded border border-white/10 bg-white/[0.03] px-2 py-1">
                        <span>{index === 0 ? "A" : index === route.points.length - 1 ? "B" : `Via ${index}`}</span>
                        <span className="font-mono">{formatVec(point)}</span>
                      </div>
                    ))}
                    {!route ? <div className="text-white/45">Route not found on the map.</div> : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {route?.draft ? (
                    <button type="button" className="rounded border border-red-300/25 bg-red-400/10 px-4 py-2 text-sm text-red-100 hover:bg-red-400/15" onClick={() => removeDraftRoute(routeForm.originalId)}>
                      Remove Draft
                    </button>
                  ) : null}
                  <button type="button" className="rounded border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setRouteForm(null)}>
                    Done
                  </button>
                  <button type="button" className="btn-save-build" onClick={applyRouteForm}>
                    Apply Route Details
                  </button>
                </div>
              </div>
            );
          })()
        : null}

      {mobSpawnForm ? (
        <div
          data-system-map-ui="true"
          className="absolute inset-0 z-[130] flex cursor-default items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="max-h-[calc(100vh-2rem)] w-[min(760px,calc(100vw-2rem))] overflow-auto rounded-2xl border border-white/10 bg-[#07111d] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">{mobSpawnForm.mode === "create" ? "Add Mob Spawn" : "Edit Mob Spawn"}</div>
                <div className="mt-1 text-sm text-white/55">Choose the mob, spawn count, local position, level band, rank, radius, and respawn cooldown.</div>
              </div>
              <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setMobSpawnForm(null)}>
                Cancel
              </button>
            </div>

            <div className="mt-5">
              <label className="text-sm text-white/65">
                Mob
                <input className="input mt-1" value={mobSpawnSearch} placeholder="Search mobs by name, ID, faction, or scene..." onChange={(event) => setMobSpawnSearch(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <div className="mt-3 max-h-64 space-y-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
                {filteredMobCatalog.map((mob) => {
                  const selected = mob.id === mobSpawnForm.mobId;
                  return (
                    <button
                      key={mob.id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${
                        selected ? "border-cyan-300/50 bg-cyan-300/12 text-cyan-50" : "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setMobSpawnForm((current) => (current ? { ...current, mobId: mob.id } : current));
                        setMobSpawnSearch(mob.displayName || mob.id);
                      }}
                    >
                      {mob.sprite ? <img src={safeIconSrc(mob.sprite, mob.id, mob.displayName)} alt="" className="h-12 w-12 rounded-lg border border-white/10 bg-black/30 object-contain" /> : <div className="h-12 w-12 rounded-lg border border-white/10 bg-black/30" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">{mob.displayName || mob.id}</span>
                        <span className="block truncate text-xs text-white/50">{mob.id}</span>
                        <span className="block truncate text-xs text-white/40">{mob.faction || "No faction"} {mob.scene ? `· ${mob.scene}` : ""}</span>
                      </span>
                      {selected ? <span className="rounded bg-cyan-300/15 px-2 py-1 text-xs text-cyan-100">Selected</span> : null}
                    </button>
                  );
                })}
                {!filteredMobCatalog.length ? <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No mobs match the current search.</div> : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="text-sm text-white/65">
                Count
                <input className="input mt-1" type="number" value={mobSpawnForm.count} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, count: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Radius
                <input className="input mt-1" type="number" value={mobSpawnForm.radius} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, radius: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Respawn Cooldown
                <input className="input mt-1" type="number" value={mobSpawnForm.respawnDelay} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, respawnDelay: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Local X
                <input className="input mt-1" type="number" value={mobSpawnForm.localX} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, localX: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Local Y
                <input className="input mt-1" type="number" value={mobSpawnForm.localY} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, localY: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Angle
                <input className="input mt-1" type="number" value={mobSpawnForm.angleDeg} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, angleDeg: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Level Min
                <input className="input mt-1" type="number" value={mobSpawnForm.levelMin} placeholder="optional" onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, levelMin: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Level Max
                <input className="input mt-1" type="number" value={mobSpawnForm.levelMax} placeholder="optional" onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, levelMax: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Rank
                <select className="input mt-1" value={mobSpawnForm.rank} onChange={(event) => setMobSpawnForm((current) => (current ? { ...current, rank: event.target.value } : current))}>
                  <option value="normal">Normal</option>
                  <option value="elite">Elite</option>
                </select>
              </label>
            </div>

            {(() => {
              const zone = mapZones.find((entry) => zoneIdentity(entry) === mobSpawnForm.zoneId);
              if (!zone) return null;
              const world = {
                x: zone.world.x + Number(mobSpawnForm.localX),
                y: zone.world.y + Number(mobSpawnForm.localY),
              };
              return (
                <div className="mt-4 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/55">
                  Zone: {zone.name || zone.id} · World: {Number.isFinite(world.x) && Number.isFinite(world.y) ? formatVec(world) : "invalid local coordinates"}
                </div>
              );
            })()}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setMobSpawnForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn-save-build" onClick={saveMobSpawnForm}>
                {mobSpawnForm.mode === "create" ? "Add Spawn To Zone" : "Apply Spawn Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {zoneForm ? (
        <div
          data-system-map-ui="true"
          className="absolute inset-0 z-[130] flex cursor-default items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="max-h-[calc(100vh-2rem)] w-[min(720px,calc(100vw-2rem))] overflow-auto rounded-2xl border border-white/10 bg-[#07111d] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">{zoneForm.mode === "create" ? "Add Zone Draft" : "Edit Zone Details"}</div>
                <div className="mt-1 text-sm text-white/55">{zoneForm.mode === "create" ? "This adds a draft to the map. Use the green save button to write it into Zones.json." : "Edit top-level zone details. Stages and mob placements stay unchanged."}</div>
              </div>
              <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setZoneForm(null)}>
                Cancel
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-white/65">
                Zone Name
                <input className="input mt-1" value={zoneForm.name} onChange={(event) => handleZoneNameChange(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Zone ID
                <input className="input mt-1 font-mono" value={zoneForm.id} onChange={(event) => handleZoneIdChange(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                World X
                <input className="input mt-1" type="number" value={zoneForm.worldX} onChange={(event) => setZoneForm((current) => (current ? { ...current, worldX: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                World Y
                <input className="input mt-1" type="number" value={zoneForm.worldY} onChange={(event) => setZoneForm((current) => (current ? { ...current, worldY: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Bounds Shape
                <select className="input mt-1" value={zoneForm.boundsShape} onChange={(event) => setZoneForm((current) => (current ? { ...current, boundsShape: event.target.value as ZoneDraftForm["boundsShape"] } : current))}>
                  <option value="ellipse">Ellipse</option>
                  <option value="rectangle">Rectangle</option>
                </select>
              </label>
              <label className="text-sm text-white/65">
                Activation Radius
                <input className="input mt-1" type="number" value={zoneForm.activationRadius} onChange={(event) => setZoneForm((current) => (current ? { ...current, activationRadius: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65 sm:col-span-2">
                POI Label
                <input className="input mt-1" value={zoneForm.poiLabel} placeholder="Optional map label override" onChange={(event) => setZoneForm((current) => (current ? { ...current, poiLabel: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Bounds Width
                <input className="input mt-1" type="number" value={zoneForm.boundsWidth} onChange={(event) => setZoneForm((current) => (current ? { ...current, boundsWidth: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <label className="text-sm text-white/65">
                Bounds Height
                <input className="input mt-1" type="number" value={zoneForm.boundsHeight} onChange={(event) => setZoneForm((current) => (current ? { ...current, boundsHeight: event.target.value } : current))} onFocus={(event) => event.currentTarget.select()} />
              </label>
            </div>

            {payload ? (
              <div className="mt-4 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/55">
                Will save as sector/local:{" "}
                {(() => {
                  const world = { x: Number(zoneForm.worldX), y: Number(zoneForm.worldY) };
                  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return "invalid coordinates";
                  const { sector, local } = worldToSectorLocal(world, payload.config.sectorSize, payload.config.sectorHalfExtent);
                  return `sector [${numberInputValue(sector.x)}, ${numberInputValue(sector.y)}], pos [${numberInputValue(local.x)}, ${numberInputValue(local.y)}]`;
                })()}
              </div>
            ) : null}

            {status ? (
              <div
                className={`mt-4 rounded border px-3 py-2 text-sm ${
                  status.tone === "success"
                    ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                    : status.tone === "error"
                      ? "border-red-400/25 bg-red-400/10 text-red-100"
                      : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                {status.message}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                <input type="checkbox" checked={zoneForm.active} onChange={(event) => setZoneForm((current) => (current ? { ...current, active: event.target.checked } : current))} />
                Active
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                <input type="checkbox" checked={zoneForm.showHudOnEnter} onChange={(event) => setZoneForm((current) => (current ? { ...current, showHudOnEnter: event.target.checked } : current))} />
                HUD
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                <input type="checkbox" checked={zoneForm.poiMap} onChange={(event) => setZoneForm((current) => (current ? { ...current, poiMap: event.target.checked } : current))} />
                POI
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                <input type="checkbox" checked={zoneForm.poiHidden} onChange={(event) => setZoneForm((current) => (current ? { ...current, poiHidden: event.target.checked } : current))} />
                Hidden
              </label>
              <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                <input type="checkbox" checked={zoneForm.activationRadiusBorder} onChange={(event) => setZoneForm((current) => (current ? { ...current, activationRadiusBorder: event.target.checked } : current))} />
                Radius Border
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setZoneForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn-save-build" onClick={saveZoneForm}>
                {zoneForm.mode === "create" ? "Add Draft To Map" : "Apply Zone Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hover ? (
        <div className="pointer-events-none absolute z-[110] max-w-sm rounded-xl border border-white/10 bg-[#08111f]/95 p-3 text-sm shadow-2xl backdrop-blur" style={{ left: Math.min(hover.x + 18, viewport.width - 360), top: Math.min(hover.y + 18, viewport.height - 260) }}>
          <div className="flex gap-3">
            {hover.icon ? <img src={hover.icon} alt="" className="h-14 w-14 rounded-lg border border-white/10 bg-black/30 object-contain" /> : null}
            <div className="min-w-0">
              <div className="font-semibold text-white">{hover.title}</div>
              <div className="text-xs text-white/55">{hover.subtitle}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs text-white/70">
            {hover.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
