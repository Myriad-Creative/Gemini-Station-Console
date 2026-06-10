"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ShipThrusterDraft, ShipWeaponChargePointDraft } from "@lib/ship-lab/types";
import { createShipThrusterDraft, createShipWeaponChargePointDraft, formatPlacementNumber } from "@lib/ship-lab/utils";

export type SpriteScale = {
  x: number;
  y: number;
};

type PlacementKind = "thruster" | "weapon_charge";
type PlacementSelection = {
  kind: PlacementKind;
  key: string;
};

type PlacementEntity = {
  id: string;
  displayName: string;
  spriteScale: SpriteScale | null;
  spriteScaleSource: string;
};

function parsePlacementNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampZoom(value: number) {
  return Math.min(4, Math.max(0.5, value));
}

function normalizedPlacementScale(scale: SpriteScale | null | undefined): SpriteScale {
  return {
    x: Math.abs(scale?.x ?? 1) || 1,
    y: Math.abs(scale?.y ?? 1) || 1,
  };
}

function formatSpriteScale(scale: SpriteScale) {
  return `${Number(scale.x.toFixed(3))} x ${Number(scale.y.toFixed(3))}`;
}

function selectInputContents(event: { currentTarget: HTMLInputElement }) {
  event.currentTarget.select();
}

function ThrusterPlume({ thruster, selected }: { thruster: ShipThrusterDraft; selected: boolean }) {
  const scaleX = Math.max(0.12, parsePlacementNumber(thruster.scale_x, 1));
  const scaleY = Math.max(0.12, parsePlacementNumber(thruster.scale_y, 1));
  const rotation = parsePlacementNumber(thruster.rotation_degrees, 0);
  return (
    <div className="relative h-10 w-10">
      <div
        className={`absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
          selected ? "border-cyan-100 bg-cyan-100" : "border-cyan-200/70 bg-cyan-200/70"
        } shadow-[0_0_18px_rgba(103,232,249,0.7)]`}
      />
      <svg
        viewBox="-24 -12 48 88"
        className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-12"
        style={{
          transform: `translate(-50%, -12%) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
          transformOrigin: "50% 12%",
          opacity: thruster.enabled ? 1 : 0.35,
        }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`ship-thruster-core-${thruster.key}`} cx="50%" cy="6%" r="58%">
            <stop offset="0%" stopColor="#f8ffff" stopOpacity="1" />
            <stop offset="42%" stopColor="#8ff7ff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`ship-thruster-tail-${thruster.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eaffff" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#67e8f9" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 0 -4 C 18 14 13 46 0 76 C -13 46 -18 14 0 -4 Z" fill={`url(#ship-thruster-tail-${thruster.key})`} />
        <ellipse cx="0" cy="4" rx="15" ry="11" fill={`url(#ship-thruster-core-${thruster.key})`} />
        <path d="M 0 4 C 7 18 5 38 0 58 C -5 38 -7 18 0 4 Z" fill="#f8ffff" opacity="0.72" />
      </svg>
    </div>
  );
}

function WeaponChargePointMarker({ point, selected }: { point: ShipWeaponChargePointDraft; selected: boolean }) {
  const scaleX = Math.max(0.12, parsePlacementNumber(point.scale_x, 1));
  const scaleY = Math.max(0.12, parsePlacementNumber(point.scale_y, 1));
  return (
    <div className="relative h-12 w-12">
      <div
        className={`absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
          selected ? "border-amber-100 bg-amber-100" : "border-amber-200/80 bg-amber-300/70"
        } shadow-[0_0_20px_rgba(251,191,36,0.75)]`}
      />
      <svg
        viewBox="-32 -32 64 64"
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16"
        style={{
          transform: `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`,
          opacity: point.enabled ? 1 : 0.35,
        }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`ship-weapon-charge-core-${point.key}`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#fff7ed" stopOpacity="1" />
            <stop offset="45%" stopColor="#fbbf24" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="24" fill={`url(#ship-weapon-charge-core-${point.key})`} />
        <path d="M 0 -29 L 0 -16 M 0 16 L 0 29 M -29 0 L -16 0 M 16 0 L 29 0" stroke="#fde68a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="0" cy="0" r="13" fill="none" stroke="#fff7ed" strokeWidth="2" opacity="0.78" />
      </svg>
    </div>
  );
}

export default function ShipPlacementEditor({
  entity,
  spriteSrc,
  thrusters,
  weaponChargePoints,
  onThrustersChange,
  onWeaponChargePointsChange,
}: {
  entity: PlacementEntity;
  spriteSrc: string | null;
  thrusters: ShipThrusterDraft[];
  weaponChargePoints: ShipWeaponChargePointDraft[];
  onThrustersChange: (next: ShipThrusterDraft[]) => void;
  onWeaponChargePointsChange: (next: ShipWeaponChargePointDraft[]) => void;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ width: 720, height: 440 });
  const [imageSize, setImageSize] = useState({ width: 512, height: 512 });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [placementMode, setPlacementMode] = useState<PlacementKind>("thruster");
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementSelection | null>(
    thrusters[0] ? { kind: "thruster", key: thrusters[0].key } : weaponChargePoints[0] ? { kind: "weapon_charge", key: weaponChargePoints[0].key } : null,
  );
  const [draggingPlacement, setDraggingPlacement] = useState<PlacementSelection | null>(null);
  const [panning, setPanning] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setViewSize({
        width: Math.max(320, rect.width),
        height: Math.max(320, rect.height),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const selectedExists =
      selectedPlacement?.kind === "thruster"
        ? thrusters.some((thruster) => thruster.key === selectedPlacement.key)
        : selectedPlacement?.kind === "weapon_charge"
          ? weaponChargePoints.some((point) => point.key === selectedPlacement.key)
          : false;
    if (selectedExists) return;
    if (thrusters.length) {
      setSelectedPlacement({ kind: "thruster", key: thrusters[0].key });
      return;
    }
    if (weaponChargePoints.length) {
      setSelectedPlacement({ kind: "weapon_charge", key: weaponChargePoints[0].key });
      return;
    }
    setSelectedPlacement(null);
  }, [thrusters, weaponChargePoints, selectedPlacement]);

  const runtimeSpriteScale = normalizedPlacementScale(entity.spriteScale);
  const layout = useMemo(() => {
    const padding = 34;
    const runtimeSpriteWidth = imageSize.width * runtimeSpriteScale.x;
    const runtimeSpriteHeight = imageSize.height * runtimeSpriteScale.y;
    const availableWidth = Math.max(1, viewSize.width - padding * 2);
    const availableHeight = Math.max(1, viewSize.height - padding * 2);
    const scale = Math.min(availableWidth / runtimeSpriteWidth, availableHeight / runtimeSpriteHeight) * zoom;
    const imageWidth = runtimeSpriteWidth * scale;
    const imageHeight = runtimeSpriteHeight * scale;
    return {
      scale,
      originX: viewSize.width / 2 + panOffset.x,
      originY: viewSize.height / 2 + panOffset.y,
      imageWidth,
      imageHeight,
    };
  }, [imageSize.height, imageSize.width, panOffset.x, panOffset.y, runtimeSpriteScale.x, runtimeSpriteScale.y, viewSize.height, viewSize.width, zoom]);

  const selectedThruster = selectedPlacement?.kind === "thruster" ? thrusters.find((thruster) => thruster.key === selectedPlacement.key) ?? null : null;
  const selectedWeaponChargePoint =
    selectedPlacement?.kind === "weapon_charge" ? weaponChargePoints.find((point) => point.key === selectedPlacement.key) ?? null : null;
  const zoomPercent = Math.round(zoom * 100);

  function updateThruster(key: string, updater: (current: ShipThrusterDraft) => ShipThrusterDraft) {
    onThrustersChange(thrusters.map((thruster) => (thruster.key === key ? updater(thruster) : thruster)));
  }

  function updateWeaponChargePoint(key: string, updater: (current: ShipWeaponChargePointDraft) => ShipWeaponChargePointDraft) {
    onWeaponChargePointsChange(weaponChargePoints.map((point) => (point.key === key ? updater(point) : point)));
  }

  function changeZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = viewRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - layout.originX) / layout.scale,
      y: (clientY - rect.top - layout.originY) / layout.scale,
    };
  }

  function movePlacementFromPointer(placement: PlacementSelection, clientX: number, clientY: number) {
    const nextPosition = screenToWorld(clientX, clientY);
    if (placement.kind === "thruster") {
      updateThruster(placement.key, (current) => ({
        ...current,
        position_x: formatPlacementNumber(nextPosition.x),
        position_y: formatPlacementNumber(nextPosition.y),
      }));
      return;
    }
    updateWeaponChargePoint(placement.key, (current) => ({
      ...current,
      position_x: formatPlacementNumber(nextPosition.x),
      position_y: formatPlacementNumber(nextPosition.y),
    }));
  }

  function moveFrameFromPointer(clientX: number, clientY: number) {
    if (!panning) return;
    setPanOffset({
      x: panning.originX + clientX - panning.startX,
      y: panning.originY + clientY - panning.startY,
    });
  }

  function addThrusterAt(clientX?: number, clientY?: number) {
    const position = clientX !== undefined && clientY !== undefined ? screenToWorld(clientX, clientY) : { x: 0, y: imageSize.height * 0.28 };
    const nextThruster = createShipThrusterDraft(position.x, position.y);
    onThrustersChange([...thrusters, nextThruster]);
    setPlacementMode("thruster");
    setSelectedPlacement({ kind: "thruster", key: nextThruster.key });
  }

  function addWeaponChargePointAt(clientX?: number, clientY?: number) {
    const position = clientX !== undefined && clientY !== undefined ? screenToWorld(clientX, clientY) : { x: 0, y: -imageSize.height * 0.23 };
    const nextPoint = createShipWeaponChargePointDraft(position.x, position.y);
    onWeaponChargePointsChange([...weaponChargePoints, nextPoint]);
    setPlacementMode("weapon_charge");
    setSelectedPlacement({ kind: "weapon_charge", key: nextPoint.key });
  }

  function addPlacementAt(clientX?: number, clientY?: number) {
    if (placementMode === "weapon_charge") addWeaponChargePointAt(clientX, clientY);
    else addThrusterAt(clientX, clientY);
  }

  function removeThruster(key: string) {
    const nextThrusters = thrusters.filter((thruster) => thruster.key !== key);
    onThrustersChange(nextThrusters);
    setSelectedPlacement(nextThrusters[0] ? { kind: "thruster", key: nextThrusters[0].key } : weaponChargePoints[0] ? { kind: "weapon_charge", key: weaponChargePoints[0].key } : null);
  }

  function removeWeaponChargePoint(key: string) {
    const nextPoints = weaponChargePoints.filter((point) => point.key !== key);
    onWeaponChargePointsChange(nextPoints);
    setSelectedPlacement(nextPoints[0] ? { kind: "weapon_charge", key: nextPoints[0].key } : thrusters[0] ? { kind: "thruster", key: thrusters[0].key } : null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">Visual Thruster and Weapon Charge Placement</div>
          <div className="mt-1 text-xs text-white/50">
            Drag a plume or charge marker to move it. Double-click the canvas to add the selected placement type. Preview uses {entity.spriteScaleSource} {formatSpriteScale(runtimeSpriteScale)}.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
            <button
              type="button"
              className={`rounded px-3 py-1.5 ${placementMode === "thruster" ? "bg-cyan-300/15 text-cyan-100" : "text-white/55 hover:bg-white/5"}`}
              onClick={() => setPlacementMode("thruster")}
            >
              Thrusters
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 ${placementMode === "weapon_charge" ? "bg-amber-300/15 text-amber-100" : "text-white/55 hover:bg-white/5"}`}
              onClick={() => setPlacementMode("weapon_charge")}
            >
              Weapon Charge
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
            <button
              type="button"
              className="h-8 w-8 rounded border border-white/10 text-sm font-semibold text-white/75 hover:bg-white/5 disabled:cursor-default disabled:opacity-35"
              disabled={zoom <= 0.5}
              onClick={() => changeZoom(zoom - 0.25)}
              title="Zoom out"
            >
              -
            </button>
            <input className="h-2 w-28 accent-cyan-300" type="range" min="0.5" max="4" step="0.05" value={zoom} aria-label="Ship placement editor zoom" onChange={(event) => changeZoom(Number(event.target.value))} />
            <button
              type="button"
              className="h-8 w-8 rounded border border-white/10 text-sm font-semibold text-white/75 hover:bg-white/5 disabled:cursor-default disabled:opacity-35"
              disabled={zoom >= 4}
              onClick={() => changeZoom(zoom + 0.25)}
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="rounded border border-white/10 px-2 py-1 text-xs text-white/65 hover:bg-white/5"
              onClick={() => {
                changeZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
            >
              {zoomPercent}%
            </button>
          </div>
          <button type="button" className="rounded border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/15" onClick={() => addThrusterAt()}>
            Add Thruster
          </button>
          <button type="button" className="rounded border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/15" onClick={() => addWeaponChargePointAt()}>
            Add Weapon Charge
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div
          ref={viewRef}
          className={`relative h-[440px] overflow-hidden rounded-xl border border-white/10 bg-[#050b13] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_58%)] ${
            panning ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setPanning({
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: panOffset.x,
              originY: panOffset.y,
            });
          }}
          onPointerMove={(event) => {
            if (draggingPlacement) {
              movePlacementFromPointer(draggingPlacement, event.clientX, event.clientY);
              return;
            }
            moveFrameFromPointer(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            setDraggingPlacement(null);
            setPanning(null);
          }}
          onPointerCancel={() => {
            setDraggingPlacement(null);
            setPanning(null);
          }}
          onDoubleClick={(event) => addPlacementAt(event.clientX, event.clientY)}
        >
          <div
            className="pointer-events-none absolute border border-cyan-300/15"
            style={{ left: layout.originX - layout.imageWidth / 2, top: layout.originY - layout.imageHeight / 2, width: layout.imageWidth, height: layout.imageHeight }}
          />
          <div className="pointer-events-none absolute left-0 right-0 border-t border-white/10" style={{ top: layout.originY }} />
          <div className="pointer-events-none absolute bottom-0 top-0 border-l border-white/10" style={{ left: layout.originX }} />
          {spriteSrc ? (
            <img
              src={spriteSrc}
              alt={entity.displayName || entity.id || "Ship sprite"}
              className="pointer-events-none absolute object-contain opacity-90 drop-shadow-[0_0_18px_rgba(103,232,249,0.18)]"
              style={{ left: layout.originX - layout.imageWidth / 2, top: layout.originY - layout.imageHeight / 2, width: layout.imageWidth, height: layout.imageHeight }}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/45">Add a sprite path to use the visual placement canvas.</div>
          )}

          {thrusters.map((thruster, index) => {
            const x = parsePlacementNumber(thruster.position_x, 0);
            const y = parsePlacementNumber(thruster.position_y, 0);
            const left = layout.originX + x * layout.scale;
            const top = layout.originY + y * layout.scale;
            const isSelected = selectedPlacement?.kind === "thruster" && thruster.key === selectedPlacement.key;
            return (
              <button
                key={thruster.key}
                type="button"
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition ${
                  isSelected ? "ring-2 ring-cyan-200 ring-offset-2 ring-offset-[#050b13]" : "hover:ring-2 hover:ring-cyan-300/45"
                }`}
                style={{ left, top }}
                title={`Thruster ${index + 1}: ${formatPlacementNumber(x)}, ${formatPlacementNumber(y)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPlacementMode("thruster");
                  setSelectedPlacement({ kind: "thruster", key: thruster.key });
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setPlacementMode("thruster");
                  setSelectedPlacement({ kind: "thruster", key: thruster.key });
                  setDraggingPlacement({ kind: "thruster", key: thruster.key });
                  setPanning(null);
                }}
              >
                <ThrusterPlume thruster={thruster} selected={isSelected} />
              </button>
            );
          })}

          {weaponChargePoints.map((point, index) => {
            const x = parsePlacementNumber(point.position_x, 0);
            const y = parsePlacementNumber(point.position_y, 0);
            const left = layout.originX + x * layout.scale;
            const top = layout.originY + y * layout.scale;
            const isSelected = selectedPlacement?.kind === "weapon_charge" && point.key === selectedPlacement.key;
            return (
              <button
                key={point.key}
                type="button"
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition ${
                  isSelected ? "ring-2 ring-amber-200 ring-offset-2 ring-offset-[#050b13]" : "hover:ring-2 hover:ring-amber-300/45"
                }`}
                style={{ left, top }}
                title={`Weapon charge ${index + 1}: ${formatPlacementNumber(x)}, ${formatPlacementNumber(y)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPlacementMode("weapon_charge");
                  setSelectedPlacement({ kind: "weapon_charge", key: point.key });
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setPlacementMode("weapon_charge");
                  setSelectedPlacement({ kind: "weapon_charge", key: point.key });
                  setDraggingPlacement({ kind: "weapon_charge", key: point.key });
                  setPanning(null);
                }}
              >
                <WeaponChargePointMarker point={point} selected={isSelected} />
              </button>
            );
          })}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-white/45">origin 0,0</div>
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-black/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Placement Points</div>
              <div className="mt-1 text-xs text-white/45">
                {thrusters.length} thruster{thrusters.length === 1 ? "" : "s"} and {weaponChargePoints.length} weapon charge point{weaponChargePoints.length === 1 ? "" : "s"}. Positive Y is down the sprite.
              </div>
            </div>
            {selectedThruster ? (
              <button type="button" className="shrink-0 rounded border border-red-400/25 px-3 py-2 text-xs text-red-100 hover:bg-red-400/10" onClick={() => removeThruster(selectedThruster.key)}>
                Remove
              </button>
            ) : selectedWeaponChargePoint ? (
              <button type="button" className="shrink-0 rounded border border-red-400/25 px-3 py-2 text-xs text-red-100 hover:bg-red-400/10" onClick={() => removeWeaponChargePoint(selectedWeaponChargePoint.key)}>
                Remove
              </button>
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <div className="label">Thrusters</div>
              {thrusters.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {thrusters.map((thruster, index) => (
                    <button
                      key={thruster.key}
                      type="button"
                      className={`rounded border px-3 py-1.5 text-xs ${
                        selectedPlacement?.kind === "thruster" && selectedPlacement.key === thruster.key ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-white/65 hover:bg-white/5"
                      }`}
                      onClick={() => {
                        setPlacementMode("thruster");
                        setSelectedPlacement({ kind: "thruster", key: thruster.key });
                      }}
                    >
                      Thruster {index + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-sm text-white/45">No thrusters configured for this ship yet.</div>
              )}
            </div>
            <div>
              <div className="label">Weapon Charge Points</div>
              {weaponChargePoints.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {weaponChargePoints.map((point, index) => (
                    <button
                      key={point.key}
                      type="button"
                      className={`rounded border px-3 py-1.5 text-xs ${
                        selectedPlacement?.kind === "weapon_charge" && selectedPlacement.key === point.key ? "border-amber-300/60 bg-amber-300/10 text-amber-100" : "border-white/10 text-white/65 hover:bg-white/5"
                      }`}
                      onClick={() => {
                        setPlacementMode("weapon_charge");
                        setSelectedPlacement({ kind: "weapon_charge", key: point.key });
                      }}
                    >
                      Charge {index + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-sm text-white/45">No weapon charge points configured for this ship yet.</div>
              )}
            </div>
          </div>

          {selectedThruster ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Position X", "position_x", "1"],
                ["Position Y", "position_y", "1"],
                ["Scale X", "scale_x", "0.05"],
                ["Scale Y", "scale_y", "0.05"],
                ["Rotation", "rotation_degrees", "1"],
                ["Z Index", "z_index", "1"],
                ["Velocity Threshold", "velocity_threshold", "0.5"],
              ].map(([label, field, step]) => (
                <label key={field} className={field === "velocity_threshold" ? "sm:col-span-2" : ""}>
                  <div className="label">{label}</div>
                  <input
                    className="input mt-1"
                    type="number"
                    step={step}
                    value={selectedThruster[field as keyof Pick<ShipThrusterDraft, "position_x" | "position_y" | "scale_x" | "scale_y" | "rotation_degrees" | "z_index" | "velocity_threshold">]}
                    onFocus={selectInputContents}
                    onChange={(event) => updateThruster(selectedThruster.key, (current) => ({ ...current, [field]: event.target.value }))}
                  />
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 sm:col-span-2">
                <span>Enabled</span>
                <input type="checkbox" className="h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25" checked={selectedThruster.enabled} onChange={(event) => updateThruster(selectedThruster.key, (current) => ({ ...current, enabled: event.target.checked }))} />
              </label>
            </div>
          ) : selectedWeaponChargePoint ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Position X", "position_x", "1"],
                ["Position Y", "position_y", "1"],
                ["Scale X", "scale_x", "0.05"],
                ["Scale Y", "scale_y", "0.05"],
                ["Z Index", "z_index", "1"],
              ].map(([label, field, step]) => (
                <label key={field} className={field === "z_index" ? "sm:col-span-2" : ""}>
                  <div className="label">{label}</div>
                  <input
                    className="input mt-1"
                    type="number"
                    step={step}
                    value={selectedWeaponChargePoint[field as keyof Pick<ShipWeaponChargePointDraft, "position_x" | "position_y" | "scale_x" | "scale_y" | "z_index">]}
                    onFocus={selectInputContents}
                    onChange={(event) => updateWeaponChargePoint(selectedWeaponChargePoint.key, (current) => ({ ...current, [field]: event.target.value }))}
                  />
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 sm:col-span-2">
                <span>Enabled</span>
                <input type="checkbox" className="h-4 w-4 rounded border-white/15 bg-[#07111d] text-amber-300 focus:ring-amber-300/25" checked={selectedWeaponChargePoint.enabled} onChange={(event) => updateWeaponChargePoint(selectedWeaponChargePoint.key, (current) => ({ ...current, enabled: event.target.checked }))} />
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
