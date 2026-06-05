"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DismissibleStatusBanner,
  StatusBanner,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { RARITY_COLOR } from "@lib/constants";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { Item, Mod } from "@lib/types";
import type {
  MerchantCatalogMode,
  MerchantLabWorkspace,
  MerchantProfileDraft,
  MerchantProfileValidationIssue,
} from "@lib/merchant-lab/types";
import {
  cloneMerchantProfile,
  createBlankMerchantProfile,
  createBlankMerchantWorkspace,
  deleteMerchantProfileAt,
  duplicateMerchantProfileIdMap,
  importMerchantWorkspace,
  insertMerchantProfileAfter,
  stringifyMerchantWorkspace,
  stringifySingleMerchantProfile,
  summarizeMerchantWorkspace,
  updateMerchantProfileAt,
  validateMerchantProfiles,
} from "@lib/merchant-lab/utils";

type PreviewProduct = {
  kind: "item" | "mod";
  id: string;
  name: string;
  icon?: string;
  rarity?: number;
  levelRequirement?: number;
  metaLabel: string;
  basePrice?: number;
  adjustedPrice?: number;
  priceAdjustment: string;
  missing?: boolean;
};

function labelize(value: string) {
  if (!value) return "Unknown";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function numberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function positiveInt(value: unknown) {
  const numeric = numberOrUndefined(value);
  if (numeric === undefined) return -1;
  return Math.max(-1, Math.round(numeric));
}

function intValue(value: unknown) {
  const numeric = numberOrUndefined(value);
  if (numeric === undefined) return 0;
  return Math.trunc(numeric);
}

function roundToNearest(value: number, nearest: number) {
  const step = Math.max(1, nearest);
  return Math.round(value / step) * step;
}

function normalizedTypeName(type?: string) {
  return String(type ?? "").trim().toLowerCase();
}

function getItemTypeBase(itemType: string) {
  switch (itemType) {
    case "component":
      return 20;
    case "fuel":
      return 8;
    case "hazardous":
      return 24;
    case "raw material":
      return 8;
    case "refined material":
      return 16;
    case "special":
      return 5;
    case "supply":
      return 12;
    case "trade good":
      return 10;
    default:
      return 10;
  }
}

function getItemRarityMultiplier(rarity: number) {
  switch (rarity) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 1.6;
    case 3:
      return 2.6;
    case 4:
      return 4;
    case 5:
      return 6;
    default:
      return 1 + Math.max(0, rarity - 1) * 0.75;
  }
}

function getModRarityMultiplier(rarity: number) {
  switch (rarity) {
    case 0:
      return 1;
    case 1:
      return 1.35;
    case 2:
      return 1.9;
    case 3:
      return 2.7;
    case 4:
      return 4;
    case 5:
      return 6;
    default:
      return 1 + Math.max(0, rarity) * 0.75;
  }
}

function getItemBasePrice(item?: Item) {
  if (!item) return undefined;
  const itemType = normalizedTypeName(item.type);
  if (itemType === "key") return 0;
  if (item.buyPrice !== undefined && item.sellPrice !== undefined && intValue(item.buyPrice) === 0 && intValue(item.sellPrice) === 0) return 0;

  const explicitBase = positiveInt(item.baseValue ?? item.basePrice);
  if (explicitBase > 0) return explicitBase;

  const legacyBuy = positiveInt(item.buyPrice);
  if (legacyBuy > 1) return legacyBuy;

  const legacyValue = positiveInt(item.value);
  if (legacyValue > 1) return legacyValue;

  const rarity = Math.max(0, Math.trunc(numberOrUndefined(item.rarity) ?? 1));
  return Math.max(1, Math.round(getItemTypeBase(itemType) * getItemRarityMultiplier(rarity)));
}

function getModBasePrice(mod?: Mod) {
  if (!mod) return undefined;

  const explicitBase = positiveInt(mod.baseValue ?? mod.basePrice);
  if (explicitBase > 0) return explicitBase;

  const explicitBuy = positiveInt(mod.buyPrice);
  if (explicitBuy > 0) return explicitBuy;

  const levelRequirement = Math.max(1, Math.trunc(numberOrUndefined(mod.levelRequirement) ?? 1));
  const rarity = Math.max(0, Math.trunc(numberOrUndefined(mod.rarity) ?? 0));
  const composite = Math.max(0, numberOrUndefined(mod.composite) ?? 0);
  const statsCount = mod.stats && typeof mod.stats === "object" ? Object.keys(mod.stats).length : 0;
  const abilitiesCount = Array.isArray(mod.abilities) ? mod.abilities.length : 0;
  let raw = 22;
  raw += levelRequirement * 5;
  raw += Math.min(composite, 80) * 0.18;
  raw += statsCount * 2;
  raw += abilitiesCount * 4;
  raw *= getModRarityMultiplier(rarity);
  return Math.max(1, roundToNearest(Math.round(raw), 5));
}

function multiplierFromAdjustment(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 1;
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) return undefined;
  return Math.max(0, 1 + percent / 100);
}

function getAdjustedPrice(basePrice: number | undefined, adjustment: string) {
  if (basePrice === undefined) return undefined;
  if (basePrice <= 0) return 0;
  const multiplier = multiplierFromAdjustment(adjustment);
  if (multiplier === undefined) return undefined;
  return Math.max(1, Math.round(basePrice * multiplier));
}

function formatCredits(value: number | undefined) {
  if (value === undefined) return "Not available";
  return `${value.toLocaleString()} cr`;
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-4">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-sm text-white/55">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CatalogThumb({
  icon,
  id,
  name,
  version,
  className = "h-20 w-20",
}: {
  icon?: string;
  id: string;
  name: string;
  version?: string;
  className?: string;
}) {
  const src = buildIconSrc(icon, id, name, version);
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="px-2 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-white/35">{id}</div>
      )}
    </div>
  );
}

function PreviewCard({
  product,
  onRemove,
  onPriceAdjustmentChange,
  version,
}: {
  product: PreviewProduct;
  onRemove: () => void;
  onPriceAdjustmentChange: (value: string) => void;
  version?: string;
}) {
  const titleColor = product.rarity === 4 ? "#F97316" : product.rarity === 3 ? "#8B5CF6" : RARITY_COLOR[product.rarity ?? 0] || "#FFFFFF";
  const hasInvalidAdjustment = product.priceAdjustment.trim() !== "" && multiplierFromAdjustment(product.priceAdjustment) === undefined;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3 ${
        product.missing ? "border-red-300/20 bg-red-400/10" : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex items-start gap-3">
        <CatalogThumb icon={product.icon} id={product.id} name={product.name} version={version} className="h-[75px] w-[75px]" />
        <div className="flex min-w-[75px] flex-col items-start gap-2">
          <button
            type="button"
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onRemove}
          >
            Remove
          </button>
          <div className="max-w-[120px] truncate rounded bg-white/5 px-2 py-1 text-xs text-white/60">{product.id}</div>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <div className="line-clamp-2 text-lg font-semibold" style={{ color: titleColor }}>
          {product.name}
        </div>
        <div className="mt-2 text-sm text-white/55">{product.metaLabel}</div>
        {product.missing ? <div className="mt-2 text-xs text-red-100">Missing from the current console catalog.</div> : null}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Base</div>
            <div className="mt-1 text-sm font-semibold text-white/80">{formatCredits(product.basePrice)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">New</div>
            <div className={`mt-1 text-sm font-semibold ${hasInvalidAdjustment ? "text-red-100" : "text-cyan-100"}`}>
              {hasInvalidAdjustment ? "Invalid" : formatCredits(product.adjustedPrice)}
            </div>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Price Adjustment %</span>
          <input
            className={`input mt-1 h-9 text-sm ${hasInvalidAdjustment ? "border-red-300/45" : ""}`}
            inputMode="decimal"
            placeholder="0"
            value={product.priceAdjustment}
            onChange={(event) => onPriceAdjustmentChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export default function MerchantLabApp() {
  const workspaceRef = useRef<MerchantLabWorkspace | null>(null);
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<MerchantLabWorkspace | null>(null);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [profileSearch, setProfileSearch] = useState("");
  const [catalogMode, setCatalogMode] = useState<MerchantCatalogMode>("items");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [levelMinFilter, setLevelMinFilter] = useState("");
  const [levelMaxFilter, setLevelMaxFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [status, setStatus] = useState<TimedStatusState>({
    tone: "neutral",
    message: "Merchant Lab reads merchant_profiles.json directly from the active local game root in Settings.",
    dismissAfterMs: null,
  });
  const clearStatus = () =>
    setStatus({
      tone: "neutral",
      message: "Merchant Lab reads merchant_profiles.json directly from the active local game root in Settings.",
      dismissAfterMs: null,
    });
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const [itemsResponse, modsResponse] = await Promise.all([fetch("/api/items"), fetch("/api/mods")]);
        const itemsJson = await itemsResponse.json().catch(() => ({ data: [] }));
        const modsJson = await modsResponse.json().catch(() => ({ data: [] }));
        if (cancelled) return;

        setItems(Array.isArray(itemsJson.data) ? itemsJson.data : []);
        setMods(Array.isArray(modsJson.data) ? modsJson.data : []);
      } catch {
        if (cancelled) return;
        setItems([]);
        setMods([]);
        setStatus({
          tone: "error",
          message: "Merchant Lab could not load the current items/mods catalog from the console APIs.",
          dismissAfterMs: null,
        });
      }
    }

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const validation = useMemo(() => validateMerchantProfiles(workspace?.profiles ?? []), [workspace]);
  const validationByProfileKey = useMemo(() => {
    const next = new Map<string, MerchantProfileValidationIssue[]>();
    for (const issue of validation) {
      const current = next.get(issue.profileKey) ?? [];
      current.push(issue);
      next.set(issue.profileKey, current);
    }
    return next;
  }, [validation]);
  const duplicateIds = useMemo(() => duplicateMerchantProfileIdMap(workspace?.profiles ?? []), [workspace]);
  const summary = useMemo(() => summarizeMerchantWorkspace(workspace, validation), [workspace, validation]);

  const itemById = useMemo(() => new Map(items.map((item) => [String(item.id).trim(), item])), [items]);
  const modById = useMemo(() => new Map(mods.map((mod) => [String(mod.id).trim(), mod])), [mods]);

  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => (item.type ?? "").trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [items],
  );
  const slotOptions = useMemo(
    () => Array.from(new Set(mods.map((mod) => mod.slot.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [mods],
  );
  const classOptions = useMemo(
    () =>
      Array.from(new Set(mods.flatMap((mod) => (mod.classRestriction ?? []).map((value) => value.trim()).filter(Boolean)))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [mods],
  );
  const rarityOptions = useMemo(
    () =>
      Array.from(
        new Set((catalogMode === "items" ? items : mods).map((entry) => Number(entry.rarity)).filter((value) => Number.isFinite(value))),
      ).sort((left, right) => left - right),
    [catalogMode, items, mods],
  );

  const filteredProfiles = useMemo(() => {
    const query = profileSearch.trim().toLowerCase();
    return (workspace?.profiles ?? [])
      .filter((profile) => {
        if (!query) return true;
        return [profile.id, profile.name, profile.description].join(" ").toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftLabel = (left.name || left.id || "").trim().toLowerCase();
        const rightLabel = (right.name || right.id || "").trim().toLowerCase();
        const byLabel = leftLabel.localeCompare(rightLabel);
        if (byLabel !== 0) return byLabel;
        return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
      });
  }, [profileSearch, workspace]);

  useEffect(() => {
    const profiles = workspace?.profiles ?? [];
    if (!profiles.length) {
      if (selectedProfileKey !== null) setSelectedProfileKey(null);
      return;
    }

    if (!selectedProfileKey || !profiles.some((profile) => profile.key === selectedProfileKey)) {
      setSelectedProfileKey(filteredProfiles[0]?.key ?? profiles[0]?.key ?? null);
      return;
    }

    if (filteredProfiles.length && !filteredProfiles.some((profile) => profile.key === selectedProfileKey)) {
      setSelectedProfileKey(filteredProfiles[0]?.key ?? profiles[0]?.key ?? null);
    }
  }, [filteredProfiles, selectedProfileKey, workspace]);

  useEffect(() => {
    let cancelled = false;
    async function loadSharedWorkspace() {
      try {
        const response = await fetch("/api/settings/data/source?kind=merchantProfiles");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled && workspaceRef.current?.sourceType === "uploaded") {
            setWorkspace(null);
            setSelectedProfileKey(null);
            setStatus({
              tone: "neutral",
              message: "No merchant_profiles.json was found under the active local game root. Set a valid Gemini Station folder in Settings first.",
            });
          }
          return;
        }
        if (cancelled) return;
        if (workspaceRef.current && workspaceRef.current.sourceType !== "uploaded") return;
        importText(payload.text, payload.sourceLabel || "Local game source", "uploaded");
      } catch {
        // Local game source may not be configured yet.
      }
    }

    void loadSharedWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const selectedProfile = useMemo(() => {
    const profiles = workspace?.profiles ?? [];
    return profiles.find((profile) => profile.key === selectedProfileKey) ?? filteredProfiles[0] ?? profiles[0] ?? null;
  }, [filteredProfiles, selectedProfileKey, workspace]);
  const selectedIssues = selectedProfile ? validationByProfileKey.get(selectedProfile.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const selectedDuplicateKeys =
    selectedProfile && selectedProfile.id.trim()
      ? (duplicateIds.get(selectedProfile.id.trim()) ?? []).filter((key) => key !== selectedProfile.key)
      : [];

  const filteredCatalogItems = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    const minLevel = levelMinFilter.trim() ? Number(levelMinFilter) : undefined;
    const maxLevel = levelMaxFilter.trim() ? Number(levelMaxFilter) : undefined;

    return items
      .filter((item) => {
        if (!query) return true;
        return `${item.name} ${item.id}`.toLowerCase().includes(query);
      })
      .filter((item) => (rarityFilter ? String(item.rarity) === rarityFilter : true))
      .filter((item) => (typeFilter ? (item.type ?? "").trim() === typeFilter : true))
      .filter((item) => (minLevel !== undefined ? item.levelRequirement >= minLevel : true))
      .filter((item) => (maxLevel !== undefined ? item.levelRequirement <= maxLevel : true))
      .sort((left, right) => {
        if (left.levelRequirement !== right.levelRequirement) return left.levelRequirement - right.levelRequirement;
        return left.name.localeCompare(right.name);
      });
  }, [catalogSearch, items, levelMaxFilter, levelMinFilter, rarityFilter, typeFilter]);

  const filteredCatalogMods = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    const minLevel = levelMinFilter.trim() ? Number(levelMinFilter) : undefined;
    const maxLevel = levelMaxFilter.trim() ? Number(levelMaxFilter) : undefined;

    return mods
      .filter((mod) => {
        if (!query) return true;
        return `${mod.name} ${mod.id} ${mod.slot}`.toLowerCase().includes(query);
      })
      .filter((mod) => (rarityFilter ? String(mod.rarity) === rarityFilter : true))
      .filter((mod) => (slotFilter ? mod.slot.trim() === slotFilter : true))
      .filter((mod) => (classFilter ? (mod.classRestriction ?? []).includes(classFilter) : true))
      .filter((mod) => (minLevel !== undefined ? mod.levelRequirement >= minLevel : true))
      .filter((mod) => (maxLevel !== undefined ? mod.levelRequirement <= maxLevel : true))
      .sort((left, right) => {
        if (left.levelRequirement !== right.levelRequirement) return left.levelRequirement - right.levelRequirement;
        return left.name.localeCompare(right.name);
      });
  }, [catalogSearch, classFilter, levelMaxFilter, levelMinFilter, mods, rarityFilter, slotFilter]);

  const selectedItemProducts = useMemo(() => {
    if (!selectedProfile) return [];
    return selectedProfile.items.map((id) => {
      const trimmedId = id.trim();
      const item = itemById.get(trimmedId);
      const priceAdjustment = selectedProfile.priceAdjustments?.items?.[trimmedId] ?? "";
      const basePrice = getItemBasePrice(item);
      return {
        kind: "item" as const,
        id: trimmedId,
        name: item?.name ?? `Missing Item ${id}`,
        icon: item?.icon,
        rarity: item?.rarity,
        levelRequirement: item?.levelRequirement,
        metaLabel: item ? `Level ${item.levelRequirement} · Rarity ${item.rarity}${item.type ? ` · ${labelize(item.type)}` : ""}` : "Unresolved item reference",
        basePrice,
        adjustedPrice: getAdjustedPrice(basePrice, priceAdjustment),
        priceAdjustment,
        missing: !item,
      };
    });
  }, [itemById, selectedProfile]);

  const selectedModProducts = useMemo(() => {
    if (!selectedProfile) return [];
    return selectedProfile.mods.map((id) => {
      const trimmedId = id.trim();
      const mod = modById.get(trimmedId);
      const priceAdjustment = selectedProfile.priceAdjustments?.mods?.[trimmedId] ?? "";
      const basePrice = getModBasePrice(mod);
      return {
        kind: "mod" as const,
        id: trimmedId,
        name: mod?.name ?? `Missing Mod ${id}`,
        icon: mod?.icon,
        rarity: mod?.rarity,
        levelRequirement: mod?.levelRequirement,
        metaLabel: mod
          ? `Level ${mod.levelRequirement} · Rarity ${mod.rarity}${mod.slot ? ` · ${labelize(mod.slot)}` : ""}`
          : "Unresolved mod reference",
        basePrice,
        adjustedPrice: getAdjustedPrice(basePrice, priceAdjustment),
        priceAdjustment,
        missing: !mod,
      };
    });
  }, [modById, selectedProfile]);

  function updateSelectedProfile(updater: (current: MerchantProfileDraft) => MerchantProfileDraft) {
    if (!workspace || !selectedProfile) return;
    setWorkspace(updateMerchantProfileAt(workspace, selectedProfile.key, updater));
  }

  function updatePriceAdjustment(kind: MerchantCatalogMode, id: string, value: string) {
    const trimmedId = id.trim();
    if (!trimmedId) return;

    updateSelectedProfile((current) => {
      const currentAdjustments = current.priceAdjustments ?? { items: {}, mods: {} };
      const nextCollection = { ...(currentAdjustments[kind] ?? {}) };
      if (value.trim()) nextCollection[trimmedId] = value;
      else delete nextCollection[trimmedId];

      return {
        ...current,
        priceAdjustments: {
          items: kind === "items" ? nextCollection : { ...(currentAdjustments.items ?? {}) },
          mods: kind === "mods" ? nextCollection : { ...(currentAdjustments.mods ?? {}) },
        },
      };
    });
  }

  function importText(text: string, sourceLabel: string | null, sourceType: "uploaded" | "pasted") {
    try {
      const result = importMerchantWorkspace(text, sourceLabel, sourceType);
      setWorkspace(result.workspace);
      setSelectedProfileKey(result.workspace.profiles[0]?.key ?? null);
      setStatus({
        tone: "success",
        message: result.warnings.length
          ? `Imported ${result.workspace.profiles.length} merchant profile(s). ${result.warnings.join(" ")}`
          : `Imported ${result.workspace.profiles.length} merchant profile(s).`,
        dismissAfterMs: 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function startBlankWorkspace() {
    const nextWorkspace = createBlankMerchantWorkspace();
    setWorkspace(nextWorkspace);
    setSelectedProfileKey(nextWorkspace.profiles[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: "Started a blank Merchant Lab workspace.",
      dismissAfterMs: 4000,
    });
  }

  function addBlankProfile() {
    if (!workspace) {
      startBlankWorkspace();
      return;
    }

    const nextProfile = createBlankMerchantProfile(workspace.profiles.map((profile) => profile.id));
    const nextWorkspace = insertMerchantProfileAfter(workspace, selectedProfile?.key ?? null, nextProfile);
    setWorkspace(nextWorkspace);
    setSelectedProfileKey(nextProfile.key);
    setStatus({
      tone: "success",
      message: `Created merchant profile "${nextProfile.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function cloneSelectedProfile() {
    if (!workspace || !selectedProfile) return;
    const nextProfile = cloneMerchantProfile(selectedProfile, workspace.profiles.map((profile) => profile.id));
    const nextWorkspace = insertMerchantProfileAfter(workspace, selectedProfile.key, nextProfile);
    setWorkspace(nextWorkspace);
    setSelectedProfileKey(nextProfile.key);
    setStatus({
      tone: "success",
      message: `Cloned "${selectedProfile.id}" into "${nextProfile.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function deleteSelectedProfile() {
    if (!workspace || !selectedProfile) return;
    if (!window.confirm(`Delete merchant profile "${selectedProfile.id || "untitled"}"?`)) return;

    const nextWorkspace = deleteMerchantProfileAt(workspace, selectedProfile.key);
    setWorkspace(nextWorkspace.profiles.length ? nextWorkspace : null);
    setSelectedProfileKey(nextWorkspace.profiles[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: `Deleted "${selectedProfile.id || "untitled"}".`,
      dismissAfterMs: 4000,
    });
  }

  async function handleWorkspaceExport(action: "download" | "copy") {
    if (!workspace) return;
    try {
      const contents = stringifyMerchantWorkspace(workspace);
      if (action === "download") {
        downloadTextFile("merchant_profiles.json", contents);
        setStatus({
          tone: "success",
          message: "Downloaded updated merchant_profiles.json.",
          dismissAfterMs: 7000,
        });
        return;
      }

      const didCopy = await copyToClipboard(contents);
      setStatus({
        tone: didCopy ? "success" : "error",
        message: didCopy ? "Copied updated merchant_profiles.json to the clipboard." : "Clipboard copy failed in this browser context.",
        dismissAfterMs: didCopy ? 7000 : null,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleSaveAllMerchantProfilesToBuild() {
    if (!workspace) return;
    if (hasWorkspaceErrors) {
      setStatus({
        tone: "error",
        message: "Fix merchant profile validation errors before saving merchant_profiles.json into the configured game build.",
        dismissAfterMs: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/merchant-profiles/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save merchant_profiles.json into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setStatus({
        tone: "success",
        message: `Saved all ${workspace.profiles.length} merchant profiles into the live merchant_profiles.json file.`,
        dismissAfterMs: 10000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleCurrentProfileCopy() {
    if (!selectedProfile) return;
    try {
      const contents = `,${stringifySingleMerchantProfile(selectedProfile)}`;
      const didCopy = await copyToClipboard(contents);
      setStatus({
        tone: didCopy ? "success" : "error",
        message: didCopy
          ? `Copied ${selectedProfile.id || "current profile"} JSON to the clipboard with a leading comma.`
          : "Clipboard copy failed in this browser context.",
        dismissAfterMs: didCopy ? 5000 : null,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function addCatalogEntry(kind: MerchantCatalogMode, id: string) {
    if (!selectedProfile) return;

    const targetList = kind === "items" ? selectedProfile.items : selectedProfile.mods;
    if (targetList.includes(id)) {
      setStatus({
        tone: "neutral",
        message: `${kind === "items" ? "Item" : "Mod"} ${id} is already attached to ${selectedProfile.id}.`,
      });
      return;
    }

    updateSelectedProfile((current) => ({
      ...current,
      [kind]: [...current[kind], id],
    }));
    setStatus({
      tone: "success",
      message: `Added ${kind === "items" ? "item" : "mod"} ${id} to ${selectedProfile.id}.`,
      dismissAfterMs: 4000,
    });
  }

  function removeCatalogEntry(kind: MerchantCatalogMode, index: number) {
    updateSelectedProfile((current) => {
      const removedId = current[kind][index]?.trim();
      const currentAdjustments = current.priceAdjustments ?? { items: {}, mods: {} };
      const nextCollection = { ...(currentAdjustments[kind] ?? {}) };
      if (removedId) delete nextCollection[removedId];

      return {
        ...current,
        [kind]: current[kind].filter((_, currentIndex) => currentIndex !== index),
        priceAdjustments: {
          items: kind === "items" ? nextCollection : { ...(currentAdjustments.items ?? {}) },
          mods: kind === "mods" ? nextCollection : { ...(currentAdjustments.mods ?? {}) },
        },
      };
    });
  }

  const hasWorkspaceErrors = validation.some((issue) => issue.level === "error");
  const workspaceSourceLabel =
    workspace?.sourceType === "blank"
      ? "Manual workspace"
      : `${workspace?.sourceLabel ?? "Local game source"} (${workspace?.parseStrategy === "strict" ? "strict JSON" : "loose JSON"})`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="page-title mb-1">Merchant Lab</h1>
          <p className="text-sm leading-6 text-white/65">
            Build and maintain vendor merchant profiles with a live storefront preview, click-to-add catalog browser,
            duplicate-ID validation, and export tooling for `merchant_profiles.json`.
          </p>
        </div>

        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => void handleSaveAllMerchantProfilesToBuild()}>
          Save All Merchant Profiles To Build
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => handleWorkspaceExport("download")}>
          Download merchant_profiles.json
        </button>
        <button
          className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
          disabled={!workspace || hasWorkspaceErrors}
          onClick={() => handleWorkspaceExport("copy")}
        >
          Copy Updated JSON
        </button>
      </div>

      {status.tone === "neutral" ? (
        <StatusBanner tone={status.tone} message={status.message} />
      ) : (
        <DismissibleStatusBanner tone={status.tone} message={status.message} onDismiss={clearStatus} countdownSeconds={statusCountdown} />
      )}

      {workspace ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Profiles" value={summary.totalProfiles} />
          <SummaryCard label="Item Links" value={summary.totalItemRefs} />
          <SummaryCard label="Mod Links" value={summary.totalModRefs} />
          <SummaryCard label="Duplicate IDs" value={summary.duplicateIdCount} accent={summary.duplicateIdCount ? "text-yellow-200" : undefined} />
          <SummaryCard label="Errors / Warnings" value={`${summary.errorCount} / ${summary.warningCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
        </div>
      ) : null}

      {!workspace ? (
        <>
          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">What Merchant Lab Includes</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Browse and manage merchant profiles with unique-ID validation, cloning, and deletion.</div>
              <div>Preview all attached items and mods in a storefront-style layout with remove actions.</div>
              <div>Filter the live console item/mod catalog and click products to add them into the selected profile.</div>
              <div>Copy the full updated `merchant_profiles.json`, copy only the selected profile, or download the file.</div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Local Game Root Required</div>
            <div className="text-sm leading-6 text-white/65">
              Merchant Lab no longer loads separate `merchant_profiles.json` files. Set the Gemini Station local game root in Settings and the
              editor will automatically read `data/database/vendor/merchant_profiles.json` from that folder.
            </div>
            <div>
              <Link href="/settings" className="btn">
                Open Settings
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="card h-fit space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold text-white">Profile Library</div>
                  <div className="mt-1 text-sm text-white/55">{workspaceSourceLabel}</div>
                </div>
                <button className="btn shrink-0" onClick={addBlankProfile}>
                  New Profile
                </button>
              </div>

              <div>
                <div className="label">Search Profiles</div>
                <input
                  className="input mt-1"
                  value={profileSearch}
                  placeholder="Search profile ID, name, or notes..."
                  onChange={(event) => setProfileSearch(event.target.value)}
                />
              </div>

              <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
                {filteredProfiles.length ? (
                  filteredProfiles.map((profile) => {
                    const issues = validationByProfileKey.get(profile.key) ?? [];
                    const hasErrors = issues.some((issue) => issue.level === "error");
                    const hasWarnings = issues.some((issue) => issue.level === "warning");
                    const selected = selectedProfile?.key === profile.key;
                    const isDuplicate = duplicateIds.has(profile.id.trim());

                    return (
                      <button
                        key={profile.key}
                        type="button"
                        onClick={() => setSelectedProfileKey(profile.key)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                            : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="truncate text-base font-semibold text-white">{profile.id || "Untitled Profile"}</div>
                        {profile.name ? <div className="mt-1 truncate text-sm text-cyan-100/75">{profile.name}</div> : null}
                        {profile.description ? <div className="mt-1 line-clamp-2 text-xs text-white/45">{profile.description}</div> : null}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="badge">{profile.items.length} items</span>
                          <span className="badge">{profile.mods.length} mods</span>
                          {isDuplicate ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Duplicate ID</span> : null}
                          {hasErrors ? <span className="badge border border-red-300/20 bg-red-300/10 text-red-100">Needs Fixes</span> : null}
                          {!hasErrors && hasWarnings ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Warnings</span> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                    No merchant profiles match the current search.
                  </div>
                )}
              </div>
            </div>

            <div className="card h-fit space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold text-white">Catalog Browser</div>
                  <div className="mt-1 text-sm text-white/55">Click a product tile to attach it to the selected merchant profile.</div>
                </div>
                <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                  <button
                    className={`rounded px-3 py-1.5 text-sm transition ${catalogMode === "items" ? "bg-accent text-black" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                    onClick={() => setCatalogMode("items")}
                  >
                    Items
                  </button>
                  <button
                    className={`rounded px-3 py-1.5 text-sm transition ${catalogMode === "mods" ? "bg-accent text-black" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                    onClick={() => setCatalogMode("mods")}
                  >
                    Mods
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="label">Search Catalog</div>
                  <input
                    className="input mt-1"
                    value={catalogSearch}
                    placeholder={catalogMode === "items" ? "Search item name or id..." : "Search mod name, id, or slot..."}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <div className="label">Rarity</div>
                    <select className="select mt-1 w-full" value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
                      <option value="">All rarities</option>
                      {rarityOptions.map((value) => (
                        <option key={value} value={String(value)}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="label">Level</div>
                    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2">
                      <input className="input" value={levelMinFilter} placeholder="Min" onChange={(event) => setLevelMinFilter(event.target.value)} />
                      <div className="flex items-center text-sm text-white/45">to</div>
                      <input className="input" value={levelMaxFilter} placeholder="Max" onChange={(event) => setLevelMaxFilter(event.target.value)} />
                    </div>
                  </div>
                </div>

                {catalogMode === "items" ? (
                  <div>
                    <div className="label">Type</div>
                    <select className="select mt-1 w-full" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                      <option value="">All item types</option>
                      {typeOptions.map((value) => (
                        <option key={value} value={value}>
                          {labelize(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <div className="label">Slot</div>
                      <select className="select mt-1 w-full" value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}>
                        <option value="">All slots</option>
                        {slotOptions.map((value) => (
                          <option key={value} value={value}>
                            {labelize(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="label">Class Restriction</div>
                      <select className="select mt-1 w-full" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                        <option value="">All classes</option>
                        {classOptions.map((value) => (
                          <option key={value} value={value}>
                            {labelize(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {catalogMode === "items"
                  ? filteredCatalogItems.map((item) => {
                      const alreadyAdded = selectedProfile?.items.includes(String(item.id).trim()) ?? false;
                      return (
                        <button
                          key={`item-${item.id}`}
                          type="button"
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            alreadyAdded
                              ? "cursor-default border-cyan-300/20 bg-cyan-300/10"
                              : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                          }`}
                          disabled={alreadyAdded || !selectedProfile}
                          onClick={() => addCatalogEntry("items", String(item.id).trim())}
                        >
                          <div className="flex gap-3">
                            <CatalogThumb icon={item.icon} id={String(item.id)} name={item.name} version={sharedDataVersion} />
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold text-white">{item.name}</div>
                              <div className="mt-1 text-xs text-white/50">{item.id}</div>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="badge">Lvl {item.levelRequirement}</span>
                                <span className="badge">Rarity {item.rarity}</span>
                                {item.type ? <span className="badge">{labelize(item.type)}</span> : null}
                                {alreadyAdded ? <span className="badge border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">Added</span> : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  : filteredCatalogMods.map((mod) => {
                      const alreadyAdded = selectedProfile?.mods.includes(String(mod.id).trim()) ?? false;
                      return (
                        <button
                          key={`mod-${mod.id}`}
                          type="button"
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            alreadyAdded
                              ? "cursor-default border-cyan-300/20 bg-cyan-300/10"
                              : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                          }`}
                          disabled={alreadyAdded || !selectedProfile}
                          onClick={() => addCatalogEntry("mods", String(mod.id).trim())}
                        >
                          <div className="flex gap-3">
                            <CatalogThumb icon={mod.icon} id={String(mod.id)} name={mod.name} version={sharedDataVersion} />
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold text-white">{mod.name}</div>
                              <div className="mt-1 text-xs text-white/50">{mod.id}</div>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="badge">Lvl {mod.levelRequirement}</span>
                                <span className="badge">Rarity {mod.rarity}</span>
                                <span className="badge">{labelize(mod.slot)}</span>
                                {alreadyAdded ? <span className="badge border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">Added</span> : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}

                {(catalogMode === "items" ? filteredCatalogItems.length === 0 : filteredCatalogMods.length === 0) ? (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                    No {catalogMode} match the current catalog filters.
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {selectedProfile ? (
              <>
                <div className="card space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-semibold text-white">{selectedProfile.id || "Untitled Merchant Profile"}</div>
                      <div className="mt-1 text-sm text-white/55">
                        Editing profile {workspace.profiles.findIndex((profile) => profile.key === selectedProfile.key) + 1} of {workspace.profiles.length}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn" onClick={cloneSelectedProfile}>
                        Clone Profile
                      </button>
                      <button
                        className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
                        disabled={selectedHasErrors}
                        onClick={handleCurrentProfileCopy}
                      >
                        Copy Current Profile JSON
                      </button>
                      <button
                        className="rounded border border-red-400/20 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                        onClick={deleteSelectedProfile}
                      >
                        Delete Profile
                      </button>
                    </div>
                  </div>

                  {selectedDuplicateKeys.length ? (
                    <div className="rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      This merchant profile ID already exists on {selectedDuplicateKeys.length} other profile{selectedDuplicateKeys.length === 1 ? "" : "s"} in the
                      workspace. Change the ID before exporting.
                    </div>
                  ) : null}

                  {selectedIssues.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {selectedIssues.map((issue, index) => (
                        <div
                          key={`${issue.field}-${index}`}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            issue.level === "error"
                              ? "border-red-400/25 bg-red-400/10 text-red-100"
                              : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
                          }`}
                        >
                          <span className="font-medium">{labelize(issue.field)}:</span> {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <Section
                  title="Profile Settings"
                  description="Set the merchant profile id plus authoring-only name/description metadata. The game can ignore these fields, but Merchant Lab will preserve them in JSON."
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="label">Merchant Profile ID</div>
                      <input
                        className={`input mt-1 ${selectedDuplicateKeys.length ? "border-red-300/35" : ""}`}
                        value={selectedProfile.id}
                        placeholder="utf_support_vendor"
                        onChange={(event) => updateSelectedProfile((current) => ({ ...current, id: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Authoring Name</div>
                      <input
                        className="input mt-1"
                        value={selectedProfile.name}
                        placeholder="Crossroads Quartermaster"
                        onChange={(event) => updateSelectedProfile((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Attached Product Counts</div>
                      <div className="mt-1 flex h-[42px] items-center gap-2 rounded border border-white/10 bg-black/20 px-3 text-sm text-white/70">
                        <span>{selectedProfile.items.length} items</span>
                        <span className="text-white/30">•</span>
                        <span>{selectedProfile.mods.length} mods</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="label">Authoring Description / Notes</div>
                    <textarea
                      className="input mt-1 min-h-28"
                      value={selectedProfile.description}
                      placeholder="Used by the Crossroads station vendor near the main docking concourse."
                      onChange={(event) => updateSelectedProfile((current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>

                  <div>
                    <div className="label">Extra JSON</div>
                    <textarea
                      className="input mt-1 min-h-32 font-mono text-sm"
                      value={selectedProfile.extra_json}
                      placeholder='{\n  "faction": "utf"\n}'
                      onChange={(event) => updateSelectedProfile((current) => ({ ...current, extra_json: event.target.value }))}
                    />
                  </div>
                </Section>

                <Section
                  title="Storefront Preview"
                  description="This shows the current item and mod offerings attached to the selected merchant profile, including per-profile price adjustments."
                >
                  <div className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%),linear-gradient(180deg,_rgba(5,16,26,0.98),_rgba(9,19,31,0.92))] p-5 shadow-[0_12px_60px_rgba(0,0,0,0.35)]">
                    <div className="border-b border-white/10 pb-4">
                      <div className="text-xs uppercase tracking-[0.34em] text-cyan-200/45">Merchant Profile</div>
                      <div className="mt-2 text-4xl font-semibold text-white">{selectedProfile.id || "Untitled Merchant"}</div>
                      {selectedProfile.name ? <div className="mt-2 text-lg font-medium text-cyan-100/80">{selectedProfile.name}</div> : null}
                      {selectedProfile.description ? <div className="mt-3 max-w-3xl text-sm leading-6 text-white/55">{selectedProfile.description}</div> : null}
                      <div className="mt-3 text-sm text-white/50">
                        {selectedProfile.items.length} item offer{selectedProfile.items.length === 1 ? "" : "s"} · {selectedProfile.mods.length} mod
                        offer{selectedProfile.mods.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="mt-6 space-y-8">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-lg font-semibold text-white">Items</div>
                          <div className="text-sm text-white/45">{selectedItemProducts.length} attached</div>
                        </div>
                        {selectedItemProducts.length ? (
                          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                            {selectedItemProducts.map((product, index) => (
                              <PreviewCard
                                key={`preview-item-${product.id}-${index}`}
                                product={product}
                                version={sharedDataVersion}
                                onRemove={() => removeCatalogEntry("items", index)}
                                onPriceAdjustmentChange={(value) => updatePriceAdjustment("items", product.id, value)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/45">
                            No items attached yet. Use the catalog browser to add products.
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-lg font-semibold text-white">Mods</div>
                          <div className="text-sm text-white/45">{selectedModProducts.length} attached</div>
                        </div>
                        {selectedModProducts.length ? (
                          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                            {selectedModProducts.map((product, index) => (
                              <PreviewCard
                                key={`preview-mod-${product.id}-${index}`}
                                product={product}
                                version={sharedDataVersion}
                                onRemove={() => removeCatalogEntry("mods", index)}
                                onPriceAdjustmentChange={(value) => updatePriceAdjustment("mods", product.id, value)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-white/45">
                            No mods attached yet. Use the catalog browser to add products.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>
              </>
            ) : (
              <div className="card py-10 text-center">
                <div className="text-xl font-semibold text-white">No merchant profile selected</div>
                <div className="mt-2 text-sm text-white/55">Choose a profile from the library or create a new merchant profile.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
