"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { buildIconSrc } from "@lib/icon-src";
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

function computeWorldBounds(payload: SystemMapPayload): SystemMapRect {
  let bounds: SystemMapRect | null = null;
  for (const sector of payload.sectors) {
    bounds = mergeRect(bounds, sector.rect);
  }
  for (const zone of payload.zones) {
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

  const bounds = useMemo(() => (payload ? computeWorldBounds(payload) : null), [payload]);

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
    if (event.button !== 0) return;
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
    dragRef.current = null;
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
      for (const zone of payload.zones) {
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
      for (const zone of payload.zones) {
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
      for (const zone of payload.zones) {
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
      for (const zone of payload.zones) {
        if (!zoneMatches(zone, normalizedQuery)) continue;
        if (pointInZoneBounds(world, zone) || distance(world, zone.world) <= screenHitRadius) {
          return {
            x: screen.x,
            y: screen.y,
            title: zone.name || zone.id,
            subtitle: `${zone.active ? "Active" : "Inactive"} zone · sector ${zone.sector.x}, ${zone.sector.y}`,
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

  const filteredZones = payload?.zones.filter((zone) => zoneMatches(zone, normalizedQuery)) ?? [];
  const filteredPois = payload?.pois.filter((poi) => poiMatches(poi, normalizedQuery)) ?? [];
  const filteredRoutes = payload?.routes.filter((route) => routeMatches(route, normalizedQuery)) ?? [];
  const sceneMobCount = payload?.zones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneSpawns.length, 0), 0) ?? 0;
  const sceneBarrierCount = payload?.zones.reduce((sum, zone) => sum + zone.mobs.reduce((mobSum, mob) => mobSum + mob.sceneBarriers.length, 0), 0) ?? 0;
  const zoneMobCount = payload?.zones.reduce((sum, zone) => sum + zone.mobs.length, 0) ?? 0;

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
                  const zoneColor = zone.active ? "rgba(34,211,238,0.55)" : "rgba(148,163,184,0.36)";
                  return (
                    <g key={zone.id}>
                      {zone.bounds.shape.toLowerCase() === "rect" || zone.bounds.shape.toLowerCase() === "rectangle" ? (
                        <rect
                          x={zone.world.x - zone.bounds.width / 2}
                          y={zone.world.y - zone.bounds.height / 2}
                          width={zone.bounds.width}
                          height={zone.bounds.height}
                          fill={zone.active ? "rgba(34,211,238,0.055)" : "rgba(148,163,184,0.035)"}
                          stroke={zoneColor}
                          strokeWidth={2 / camera.zoom}
                        />
                      ) : (
                        <ellipse
                          cx={zone.world.x}
                          cy={zone.world.y}
                          rx={zone.bounds.width / 2}
                          ry={zone.bounds.height / 2}
                          fill={zone.active ? "rgba(34,211,238,0.055)" : "rgba(148,163,184,0.035)"}
                          stroke={zoneColor}
                          strokeWidth={2 / camera.zoom}
                        />
                      )}
                      <circle cx={zone.world.x} cy={zone.world.y} r={6 / camera.zoom} fill={zone.active ? "#22d3ee" : "#94a3b8"} />
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
                  <div key={`${zone.id}:label`} className="absolute translate-x-3 -translate-y-1/2 whitespace-nowrap rounded border border-cyan-300/20 bg-[#061524]/80 px-2 py-1 text-xs text-cyan-100 shadow-lg" style={{ left: point.x, top: point.y }}>
                    {zone.name}
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
              {payload ? `${payload.zones.length} zones · ${payload.pois.length} POIs · ${zoneMobCount} zone mob rows · ${sceneMobCount} scene markers · ${sceneBarrierCount} barriers` : "Loading local game source..."}
            </div>
          </div>
          <div className="flex gap-2">
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

        <div className="mt-4 text-xs leading-5 text-white/45">Drag to pan. Scroll to zoom fluidly around the cursor. Hover any marker, zone, stage, route, sector, or environment band for details.</div>
      </div>

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
