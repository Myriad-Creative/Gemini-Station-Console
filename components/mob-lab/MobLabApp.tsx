"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DismissibleStatusBanner,
  StatusBanner,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { BUILT_IN_MOB_STAT_KEYS, MOB_SORT_OPTIONS } from "@lib/mob-lab/constants";
import { mergeGeneratedMobStats, MOB_STAT_RANK_OPTIONS } from "@lib/mob-lab/stat-scaling";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { MobDraft, MobSortKey, MobValidationIssue, MobLabWorkspace } from "@lib/mob-lab/types";
import type { CommsContactDraft } from "@lib/comms-manager/types";
import { importCommsWorkspace, resolvedPortraitPath } from "@lib/comms-manager/utils";
import type { MerchantProfileDraft } from "@lib/merchant-lab/types";
import { importMerchantWorkspace } from "@lib/merchant-lab/utils";

type HailImageOption = {
  fileName: string;
  relativePath: string;
  resPath: string;
};

type FactionOption = {
  name: string;
  defaultPoints: number;
  forcedPoints: number | null;
};

type LootTableOption = {
  id: string;
  rolls: number;
  entryCount: number;
  totalWeight: number;
  entries: {
    id: string;
    weight: number;
    name: string | null;
  }[];
};

type LootTableCatalog = {
  items: LootTableOption[];
  mods: LootTableOption[];
};
import {
  cloneMobDraft,
  createBlankMobDraft,
  createBlankScanTierDraft,
  createBlankMobWorkspace,
  deleteMobDraftAt,
  duplicateMobIdMap,
  importMobWorkspace,
  insertMobDraftAfter,
  stringifyMobWorkspace,
  stringifySingleMob,
  summarizeMobWorkspace,
  updateMobDraftAt,
  validateMobDrafts,
} from "@lib/mob-lab/utils";

function labelize(value: string) {
  if (!value) return "Unknown";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-white/15 bg-[#07111d] text-cyan-300 focus:ring-cyan-300/25"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ArrayEditor({
  label,
  values,
  emptyLabel,
  addLabel,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
  addLabel: string;
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="label">{label}</div>
        <button
          type="button"
          className="rounded border border-white/10 px-2 py-1 text-xs text-white/75 hover:bg-white/5"
          onClick={() => onChange([...values, ""])}
        >
          {addLabel}
        </button>
      </div>
      {values.length ? (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`${label}-${index}`} className="flex gap-2">
              <input
                className="input"
                value={value}
                placeholder={placeholder}
                onChange={(event) =>
                  onChange(values.map((current, currentIndex) => (currentIndex === index ? event.target.value : current)))
                }
              />
              <button
                type="button"
                className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">{emptyLabel}</div>
      )}
    </div>
  );
}

function LootTablePicker({
  label,
  value,
  placeholder,
  allOptions,
  options,
  search,
  status,
  onSearchChange,
  onValueChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  allOptions: LootTableOption[];
  options: LootTableOption[];
  search: string;
  status: string;
  onSearchChange: (next: string) => void;
  onValueChange: (next: string) => void;
}) {
  const selected = allOptions.find((option) => option.id === value.trim()) ?? null;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">{label}</div>
          <div className="mt-1 text-xs text-white/45">
            {selected
              ? `${selected.rolls} roll${selected.rolls === 1 ? "" : "s"} · ${selected.entryCount} entr${selected.entryCount === 1 ? "y" : "ies"}`
              : "Pick a table from the local loot catalog, or clear the field for no loot table."}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
          disabled={!value.trim()}
          onClick={() => onValueChange("")}
        >
          Clear
        </button>
      </div>

      <input className="input" value={value} placeholder={placeholder} onFocus={selectInputContents} onChange={(event) => onValueChange(event.target.value)} />
      <input className="input" value={search} placeholder={`Search ${label.toLowerCase()} by table ID or entries...`} onChange={(event) => onSearchChange(event.target.value)} />

      {value.trim() && !selected ? (
        <div className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
          Current table "{value}" was not found in the loaded loot catalog.
        </div>
      ) : null}

      {status ? <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">{status}</div> : null}

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {options.length ? (
          options.map((option) => {
            const isSelected = value.trim() === option.id;
            const sampleEntries = option.entries.slice(0, 4);
            return (
              <button
                key={option.id}
                type="button"
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                }`}
                onClick={() => onValueChange(option.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-white">{option.id}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {option.rolls} roll{option.rolls === 1 ? "" : "s"} · {option.entryCount} entries · weight {option.totalWeight}
                    </div>
                  </div>
                  {isSelected ? <div className="shrink-0 rounded bg-cyan-300/15 px-2 py-1 text-xs font-medium text-cyan-100">Selected</div> : null}
                </div>
                {sampleEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sampleEntries.map((entry) => (
                      <span key={`${option.id}-${entry.id}`} className="badge">
                        {entry.name || entry.id} · {entry.weight}
                      </span>
                    ))}
                    {option.entries.length > sampleEntries.length ? <span className="badge">+{option.entries.length - sampleEntries.length} more</span> : null}
                  </div>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
            No loot tables matched the current search.
          </div>
        )}
      </div>
    </div>
  );
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
    return;
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
  } finally {
    document.body.removeChild(textarea);
  }
}

function normalizeCatalogText(value: string | number | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function selectInputContents(event: { currentTarget: HTMLInputElement }) {
  event.currentTarget.select();
}

export default function MobLabApp() {
  const workspaceRef = useRef<MobLabWorkspace | null>(null);
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<MobLabWorkspace | null>(null);
  const [selectedMobKey, setSelectedMobKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [factionFilter, setFactionFilter] = useState("");
  const [aiFilter, setAiFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState<"all" | "error" | "warning">("all");
  const [sortBy, setSortBy] = useState<MobSortKey>("display_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [factionCatalog, setFactionCatalog] = useState<FactionOption[]>([]);
  const [factionCatalogStatus, setFactionCatalogStatus] = useState("");
  const [merchantProfiles, setMerchantProfiles] = useState<MerchantProfileDraft[]>([]);
  const [merchantProfileSearch, setMerchantProfileSearch] = useState("");
  const [merchantProfileCatalogStatus, setMerchantProfileCatalogStatus] = useState("");
  const [isCreatingMerchantProfile, setIsCreatingMerchantProfile] = useState(false);
  const [commsContacts, setCommsContacts] = useState<CommsContactDraft[]>([]);
  const [commsContactSearch, setCommsContactSearch] = useState("");
  const [commsCatalogStatus, setCommsCatalogStatus] = useState("");
  const [hailImageOptions, setHailImageOptions] = useState<HailImageOption[]>([]);
  const [hailImageSearch, setHailImageSearch] = useState("");
  const [hailImageCatalogStatus, setHailImageCatalogStatus] = useState("");
  const [lootTables, setLootTables] = useState<LootTableCatalog>({ items: [], mods: [] });
  const [itemLootTableSearch, setItemLootTableSearch] = useState("");
  const [modLootTableSearch, setModLootTableSearch] = useState("");
  const [lootTableCatalogStatus, setLootTableCatalogStatus] = useState("");
  const [status, setStatus] = useState<TimedStatusState>({
    tone: "neutral",
    message: "Mob Lab reads mobs.json directly from the active local game root in Settings.",
    dismissAfterMs: null,
  });
  const clearStatus = () =>
    setStatus({
      tone: "neutral",
      message: "Mob Lab reads mobs.json directly from the active local game root in Settings.",
      dismissAfterMs: null,
    });
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  const validation = useMemo(() => validateMobDrafts(workspace?.mobs ?? []), [workspace]);
  const validationByMobKey = useMemo(() => {
    const next = new Map<string, MobValidationIssue[]>();
    for (const issue of validation) {
      const current = next.get(issue.mobKey) ?? [];
      current.push(issue);
      next.set(issue.mobKey, current);
    }
    return next;
  }, [validation]);
  const issueFlagsByMobKey = useMemo(() => {
    const next = new Map<string, { error: boolean; warning: boolean }>();
    for (const [mobKey, issues] of validationByMobKey.entries()) {
      next.set(mobKey, {
        error: issues.some((issue) => issue.level === "error"),
        warning: issues.some((issue) => issue.level === "warning"),
      });
    }
    return next;
  }, [validationByMobKey]);
  const duplicateIds = useMemo(() => duplicateMobIdMap(workspace?.mobs ?? []), [workspace]);
  const summary = useMemo(() => summarizeMobWorkspace(workspace, validation), [workspace, validation]);
  const errorMobCount = useMemo(() => Array.from(issueFlagsByMobKey.values()).filter((flags) => flags.error).length, [issueFlagsByMobKey]);
  const warningMobCount = useMemo(() => Array.from(issueFlagsByMobKey.values()).filter((flags) => flags.warning).length, [issueFlagsByMobKey]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const factionOptions = useMemo(() => {
    const options = new Map<string, FactionOption | null>();
    for (const faction of factionCatalog) {
      options.set(faction.name, faction);
    }
    for (const mob of workspace?.mobs ?? []) {
      const faction = mob.faction.trim();
      if (faction && !options.has(faction)) options.set(faction, null);
    }
    return Array.from(options.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [factionCatalog, workspace]);
  const aiOptions = useMemo(() => {
    return Array.from(new Set((workspace?.mobs ?? []).map((mob) => mob.ai_type.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [workspace]);

  const filteredMobs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = (workspace?.mobs ?? [])
      .filter((mob) => {
        if (!query) return true;
        const haystack = [mob.id, mob.display_name, mob.meta_description, mob.faction, mob.ai_type, mob.scene, mob.sprite].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .filter((mob) => (factionFilter ? mob.faction.trim() === factionFilter : true))
      .filter((mob) => (aiFilter ? mob.ai_type.trim() === aiFilter : true))
      .filter((mob) => {
        if (issueFilter === "all") return true;
        const flags = issueFlagsByMobKey.get(mob.key);
        return issueFilter === "error" ? Boolean(flags?.error) : Boolean(flags?.warning);
      });

    filtered.sort((left, right) => {
      if (sortBy === "level") {
        const leftLevel = Number(left.level || -1);
        const rightLevel = Number(right.level || -1);
        return sortDirection === "asc" ? leftLevel - rightLevel : rightLevel - leftLevel;
      }

      const leftValue = (left[sortBy] || "").toString().toLowerCase();
      const rightValue = (right[sortBy] || "").toString().toLowerCase();
      return sortDirection === "asc" ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    });

    return filtered;
  }, [aiFilter, factionFilter, issueFilter, issueFlagsByMobKey, search, sortBy, sortDirection, workspace]);

  useEffect(() => {
    const mobs = workspace?.mobs ?? [];
    if (!mobs.length) {
      if (selectedMobKey !== null) setSelectedMobKey(null);
      return;
    }

    if (!selectedMobKey || !mobs.some((mob) => mob.key === selectedMobKey)) {
      setSelectedMobKey(filteredMobs[0]?.key ?? mobs[0]?.key ?? null);
      return;
    }

    if (filteredMobs.length && !filteredMobs.some((mob) => mob.key === selectedMobKey)) {
      setSelectedMobKey(filteredMobs[0]?.key ?? mobs[0]?.key ?? null);
    }
  }, [filteredMobs, selectedMobKey, workspace]);

  useEffect(() => {
    let cancelled = false;
    async function loadSharedWorkspace() {
      try {
        const response = await fetch("/api/settings/data/source?kind=mobs");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled && workspaceRef.current?.sourceType === "uploaded") {
            setWorkspace(null);
            setSelectedMobKey(null);
            setStatus({
              tone: "neutral",
              message: "No mobs.json was found under the active local game root. Set a valid Gemini Station folder in Settings first.",
            });
          }
          return;
        }
        if (cancelled) return;
        if (workspaceRef.current && workspaceRef.current.sourceType !== "uploaded") return;
        importText(payload.text, payload.sourceLabel || "Local game source", "uploaded", { showSuccessStatus: false });
      } catch {
        // Local game source may not be configured yet.
      }
    }

    void loadSharedWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  useEffect(() => {
    let cancelled = false;

    async function loadFactions() {
      try {
        const response = await fetch("/api/factions");
        const payload = await response.json().catch(() => ({}));
        const data = Array.isArray(payload?.data) ? (payload.data as FactionOption[]) : [];
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setFactionCatalog([]);
          setFactionCatalogStatus(payload?.error || "No faction catalog was found under the active local game root.");
          return;
        }
        setFactionCatalog(data);
        setFactionCatalogStatus("");
      } catch (error) {
        if (!cancelled) {
          setFactionCatalog([]);
          setFactionCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    async function loadMerchantProfiles() {
      try {
        const response = await fetch("/api/settings/data/source?kind=merchantProfiles");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled) {
            setMerchantProfiles([]);
            setMerchantProfileCatalogStatus("No merchant profile catalog was found under the active local game root.");
          }
          return;
        }

        const result = importMerchantWorkspace(payload.text, payload.sourceLabel || "Local game source", "uploaded");
        if (cancelled) return;
        setMerchantProfiles(
          result.workspace.profiles
            .filter((profile) => profile.id.trim())
            .sort((left, right) => {
              const leftLabel = (left.name || left.id).trim().toLowerCase();
              const rightLabel = (right.name || right.id).trim().toLowerCase();
              const byLabel = leftLabel.localeCompare(rightLabel);
              if (byLabel !== 0) return byLabel;
              return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
            }),
        );
        setMerchantProfileCatalogStatus(result.warnings.join(" "));
      } catch (error) {
        if (!cancelled) {
          setMerchantProfiles([]);
          setMerchantProfileCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    async function loadCommsContacts() {
      try {
        const response = await fetch("/api/settings/data/source?kind=comms");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled) {
            setCommsContacts([]);
            setCommsCatalogStatus("No comms catalog was found under the active local game root.");
          }
          return;
        }

        const result = importCommsWorkspace(payload.text, payload.sourceLabel || "Local game source", "uploaded");
        if (cancelled) return;
        setCommsContacts(
          result.workspace.contacts
            .filter((contact) => contact.id.trim())
            .sort((left, right) => {
              const leftLabel = (left.name || left.id).trim().toLowerCase();
              const rightLabel = (right.name || right.id).trim().toLowerCase();
              const byLabel = leftLabel.localeCompare(rightLabel);
              if (byLabel !== 0) return byLabel;
              return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
            }),
        );
        setCommsCatalogStatus(result.warnings.join(" "));
      } catch (error) {
        if (!cancelled) {
          setCommsContacts([]);
          setCommsCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    async function loadHailImages() {
      try {
        const response = await fetch("/api/hail-images");
        const payload = await response.json().catch(() => ({}));
        const data = Array.isArray(payload?.data) ? (payload.data as HailImageOption[]) : [];
        if (cancelled) return;
        setHailImageOptions(data);
        setHailImageCatalogStatus(typeof payload?.message === "string" ? payload.message : "");
      } catch (error) {
        if (!cancelled) {
          setHailImageOptions([]);
          setHailImageCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    async function loadLootTables() {
      try {
        const response = await fetch("/api/loot-tables");
        const payload = await response.json().catch(() => ({}));
        const data = payload?.data as Partial<LootTableCatalog> | undefined;
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setLootTables({ items: [], mods: [] });
          setLootTableCatalogStatus(payload?.error || "No loot table catalog was found under the active local game root.");
          return;
        }
        setLootTables({
          items: Array.isArray(data?.items) ? data.items : [],
          mods: Array.isArray(data?.mods) ? data.mods : [],
        });
        setLootTableCatalogStatus("");
      } catch (error) {
        if (!cancelled) {
          setLootTables({ items: [], mods: [] });
          setLootTableCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadFactions();
    void loadMerchantProfiles();
    void loadCommsContacts();
    void loadHailImages();
    void loadLootTables();

    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const selectedMob = useMemo(() => {
    const mobs = workspace?.mobs ?? [];
    return mobs.find((mob) => mob.key === selectedMobKey) ?? filteredMobs[0] ?? mobs[0] ?? null;
  }, [filteredMobs, selectedMobKey, workspace]);
  const selectedIssues = selectedMob ? validationByMobKey.get(selectedMob.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const selectedDuplicateKeys =
    selectedMob && selectedMob.id.trim() ? (duplicateIds.get(selectedMob.id.trim()) ?? []).filter((key) => key !== selectedMob.key) : [];
  const spritePreviewSrc = selectedMob
    ? buildIconSrc(selectedMob.sprite || undefined, selectedMob.id || "mob", selectedMob.display_name || "Mob", sharedDataVersion)
    : null;
  const hailPortraitPreviewSrc = selectedMob
    ? buildIconSrc(
        selectedMob.hail_portrait || undefined,
        selectedMob.id || "mob",
        selectedMob.hail_name || selectedMob.display_name || "Mob",
        sharedDataVersion,
      )
    : null;
  const hailImagePreviewSrc = selectedMob?.hail_image.trim()
    ? buildIconSrc(
        selectedMob.hail_image,
        selectedMob.id || "mob",
        selectedMob.hail_name || selectedMob.display_name || "Mob",
        sharedDataVersion,
      )
    : null;
  const selectedMerchantProfile = useMemo(() => {
    const currentId = selectedMob?.merchant_profile.trim();
    if (!currentId) return null;
    return merchantProfiles.find((profile) => profile.id.trim() === currentId) ?? null;
  }, [merchantProfiles, selectedMob?.merchant_profile]);
  const selectedFaction = useMemo(() => {
    const currentFaction = selectedMob?.faction.trim();
    if (!currentFaction) return null;
    return factionCatalog.find((faction) => faction.name === currentFaction) ?? null;
  }, [factionCatalog, selectedMob?.faction]);
  const filteredMerchantProfiles = useMemo(() => {
    const query = merchantProfileSearch.trim().toLowerCase();
    if (!query) return merchantProfiles;
    return merchantProfiles.filter((profile) => {
      const haystack = [
        profile.id,
        profile.name,
        profile.description,
        profile.items.join(" "),
        profile.mods.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [merchantProfileSearch, merchantProfiles]);
  const selectedCommsContact = useMemo(() => {
    if (!selectedMob) return null;
    const commDirectoryIds = new Set(selectedMob.comms_directory.map((entry) => entry.trim()).filter(Boolean));
    const directoryMatch = commsContacts.find((contact) => commDirectoryIds.has(contact.id.trim()));
    if (directoryMatch) return directoryMatch;

    const hailName = normalizeCatalogText(selectedMob.hail_name);
    const hailPortrait = normalizeCatalogText(selectedMob.hail_portrait);
    return (
      commsContacts.find((contact) => {
        const contactName = normalizeCatalogText(contact.name);
        const contactPortrait = normalizeCatalogText(resolvedPortraitPath(contact.portrait));
        return (hailName && contactName === hailName) || (hailPortrait && contactPortrait === hailPortrait);
      }) ?? null
    );
  }, [commsContacts, selectedMob]);
  const filteredCommsContacts = useMemo(() => {
    const query = commsContactSearch.trim().toLowerCase();
    if (!query) return commsContacts;
    return commsContacts.filter((contact) => {
      const haystack = [
        contact.id,
        contact.name,
        contact.portrait,
        contact.notes,
        contact.dialog.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [commsContactSearch, commsContacts]);
  const filteredHailImageOptions = useMemo(() => {
    const query = hailImageSearch.trim().toLowerCase();
    if (!query) return hailImageOptions;
    return hailImageOptions.filter((option) =>
      [option.fileName, option.relativePath, option.resPath].join(" ").toLowerCase().includes(query),
    );
  }, [hailImageOptions, hailImageSearch]);
  const filteredItemLootTables = useMemo(() => {
    const query = itemLootTableSearch.trim().toLowerCase();
    if (!query) return lootTables.items;
    return lootTables.items.filter((option) =>
      [option.id, ...option.entries.map((entry) => `${entry.id} ${entry.name ?? ""}`)].join(" ").toLowerCase().includes(query),
    );
  }, [itemLootTableSearch, lootTables.items]);
  const filteredModLootTables = useMemo(() => {
    const query = modLootTableSearch.trim().toLowerCase();
    if (!query) return lootTables.mods;
    return lootTables.mods.filter((option) =>
      [option.id, ...option.entries.map((entry) => `${entry.id} ${entry.name ?? ""}`)].join(" ").toLowerCase().includes(query),
    );
  }, [lootTables.mods, modLootTableSearch]);

  function updateSelectedMob(updater: (current: MobDraft) => MobDraft) {
    if (!workspace || !selectedMob) return;
    setWorkspace(updateMobDraftAt(workspace, selectedMob.key, updater));
  }

  function applyGeneratedStats(current: MobDraft, level = current.level, rank = current.stat_rank) {
    if (!level.trim() || Number.isNaN(Number(level))) return current;
    return {
      ...current,
      level,
      stat_rank: rank,
      stats: mergeGeneratedMobStats(current.stats, level, rank),
    };
  }

  function applyCommsContactToSelectedMob(contact: CommsContactDraft) {
    updateSelectedMob((current) => {
      const contactId = contact.id.trim();
      const nextCommsDirectory = contactId && !current.comms_directory.includes(contactId)
        ? [...current.comms_directory, contactId]
        : current.comms_directory;

      return {
        ...current,
        comms_directory: nextCommsDirectory,
        hail_name: contact.name.trim(),
        hail_portrait: resolvedPortraitPath(contact.portrait),
        hail_can_hail_target: true,
      };
    });
  }

  async function handleCreateMerchantProfileForSelectedMob() {
    if (!selectedMob) return;
    if (selectedMob.merchant_profile.trim()) {
      const shouldReplace = window.confirm(
        `This mob already points to merchant profile "${selectedMob.merchant_profile}". Create a new empty profile and replace that assignment?`,
      );
      if (!shouldReplace) return;
    }

    setIsCreatingMerchantProfile(true);
    try {
      const response = await fetch("/api/merchant-profiles/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mobId: selectedMob.id,
          displayName: selectedMob.display_name || selectedMob.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.profile) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not create a merchant profile in the local game source.",
          dismissAfterMs: null,
        });
        return;
      }

      const profile = payload.profile as MerchantProfileDraft;
      setMerchantProfiles((current) =>
        [...current.filter((entry) => entry.id.trim() !== profile.id.trim()), profile].sort((left, right) => {
          const leftLabel = (left.name || left.id).trim().toLowerCase();
          const rightLabel = (right.name || right.id).trim().toLowerCase();
          const byLabel = leftLabel.localeCompare(rightLabel);
          if (byLabel !== 0) return byLabel;
          return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
        }),
      );
      updateSelectedMob((current) => ({
        ...current,
        is_vendor: true,
        merchant_profile: profile.id.trim(),
      }));
      setMerchantProfileSearch(profile.id.trim());
      setStatus({
        tone: "success",
        message: `Created empty merchant profile "${profile.id}" and assigned it to ${selectedMob.id || selectedMob.display_name || "the selected mob"}.`,
        dismissAfterMs: 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    } finally {
      setIsCreatingMerchantProfile(false);
    }
  }

  function importText(
    text: string,
    sourceLabel: string | null,
    sourceType: "uploaded" | "pasted",
    options?: { showSuccessStatus?: boolean },
  ) {
    const showSuccessStatus = options?.showSuccessStatus ?? true;
    try {
      const result = importMobWorkspace(text, sourceLabel, sourceType);
      setWorkspace(result.workspace);
      setSelectedMobKey(result.workspace.mobs[0]?.key ?? null);
      if (showSuccessStatus) {
        setStatus({
          tone: "success",
          message: result.warnings.length
            ? `Imported ${result.workspace.mobs.length} mobs.${sourceLabel ? ` Source: ${sourceLabel}.` : ""} ${result.warnings.join(" ")}`
            : `Imported ${result.workspace.mobs.length} mobs${sourceLabel ? ` from ${sourceLabel}` : ""}.`,
          dismissAfterMs: 7000,
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function resetBrowserFilters() {
    setIssueFilter("all");
    setSearch("");
    setFactionFilter("");
    setAiFilter("");
  }

  function startBlankWorkspace() {
    const nextWorkspace = createBlankMobWorkspace();
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextWorkspace.mobs[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: "Started a blank Mob Lab workspace.",
      dismissAfterMs: 4000,
    });
  }

  function addBlankMob() {
    if (!workspace) {
      startBlankWorkspace();
      return;
    }

    const nextMob = createBlankMobDraft(workspace.mobs.map((mob) => mob.id));
    const nextWorkspace = insertMobDraftAfter(workspace, selectedMob?.key ?? null, nextMob);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextMob.key);
    setStatus({
      tone: "success",
      message: `Created new mob draft "${nextMob.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function cloneSelected() {
    if (!workspace || !selectedMob) return;
    const nextMob = cloneMobDraft(selectedMob, workspace.mobs.map((mob) => mob.id));
    const nextWorkspace = insertMobDraftAfter(workspace, selectedMob.key, nextMob);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextMob.key);
    setStatus({
      tone: "success",
      message: `Cloned "${selectedMob.id}" into "${nextMob.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function deleteSelected() {
    if (!workspace || !selectedMob) return;
    if (!window.confirm(`Delete mob "${selectedMob.id || selectedMob.display_name || "untitled"}"?`)) return;

    const nextWorkspace = deleteMobDraftAt(workspace, selectedMob.key);
    setWorkspace(nextWorkspace);
    setSelectedMobKey(nextWorkspace.mobs[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: `Deleted "${selectedMob.id || selectedMob.display_name || "untitled"}".`,
      dismissAfterMs: 4000,
    });
  }

  function handleWorkspaceExport(action: "download" | "copy") {
    if (!workspace) return;
    try {
      const contents = stringifyMobWorkspace(workspace);
      if (action === "download") {
        downloadTextFile("mobs.json", contents);
        setStatus({
          tone: "success",
          message: "Downloaded updated mobs.json.",
          dismissAfterMs: 7000,
        });
        return;
      }

      void copyToClipboard(contents).then(() =>
        setStatus({
          tone: "success",
          message: "Copied updated mobs.json to the clipboard.",
          dismissAfterMs: 7000,
        }),
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleSaveAllMobsToBuild() {
    if (!workspace) return;
    if (hasWorkspaceErrors) {
      setStatus({
        tone: "error",
        message: "Fix mob validation errors before saving mobs.json into the configured game build.",
        dismissAfterMs: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/mobs/save", {
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
          message: payload?.error || "Could not save mobs.json into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setStatus({
        tone: "success",
        message: `Saved all ${workspace.mobs.length} mobs into the live mobs.json file.`,
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

  function handleCurrentMobCopy() {
    if (!selectedMob) return;
    try {
      const contents = stringifySingleMob(selectedMob);
      void copyToClipboard(contents).then(() =>
        setStatus({
          tone: "success",
          message: `Copied ${selectedMob.id || "current mob"} JSON to the clipboard.`,
          dismissAfterMs: 5000,
        }),
      );
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  const hasWorkspaceErrors = validation.some((issue) => issue.level === "error");
  const hasActiveBrowserFilters = Boolean(issueFilter !== "all" || search.trim() || factionFilter || aiFilter);
  const workspaceSourceLabel =
    workspace?.sourceType === "uploaded" || workspace?.sourceType === "pasted"
      ? `${workspace.sourceLabel ?? "Local game source"} (${workspace.parseStrategy === "strict" ? "strict JSON" : "JSON5"})`
      : "Manual workspace";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="page-title mb-1">Mob Lab</h1>
          <p className="text-sm leading-6 text-white/65">
            Browse and manage the full mob roster from the active local game root, clone and edit existing mobs, create new mob IDs with
            collision alerts, and export the updated runtime file or copy JSON directly to the clipboard.
          </p>
        </div>

        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => void handleSaveAllMobsToBuild()}>
          Save All Mobs To Build
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn disabled:cursor-default disabled:opacity-40" disabled={!workspace || hasWorkspaceErrors} onClick={() => handleWorkspaceExport("download")}>
          Download Updated mobs.json
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
          <SummaryCard label="Workspace Mobs" value={summary.totalMobs} />
          <SummaryCard label="Factions" value={summary.factionCount} />
          <SummaryCard label="AI Types" value={summary.aiTypeCount} />
          <SummaryCard label="Duplicate IDs" value={summary.duplicateIdCount} accent={summary.duplicateIdCount ? "text-yellow-200" : undefined} />
          <SummaryCard label="Errors" value={summary.errorCount} accent={summary.errorCount ? "text-red-200" : undefined} />
        </div>
      ) : null}

      {!workspace ? (
        <>
          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">What Mob Lab Includes</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Browse mobs by name, ID, level, faction, and AI type.</div>
              <div>Clone existing mobs or create blank ones for new enemy/NPC work.</div>
              <div>Edit core fields, hail/comms data, loot tables, stats, services, scan fields, and extra runtime JSON.</div>
              <div>Get live duplicate-ID alerts and validation for invalid JSON blocks.</div>
              <div>Download the full updated `mobs.json`, copy the whole file JSON, or copy just the current mob JSON.</div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Local Game Root Required</div>
            <div className="text-sm leading-6 text-white/65">
              Mob Lab no longer loads separate `mobs.json` files. Set the Gemini Station local game root in Settings and the editor will
              automatically read `data/database/mobs/mobs.json` from that folder.
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
          <aside className="card h-fit space-y-4 xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Mob Browser</div>
                <div className="mt-1 text-sm text-white/55">{workspaceSourceLabel}</div>
              </div>
              <button className="btn shrink-0" onClick={addBlankMob}>
                New Mob
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  className={`rounded border px-3 py-2 text-left transition ${
                    issueFilter === "error"
                      ? "border-red-300/60 bg-red-500/20 text-red-50"
                      : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                  }`}
                  onClick={() => setIssueFilter((current) => (current === "error" ? "all" : "error"))}
                >
                  <div className="label text-red-100/80">Errors</div>
                  <div className="mt-1 text-lg font-semibold">{errorMobCount}</div>
                </button>
                <button
                  type="button"
                  className={`rounded border px-3 py-2 text-left transition ${
                    issueFilter === "warning"
                      ? "border-yellow-300/60 bg-yellow-500/20 text-yellow-50"
                      : "border-yellow-400/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
                  }`}
                  onClick={() => setIssueFilter((current) => (current === "warning" ? "all" : "warning"))}
                >
                  <div className="label text-yellow-100/80">Warnings</div>
                  <div className="mt-1 text-lg font-semibold">{warningMobCount}</div>
                </button>
              </div>

              <button
                type="button"
                className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
                disabled={!hasActiveBrowserFilters}
                onClick={resetBrowserFilters}
              >
                Reset Filter
              </button>

              <div>
                <div className="label">Search</div>
                <input
                  className="input mt-1"
                  value={search}
                  placeholder="Search ID, name, faction, AI, scene..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div>
                <div className="label">Faction</div>
                <select className="select mt-1 w-full" value={factionFilter} onChange={(event) => setFactionFilter(event.target.value)}>
                  <option value="">All factions</option>
                  {factionOptions.map(([value]) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="label">AI Type</div>
                <select className="select mt-1 w-full" value={aiFilter} onChange={(event) => setAiFilter(event.target.value)}>
                  <option value="">All AI types</option>
                  {aiOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <div className="label">Sort By</div>
                  <select className="select mt-1 w-full" value={sortBy} onChange={(event) => setSortBy(event.target.value as MobSortKey)}>
                    {MOB_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Direction</div>
                  <select
                    className="select mt-1 w-full"
                    value={sortDirection}
                    onChange={(event) => setSortDirection(event.target.value === "desc" ? "desc" : "asc")}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filteredMobs.length ? (
                filteredMobs.map((mob) => {
                  const issueFlags = issueFlagsByMobKey.get(mob.key);
                  const hasErrors = Boolean(issueFlags?.error);
                  const hasWarnings = Boolean(issueFlags?.warning);
                  const isDuplicate = duplicateIds.has(mob.id.trim());
                  const selected = selectedMob?.key === mob.key;
                  const spriteSrc = mob.sprite.trim()
                    ? buildIconSrc(mob.sprite || undefined, mob.id || "mob", mob.display_name || mob.id || "Mob", sharedDataVersion)
                    : "";

                  return (
                    <button
                      key={mob.key}
                      type="button"
                      onClick={() => setSelectedMobKey(mob.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                          : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          {spriteSrc ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={spriteSrc} alt={mob.display_name || mob.id || "Mob sprite"} className="h-full w-full object-contain" />
                          ) : (
                            <div className="px-2 text-center text-[11px] uppercase tracking-[0.12em] text-white/30">No Sprite</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold text-white">{mob.display_name || mob.id || "Untitled Mob"}</div>
                              <div className="mt-1 truncate text-xs text-white/50">{mob.id || "Missing ID"}</div>
                            </div>
                            <div className="rounded border border-white/10 px-2 py-1 text-xs text-white/70">Lv {mob.level || "?"}</div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {mob.faction ? <span className="badge">{mob.faction}</span> : null}
                            {mob.ai_type ? <span className="badge">{mob.ai_type}</span> : null}
                            {isDuplicate ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Duplicate ID</span> : null}
                            {hasErrors ? <span className="badge border border-red-300/20 bg-red-300/10 text-red-100">Needs Fixes</span> : null}
                            {!hasErrors && hasWarnings ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Warnings</span> : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                  No mobs match the current browser filters.
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {selectedMob ? (
              <>
                <div className="card space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-semibold text-white">{selectedMob.display_name || selectedMob.id || "Untitled Mob"}</div>
                      <div className="mt-1 text-sm text-white/55">
                        Editing mob {workspace.mobs.findIndex((mob) => mob.key === selectedMob.key) + 1} of {workspace.mobs.length}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn" onClick={cloneSelected}>
                        Clone Mob
                      </button>
                      <button
                        className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
                        disabled={selectedHasErrors}
                        onClick={handleCurrentMobCopy}
                      >
                        Copy Current Mob JSON
                      </button>
                      <button
                        className="rounded border border-red-400/20 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                        onClick={deleteSelected}
                      >
                        Delete Mob
                      </button>
                    </div>
                  </div>

                  {selectedDuplicateKeys.length ? (
                    <div className="rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      This mob ID already exists on {selectedDuplicateKeys.length} other mob{selectedDuplicateKeys.length === 1 ? "" : "s"} in the
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

                <Section title="Identity" description="Core fields used to identify and spawn the mob.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Mob ID</div>
                      <input
                        className={`input mt-1 ${selectedDuplicateKeys.length ? "border-red-300/35" : ""}`}
                        value={selectedMob.id}
                        placeholder="PirateFighter"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, id: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Display Name</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.display_name}
                        placeholder="Pirate Raider"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, display_name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Level</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.level}
                        placeholder="1"
                        onFocus={selectInputContents}
                        onChange={(event) => updateSelectedMob((current) => applyGeneratedStats(current, event.target.value))}
                      />
                      <div className="mt-1 text-xs text-white/45">Changing level regenerates the editable built-in stats below.</div>
                    </div>
                    <div>
                      <div className="label">Faction</div>
                      <select
                        className="select mt-1 w-full"
                        value={selectedMob.faction}
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, faction: event.target.value }))}
                      >
                        <option value="">No faction</option>
                        {factionOptions.map(([name, faction]) => (
                          <option key={name} value={name}>
                            {name}
                            {faction ? ` (${faction.forcedPoints ?? faction.defaultPoints})` : ""}
                          </option>
                        ))}
                      </select>
                      {selectedMob.faction.trim() && !selectedFaction ? (
                        <div className="mt-1 text-xs text-yellow-100/80">This faction is used by mobs but was not found in PlayerReputation.gd.</div>
                      ) : selectedFaction ? (
                        <div className="mt-1 text-xs text-white/45">
                          Default reputation: {selectedFaction.defaultPoints}
                          {selectedFaction.forcedPoints !== null ? ` · forced: ${selectedFaction.forcedPoints}` : ""}
                        </div>
                      ) : factionCatalogStatus ? (
                        <div className="mt-1 text-xs text-white/45">{factionCatalogStatus}</div>
                      ) : null}
                    </div>
                    <div>
                      <div className="label">AI Type</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.ai_type}
                        placeholder="BasicAI"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, ai_type: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Mob Tag</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mob_tag}
                        placeholder="red"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mob_tag: event.target.value }))}
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <div className="label">Scene</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scene}
                        placeholder="res://scenes/entities/PirateBasic.tscn"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scene: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Sprite</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.sprite}
                        placeholder="res://assets/ships/PirateFighter.png"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, sprite: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Mob End</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mob_end}
                        placeholder="0"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mob_end: event.target.value }))}
                      />
                    </div>
                    {spritePreviewSrc ? (
                      <div className="xl:col-span-2">
                        <div className="label">Sprite Preview</div>
                        <div className="mt-1 flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          <img src={spritePreviewSrc} alt={selectedMob.display_name || selectedMob.id || "Mob sprite"} className="h-full w-full object-contain" />
                        </div>
                      </div>
                    ) : null}
                    <div className="lg:col-span-2 xl:col-span-3">
                      <div className="label">Meta Description</div>
                      <textarea
                        className="input mt-1 min-h-28"
                        value={selectedMob.meta_description}
                        placeholder="Console-only notes about where this mob is used, where it appears, encounter context, or location details."
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, meta_description: event.target.value }))}
                      />
                      <div className="mt-2 text-xs text-white/45">Console-only field. This is not exported into the live game JSON.</div>
                    </div>
                  </div>
                </Section>

                <Section title="Flags and Runtime Controls" description="Common booleans and runtime references for attack, vendors, POIs, and repairs.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <ToggleField label="Can Attack" checked={selectedMob.can_attack} onChange={(next) => updateSelectedMob((current) => ({ ...current, can_attack: next }))} />
                    <ToggleField label="Vendor" checked={selectedMob.is_vendor} onChange={(next) => updateSelectedMob((current) => ({ ...current, is_vendor: next }))} />
                    <ToggleField
                      label="POI Visible"
                      checked={selectedMob.poi_show}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, poi_show: next }))}
                    />
                    <ToggleField
                      label="POI Requires Discovery"
                      checked={selectedMob.poi_require_discovery}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, poi_require_discovery: next }))}
                    />
                    <ToggleField
                      label="Can Be Hailed"
                      checked={selectedMob.hail_can_hail_target}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, hail_can_hail_target: next }))}
                    />
                    <div>
                      <div className="label">Repair Cost</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.repair_cost}
                        placeholder="0"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, repair_cost: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="label">Merchant Profile</div>
                          <div className="mt-1 text-xs text-white/45">
                            Pick from the active merchant profile catalog instead of typing profile IDs by hand.
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="rounded border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-300/15 disabled:cursor-default disabled:opacity-40"
                            disabled={isCreatingMerchantProfile}
                            onClick={() => void handleCreateMerchantProfileForSelectedMob()}
                          >
                            {isCreatingMerchantProfile ? "Creating..." : "Create + Assign"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
                            disabled={!selectedMob.merchant_profile.trim()}
                            onClick={() => updateSelectedMob((current) => ({ ...current, merchant_profile: "" }))}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <input
                        className="input"
                        value={merchantProfileSearch}
                        placeholder="Search merchant profiles by name, ID, description, item, or mod..."
                        onChange={(event) => setMerchantProfileSearch(event.target.value)}
                      />

                      {selectedMob.merchant_profile.trim() && !selectedMerchantProfile ? (
                        <div className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                          Current profile "{selectedMob.merchant_profile}" was not found in the merchant profile catalog.
                        </div>
                      ) : null}

                      {merchantProfileCatalogStatus ? (
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">{merchantProfileCatalogStatus}</div>
                      ) : null}

                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {filteredMerchantProfiles.length ? (
                          filteredMerchantProfiles.map((profile) => {
                            const isSelected = selectedMob.merchant_profile.trim() === profile.id.trim();
                            return (
                              <button
                                key={profile.key}
                                type="button"
                                className={`w-full rounded-xl border p-3 text-left transition ${
                                  isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                                }`}
                                onClick={() => updateSelectedMob((current) => ({ ...current, merchant_profile: profile.id.trim(), is_vendor: true }))}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-white">{profile.name.trim() || profile.id}</div>
                                    <div className="mt-1 font-mono text-xs text-white/45">{profile.id}</div>
                                  </div>
                                  <div className="shrink-0 rounded bg-white/5 px-2 py-1 text-xs text-white/55">
                                    {profile.items.length} item{profile.items.length === 1 ? "" : "s"} · {profile.mods.length} mod
                                    {profile.mods.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                                {profile.description.trim() ? (
                                  <div className="mt-2 line-clamp-2 text-sm leading-5 text-white/60">{profile.description}</div>
                                ) : null}
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                            No merchant profiles matched the current search.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>

                <Section title="Abilities, Services, and Comms" description="Edit array-style fields without touching raw JSON by hand.">
                  <div className="grid gap-6 xl:grid-cols-3">
                    <ArrayEditor
                      label="Abilities"
                      values={selectedMob.abilities}
                      emptyLabel="No abilities assigned."
                      addLabel="Add Ability"
                      placeholder="Ability ID"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, abilities: next }))}
                    />
                    <ArrayEditor
                      label="Services"
                      values={selectedMob.services}
                      emptyLabel="No services configured."
                      addLabel="Add Service"
                      placeholder="repair"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, services: next }))}
                    />
                    <ArrayEditor
                      label="Comms Directory"
                      values={selectedMob.comms_directory}
                      emptyLabel="No comms directory entries."
                      addLabel="Add Entry"
                      placeholder="Directory entry"
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, comms_directory: next }))}
                    />
                  </div>
                </Section>

                <Section title="Hail and Communication" description="Optional fields for hail windows, portraits, and flavor copy.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-3 lg:col-span-2 xl:col-span-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="label">Comms Contact</div>
                          <div className="mt-1 text-xs text-white/45">
                            Choose a comms contact to fill the hail name and portrait from `Comms.json`.
                          </div>
                        </div>
                        <div className="text-xs text-white/45">
                          {selectedCommsContact ? `Selected: ${selectedCommsContact.name || selectedCommsContact.id}` : "No comms contact selected"}
                        </div>
                      </div>

                      <input
                        className="input"
                        value={commsContactSearch}
                        placeholder="Search comms contacts by name, ID, notes, dialog, or portrait..."
                        onChange={(event) => setCommsContactSearch(event.target.value)}
                      />

                      {commsCatalogStatus ? (
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">{commsCatalogStatus}</div>
                      ) : null}

                      {selectedMob.hail_name.trim() && !selectedCommsContact ? (
                        <div className="rounded-lg border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                          Current hail identity is not matched to a comms contact yet.
                        </div>
                      ) : null}

                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {filteredCommsContacts.length ? (
                          filteredCommsContacts.map((contact) => {
                            const isSelected = selectedCommsContact?.id.trim() === contact.id.trim();
                            const contactPortraitPath = resolvedPortraitPath(contact.portrait);
                            return (
                              <button
                                key={contact.key}
                                type="button"
                                className={`w-full rounded-xl border p-3 text-left transition ${
                                  isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                                }`}
                                onClick={() => applyCommsContactToSelectedMob(contact)}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                                    <img
                                      src={buildIconSrc(contactPortraitPath, contact.id, contact.name || contact.id || "Comms contact", sharedDataVersion)}
                                      alt={contact.name || contact.id || "Comms contact"}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-white">{contact.name.trim() || contact.id}</div>
                                        <div className="mt-1 font-mono text-xs text-white/45">{contact.id}</div>
                                      </div>
                                      {isSelected ? <div className="rounded bg-cyan-300/15 px-2 py-1 text-xs font-medium text-cyan-100">Selected</div> : null}
                                    </div>
                                    <div className={`mt-2 line-clamp-2 text-sm leading-5 ${contact.notes.trim() ? "text-white/60" : "text-white/35"}`}>
                                      {contact.notes.trim() || "No comms notes."}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                            No comms contacts matched the current search.
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                          <div className="label">Hail Name</div>
                          <div className="mt-2 text-sm text-white/80">{selectedMob.hail_name || "Not set"}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                          <div className="label">Hail Portrait</div>
                          <div className="mt-2 break-all font-mono text-xs text-white/60">{selectedMob.hail_portrait || "Not set"}</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 lg:col-span-2 xl:col-span-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="label">Hail Image</div>
                          <div className="mt-1 text-xs text-white/45">
                            Choose a background image from `res://assets/hail_image/`, or edit the path directly if needed.
                          </div>
                        </div>
                        <div className="shrink-0 rounded border border-white/10 px-3 py-2 text-xs text-white/55">
                          {hailImageOptions.length} image option{hailImageOptions.length === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)]">
                        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          {hailImagePreviewSrc ? (
                            <img
                              src={hailImagePreviewSrc}
                              alt={selectedMob.hail_name || selectedMob.display_name || selectedMob.id || "Hail image"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="px-3 text-center text-xs text-white/35">No hail image</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <input
                            className="input"
                            value={selectedMob.hail_image}
                            placeholder="res://assets/hail_image/example.png"
                            onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_image: event.target.value }))}
                          />
                          <input
                            className="input"
                            value={hailImageSearch}
                            placeholder="Search hail images by file name or path..."
                            onChange={(event) => setHailImageSearch(event.target.value)}
                          />
                          {hailImageCatalogStatus ? (
                            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">{hailImageCatalogStatus}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto pr-1">
                        {filteredHailImageOptions.length ? (
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {filteredHailImageOptions.map((option) => {
                              const isSelected = selectedMob.hail_image.trim() === option.resPath;
                              return (
                                <button
                                  key={option.resPath}
                                  type="button"
                                  className={`rounded-xl border p-2 text-left transition ${
                                    isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                                  }`}
                                  onClick={() => updateSelectedMob((current) => ({ ...current, hail_image: option.resPath }))}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                                      <img
                                        src={buildIconSrc(option.resPath, option.fileName, option.fileName, sharedDataVersion)}
                                        alt={option.fileName}
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-white">{option.fileName}</div>
                                      <div className="mt-1 truncate font-mono text-xs text-white/45">{option.relativePath}</div>
                                      {isSelected ? <div className="mt-2 text-xs font-medium text-cyan-100">Selected</div> : null}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                            No hail images matched the current search.
                          </div>
                        )}
                      </div>
                    </div>
                    {hailPortraitPreviewSrc ? (
                      <div>
                        <div className="label">Portrait Preview</div>
                        <div className="mt-1 flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                          <img
                            src={hailPortraitPreviewSrc}
                            alt={selectedMob.hail_name || selectedMob.display_name || selectedMob.id || "Hail portrait"}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="lg:col-span-2 xl:col-span-3">
                      <div className="label">Hail Greeting</div>
                      <textarea
                        className="input mt-1 min-h-28"
                        value={selectedMob.hail_greeting}
                        placeholder="This is the UTF Flagship Terran One, how can we be of assistance?"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, hail_greeting: event.target.value }))}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Loot and Drop Tables" description="Item and mod drop configuration, rarity bounds, and duplicate rules.">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LootTablePicker
                      label="Item Loot Table"
                      value={selectedMob.item_loot_table}
                      placeholder="pirate_basic_items"
                      allOptions={lootTables.items}
                      options={filteredItemLootTables}
                      search={itemLootTableSearch}
                      status={lootTableCatalogStatus}
                      onSearchChange={setItemLootTableSearch}
                      onValueChange={(next) => updateSelectedMob((current) => ({ ...current, item_loot_table: next }))}
                    />
                    <LootTablePicker
                      label="Mod Loot Table"
                      value={selectedMob.mod_loot_table}
                      placeholder="pirate_mods_t1"
                      allOptions={lootTables.mods}
                      options={filteredModLootTables}
                      search={modLootTableSearch}
                      status={lootTableCatalogStatus}
                      onSearchChange={setModLootTableSearch}
                      onValueChange={(next) => updateSelectedMob((current) => ({ ...current, mod_loot_table: next }))}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Item Drop Chance</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.item_drop_chance}
                        placeholder="0.5"
                        onFocus={selectInputContents}
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, item_drop_chance: event.target.value }))}
                      />
                    </div>
                    <ToggleField
                      label="Item No Duplicates"
                      checked={selectedMob.item_no_duplicates}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, item_no_duplicates: next }))}
                    />

                    <div>
                      <div className="label">Mod Drop Chance</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.mod_drop_chance}
                        placeholder="1"
                        onFocus={selectInputContents}
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, mod_drop_chance: event.target.value }))}
                      />
                    </div>
                    <ToggleField
                      label="Mod No Duplicates"
                      checked={selectedMob.mod_no_duplicates}
                      onChange={(next) => updateSelectedMob((current) => ({ ...current, mod_no_duplicates: next }))}
                    />

                    <div>
                      <div className="label">Min Mod Rarity</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.min_mod_rarity}
                        placeholder="0"
                        onFocus={selectInputContents}
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, min_mod_rarity: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Max Mod Rarity</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.max_mod_rarity}
                        placeholder="2"
                        onFocus={selectInputContents}
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, max_mod_rarity: event.target.value }))}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Stats" description="Built-in combat and utility stats stay in dedicated inputs. Custom stats can be added below.">
                  <div className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <div className="label">Stat Generation Rank</div>
                      <select
                        className="select mt-1 w-full"
                        value={selectedMob.stat_rank || "normal"}
                        onChange={(event) => updateSelectedMob((current) => applyGeneratedStats(current, current.level, event.target.value))}
                      >
                        {MOB_STAT_RANK_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-xs leading-5 text-white/50">
                      Level and rank generate the editable defaults. Manual stat edits still work; use regenerate if you want to reapply the curve.
                    </div>
                    <button
                      type="button"
                      className="rounded border border-cyan-300/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
                      onClick={() => updateSelectedMob((current) => applyGeneratedStats(current))}
                    >
                      Regenerate Stats
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {BUILT_IN_MOB_STAT_KEYS.map((statKey) => (
                      <div key={statKey}>
                        <div className="label">{labelize(statKey)}</div>
                        <input
                          className="input mt-1"
                          value={selectedMob.stats[statKey] ?? ""}
                          placeholder="0"
                          onFocus={selectInputContents}
                          onChange={(event) =>
                            updateSelectedMob((current) => ({
                              ...current,
                              stats: {
                                ...current.stats,
                                [statKey]: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">Custom Stats</div>
                        <div className="text-xs text-white/50">Any non-standard stat keys are preserved here and merged into the exported `stats` block.</div>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                        onClick={() =>
                          updateSelectedMob((current) => ({
                            ...current,
                            stats: {
                              ...current.stats,
                              [`custom_stat_${Object.keys(current.stats).length + 1}`]: "0",
                            },
                          }))
                        }
                      >
                        Add Custom Stat
                      </button>
                    </div>

                    <div className="space-y-2">
                      {Object.keys(selectedMob.stats)
                        .filter((statKey) => !BUILT_IN_MOB_STAT_KEYS.includes(statKey as (typeof BUILT_IN_MOB_STAT_KEYS)[number]))
                        .sort((left, right) => left.localeCompare(right))
                        .map((statKey) => (
                          <div key={statKey} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                            <input
                              className="input"
                              value={statKey}
                              placeholder="custom_key"
                              onFocus={selectInputContents}
                              onChange={(event) =>
                                updateSelectedMob((current) => {
                                  const nextKey = event.target.value.trim();
                                  if (!nextKey || nextKey === statKey || nextKey in current.stats) return current;
                                  const nextStats = { ...current.stats };
                                  const existingValue = nextStats[statKey];
                                  delete nextStats[statKey];
                                  nextStats[nextKey] = existingValue;
                                  return {
                                    ...current,
                                    stats: nextStats,
                                  };
                                })
                              }
                            />
                            <input
                              className="input"
                              value={selectedMob.stats[statKey] ?? ""}
                              placeholder="0"
                              onFocus={selectInputContents}
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  stats: {
                                    ...current.stats,
                                    [statKey]: event.target.value,
                                  },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                              onClick={() =>
                                updateSelectedMob((current) => {
                                  const nextStats = { ...current.stats };
                                  delete nextStats[statKey];
                                  return {
                                    ...current,
                                    stats: nextStats,
                                  };
                                })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      {Object.keys(selectedMob.stats).filter(
                        (statKey) => !BUILT_IN_MOB_STAT_KEYS.includes(statKey as (typeof BUILT_IN_MOB_STAT_KEYS)[number]),
                      ).length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">No custom stats added.</div>
                      ) : null}
                    </div>
                  </div>
                </Section>

                <Section title="Scan Data" description="Edit the structured scan fields directly, including as many threshold tiers as you need.">
                  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <div className="label">Scan Faction</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scan_faction}
                        placeholder="Gem"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_faction: event.target.value }))}
                      />
                    </div>
                    <div>
                      <div className="label">Scan Class</div>
                      <input
                        className="input mt-1"
                        value={selectedMob.scan_class}
                        placeholder="Support Craft"
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_class: event.target.value }))}
                      />
                    </div>
                    <div className="lg:col-span-2 xl:col-span-3">
                      <div className="label">Scan Notes</div>
                      <textarea
                        className="input mt-1 min-h-28"
                        value={selectedMob.scan_notes}
                        placeholder="Support ships are the resupplying arm of every faction."
                        onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_notes: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-white/10 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">Scan Tiers</div>
                        <div className="text-xs text-white/50">
                          Each tier uses a numeric threshold and the text revealed at that scan level.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                        onClick={() =>
                          updateSelectedMob((current) => ({
                            ...current,
                            scan_tiers: [...current.scan_tiers, createBlankScanTierDraft()],
                          }))
                        }
                      >
                        Add Tier
                      </button>
                    </div>

                    {selectedMob.scan_tiers.length ? (
                      <div className="space-y-2">
                        {selectedMob.scan_tiers.map((tier) => (
                          <div key={tier.key} className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_auto]">
                            <input
                              type="number"
                              className="input"
                              value={tier.threshold}
                              placeholder="5"
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.map((entry) =>
                                    entry.key === tier.key ? { ...entry, threshold: event.target.value } : entry,
                                  ),
                                }))
                              }
                            />
                            <input
                              className="input"
                              value={tier.text}
                              placeholder="Docking chatter detected."
                              onChange={(event) =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.map((entry) =>
                                    entry.key === tier.key ? { ...entry, text: event.target.value } : entry,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                              onClick={() =>
                                updateSelectedMob((current) => ({
                                  ...current,
                                  scan_tiers: current.scan_tiers.filter((entry) => entry.key !== tier.key),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                        No scan tiers yet. Add one to define reveal thresholds.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-sm font-medium text-white">Scan Extra JSON</div>
                      <div className="mt-1 text-xs text-white/50">
                        Unsupported scan keys are preserved here. Reserved keys like `Faction`, `Class`, `Notes`, and `tiers` should stay in the fields above.
                      </div>
                    </div>
                    <textarea
                      className="input min-h-36 font-mono text-sm"
                      value={selectedMob.scan_extra_json}
                      placeholder='{\n  "Discovery": "Optional unsupported scan fields stay here."\n}'
                      onChange={(event) => updateSelectedMob((current) => ({ ...current, scan_extra_json: event.target.value }))}
                    />
                  </div>
                </Section>

                <Section title="Extra JSON" description="Unknown runtime fields stay here and are merged back into the mob at export time.">
                  <textarea
                    className="input min-h-48 font-mono text-sm"
                    value={selectedMob.extra_json}
                    placeholder='{\n  "note above": "Preserved custom runtime fields go here."\n}'
                    onChange={(event) => updateSelectedMob((current) => ({ ...current, extra_json: event.target.value }))}
                  />
                </Section>
              </>
            ) : (
              <div className="card py-10 text-center">
                <div className="text-xl font-semibold text-white">No mob selected</div>
                <div className="mt-2 text-sm text-white/55">Choose a mob from the browser or create a new mob draft.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
