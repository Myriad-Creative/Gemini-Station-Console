"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { buildIconSrc } from "@lib/icon-src";
import { createUniqueId } from "@lib/data-tools/common";
import type {
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
import type { ZoneDraft, ZonesManagerWorkspace } from "@lib/zones-manager/types";
import { createBlankZone, importZonesManagerWorkspace } from "@lib/zones-manager/utils";

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
};
type ZoneDraftForm = {
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
};
type ZonePositionForm = {
  id: string;
  name: string;
  worldX: string;
  worldY: string;
};
type ZoneDragState = {
  zoneId: string;
  startScreen: SystemMapVec;
  startWorld: SystemMapVec;
  zoneStartWorld: SystemMapVec;
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

function numberInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
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

function computeWorldBounds(payload: SystemMapPayload, zones: SystemMapZone[] = payload.zones): SystemMapRect {
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
  for (const route of payload.routes) {
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
    poiLabel: "",
    sector,
    local,
    world,
    activationRadius: Number(form.activationRadius),
    activationRadiusBorder: false,
    bounds: {
      shape: form.boundsShape,
      width: Number(form.boundsWidth),
      height: Number(form.boundsHeight),
    },
    stages: [],
    mobs: [],
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
    mobs: [],
  };
}

function applyZonePositionToManagerDraft(draft: ZoneDraft, zone: SystemMapZone): ZoneDraft {
  return {
    ...draft,
    sectorX: numberInputValue(zone.sector.x),
    sectorY: numberInputValue(zone.sector.y),
    posX: numberInputValue(zone.local.x),
    posY: numberInputValue(zone.local.y),
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

function zoneMatches(zone: SystemMapZone, query: string) {
  if (!query) return true;
  return [zone.id, zone.name, zone.poiLabel, zone.sector.x, zone.sector.y].join(" ").toLowerCase().includes(query);
}

function poiMatches(poi: SystemMapPoi, query: string) {
  if (!query) return true;
  return [poi.id, poi.name, poi.type, poi.source].join(" ").toLowerCase().includes(query);
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneDraftForm | null>(null);
  const [zonePositionForm, setZonePositionForm] = useState<ZonePositionForm | null>(null);
  const [zoneIdManuallyEdited, setZoneIdManuallyEdited] = useState(false);
  const [editedZoneIds, setEditedZoneIds] = useState<string[]>([]);
  const [draggingZoneId, setDraggingZoneId] = useState<string | null>(null);
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [savingZones, setSavingZones] = useState(false);
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
  const existingZoneIds = useMemo(() => mapZones.map((zone) => zone.id).filter(Boolean), [mapZones]);
  const bounds = useMemo(() => (payload ? computeWorldBounds(payload, mapZones) : null), [mapZones, payload]);

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

    const existingZone = payload.zones.find((zone) => zone.id === zoneId);
    if (!existingZone) return;
    const movedZone = moveZoneToWorld(existingZone, roundedWorld, payload);
    setPayload((current) =>
      current
        ? {
            ...current,
            zones: current.zones.map((zone) => (zone.id === zoneId ? movedZone : zone)),
            pois: current.pois.map((poi) =>
              poi.source === "zone" && poi.zoneId === zoneId
                ? {
                    ...poi,
                    sector: movedZone.sector,
                    local: movedZone.local,
                    world: movedZone.world,
                  }
                : poi,
            ),
          }
        : current,
    );
    setEditedZoneIds((current) => (current.includes(zoneId) ? current : [...current, zoneId]));
  }

  function openZonePositionEditor(zone: SystemMapZone) {
    setZonePositionForm({
      id: zone.id,
      name: zone.name || zone.id,
      worldX: numberInputValue(zone.world.x),
      worldY: numberInputValue(zone.world.y),
    });
    setContextMenu(null);
    setStatus(null);
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
      openZonePositionEditor(targetZone);
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
    const zoneDrag = zoneDragRef.current;
    if (zoneDrag?.moved) {
      const zone = mapZones.find((entry) => entry.id === zoneDrag.zoneId);
      setStatus({ tone: "success", message: `Moved "${zone?.name || zoneDrag.zoneId}". Use Save Zone Changes To Build to write the new coordinates into Zones.json.` });
    }
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
    setContextMenu({
      x: screen.x,
      y: screen.y,
      world: screenToWorld(screen),
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
      for (const route of payload.routes) {
        if (!routeMatches(route, normalizedQuery)) continue;
        for (let index = 1; index < route.points.length; index += 1) {
          if (pointToSegmentDistance(world, route.points[index - 1], route.points[index]) <= Math.max(2500, 8 / camera.zoom)) {
            return {
              x: screen.x,
              y: screen.y,
              title: route.name || route.id,
              subtitle: `Trade route · sector ${route.sector.x}, ${route.sector.y}`,
              lines: [
                `Route ID: ${route.id}`,
                `From: ${route.endpointAName}`,
                `To: ${route.endpointBName}`,
                `Width: ${formatNumber(route.width)}`,
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
    });
    setZoneIdManuallyEdited(false);
    setContextMenu(null);
    setStatus(null);
  }

  function handleZoneNameChange(name: string) {
    setZoneForm((current) => {
      if (!current) return current;
      return {
        ...current,
        name,
        id: zoneIdManuallyEdited ? current.id : createUniqueId(sanitizeZoneId(name), existingZoneIds),
      };
    });
  }

  function handleZoneIdChange(id: string) {
    setZoneIdManuallyEdited(true);
    setZoneForm((current) => (current ? { ...current, id: sanitizeZoneId(id) } : current));
  }

  function saveZoneDraftFromForm() {
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
    if (existingZoneIds.includes(id)) {
      setStatus({ tone: "error", message: `Zone ID "${id}" already exists. Change the ID before adding this draft.` });
      return;
    }

    const zone = zoneFromDraftForm({ ...zoneForm, id, worldX: numberInputValue(worldX), worldY: numberInputValue(worldY) }, payload, id);
    setDraftZones((current) => [...current, zone]);
    setZoneForm(null);
    setStatus({ tone: "success", message: `Added draft zone "${zone.name}". Use Save Zone Changes To Build to write it into Zones.json.` });
  }

  function saveZonePositionForm() {
    if (!zonePositionForm) return;
    const world = {
      x: Number(zonePositionForm.worldX),
      y: Number(zonePositionForm.worldY),
    };
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) {
      setStatus({ tone: "error", message: "Zone X and Y coordinates must be valid numbers." });
      return;
    }
    updateZonePosition(zonePositionForm.id, world);
    setZonePositionForm(null);
    setStatus({ tone: "success", message: `Updated "${zonePositionForm.name}" coordinates. Use Save Zone Changes To Build to write them into Zones.json.` });
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
      const editedZones = mapZones.filter((zone) => !zone.draft && editedZoneIds.includes(zone.id));
      const updatedExistingZones = workspace.zones.map((draft) => {
        const editedZone = editedZones.find((zone) => zone.id === draft.id);
        return editedZone ? applyZonePositionToManagerDraft(draft, editedZone) : draft;
      });
      const existingIds = workspace.zones.map((zone) => zone.id);
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
      }));
      setPayload((current) =>
        current
          ? {
              ...current,
              zones: [...current.zones.map((zone) => ({ ...zone, modified: false })), ...savedZones],
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

  const filteredZones = mapZones.filter((zone) => zoneMatches(zone, normalizedQuery));
  const filteredPois = payload?.pois.filter((poi) => poiMatches(poi, normalizedQuery)) ?? [];
  const filteredRoutes = payload?.routes.filter((route) => routeMatches(route, normalizedQuery)) ?? [];
  const sceneMobCount = mapZones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneSpawns.length, 0), 0);
  const sceneBarrierCount = mapZones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneBarriers.length, 0), 0);
  const zoneMobCount = mapZones.reduce((sum, zone) => sum + zone.mobs.length, 0);
  const hasZoneChanges = draftZones.length > 0 || editedZoneIds.length > 0;

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
              ? filteredRoutes.map((route) => (
                  <polyline
                    key={route.id}
                    points={route.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={route.color || "#38bdf8"}
                    strokeOpacity={Math.max(0.18, route.opacity)}
                    strokeWidth={Math.max(route.width, 700)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))
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
                    const items: JSX.Element[] = [
                      <g key={`${zone.id}:${mob.mobId}:${mob.local.x}:${mob.local.y}:spawn`}>
                        {mob.radius > 0 ? (
                          <circle
                            cx={mob.world.x}
                            cy={mob.world.y}
                            r={mob.radius}
                            fill="rgba(248,113,113,0.055)"
                            stroke="rgba(248,113,113,0.45)"
                            strokeWidth={1.5 / camera.zoom}
                          />
                        ) : null}
                        <circle cx={mob.world.x} cy={mob.world.y} r={6 / camera.zoom} fill={mob.missing ? "#ef4444" : "#fb7185"} stroke="rgba(255,255,255,0.75)" strokeWidth={1 / camera.zoom} />
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
                ? `${mapZones.length} zones${draftZones.length ? ` (${draftZones.length} draft${draftZones.length === 1 ? "" : "s"})` : ""} · ${payload.pois.length} POIs · ${zoneMobCount} zone mob rows · ${sceneMobCount} scene markers · ${sceneBarrierCount} barriers`
                : "Loading local game source..."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-save-build disabled:cursor-default disabled:opacity-40" disabled={!hasZoneChanges || savingZones} onClick={() => void handleSaveZoneChangesToBuild()}>
              {savingZones ? "Saving..." : "Save Zone Changes To Build"}
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
            <div className="text-white">{payload ? `${filteredZones.length} zones` : "0 zones"}</div>
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

        <div className="mt-4 text-xs leading-5 text-white/45">Drag to pan. Scroll to zoom fluidly around the cursor. Click a zone to edit coordinates. Hold Command and drag a zone to move it. Right-click the map to add a zone draft.</div>
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
          <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-white hover:bg-white/10" onClick={() => openCreateZoneForm(contextMenu.world)}>
            Add Zone Here
          </button>
        </div>
      ) : null}

      {zonePositionForm ? (
        <div
          data-system-map-ui="true"
          className="absolute inset-0 z-[130] flex cursor-default items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#07111d] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">Edit Zone Coordinates</div>
                <div className="mt-1 text-sm text-white/55">{zonePositionForm.name}</div>
              </div>
              <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setZonePositionForm(null)}>
                Cancel
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-white/65">
                World X
                <input
                  className="input mt-1"
                  type="number"
                  value={zonePositionForm.worldX}
                  onChange={(event) => setZonePositionForm((current) => (current ? { ...current, worldX: event.target.value } : current))}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <label className="text-sm text-white/65">
                World Y
                <input
                  className="input mt-1"
                  type="number"
                  value={zonePositionForm.worldY}
                  onChange={(event) => setZonePositionForm((current) => (current ? { ...current, worldY: event.target.value } : current))}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            </div>

            {payload ? (
              <div className="mt-4 rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/55">
                Will save as sector/local:{" "}
                {(() => {
                  const world = { x: Number(zonePositionForm.worldX), y: Number(zonePositionForm.worldY) };
                  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return "invalid coordinates";
                  const { sector, local } = worldToSectorLocal(world, payload.config.sectorSize, payload.config.sectorHalfExtent);
                  return `sector [${numberInputValue(sector.x)}, ${numberInputValue(sector.y)}], pos [${numberInputValue(local.x)}, ${numberInputValue(local.y)}]`;
                })()}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setZonePositionForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn-save-build" onClick={saveZonePositionForm}>
                Apply Coordinates
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
          <div className="w-[min(620px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#07111d] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">Add Zone Draft</div>
                <div className="mt-1 text-sm text-white/55">This adds a draft to the map. Use the green save button to write it into Zones.json.</div>
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
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5" onClick={() => setZoneForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn-save-build" onClick={saveZoneDraftFromForm}>
                Add Draft To Map
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
