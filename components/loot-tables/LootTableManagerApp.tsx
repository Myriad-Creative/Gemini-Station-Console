"use client";

import { useEffect, useMemo, useState } from "react";
import { MOD_SLOT_OPTIONS, RARITY_COLOR, RARITY_LABEL } from "@lib/constants";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type LootTableAbility = {
  id: string;
  name: string;
  description: string;
  icon: string;
  cooldown: number | null;
  chargeTime: number | null;
  energyCost: number | null;
  attackRange: number | null;
  radiusLabel: string | null;
  radiusMeters: number | null;
  damageType: string | null;
  facingRequirement: string | null;
  primaryModSlot: string | null;
  secondaryModSlot: string | null;
  isGcdLocked: boolean;
  effectNames: string[];
  notes: string[];
  missing: boolean;
};

type LootTableModRecord = {
  id: string;
  name: string;
  slot: string;
  classRestriction?: string[];
  levelRequirement: number;
  itemLevel?: number;
  rarity: number;
  durability?: number;
  sellPrice?: number;
  stats: Record<string, number>;
  icon?: string;
  description?: string;
  abilities: LootTableAbility[];
};

type LootTableItemRecord = {
  id: string;
  name: string;
  levelRequirement: number;
  rarity: number;
  icon?: string;
  type?: string;
  description?: string;
  stats?: Record<string, number>;
};

type LootTableEntry<TRecord> = {
  id: string;
  weight: number;
  probability: number;
  name: string | null;
  missing: boolean;
  record: TRecord | null;
};

type LootTableOption<TRecord> = {
  id: string;
  rolls: number;
  entryCount: number;
  totalWeight: number;
  entries: LootTableEntry<TRecord>[];
};

type LootTablePayload = {
  ok: boolean;
  sourceLabel?: string;
  error?: string;
  data?: {
    mods: LootTableOption<LootTableModRecord>[];
    items: LootTableOption<LootTableItemRecord>[];
    catalogs: {
      mods: LootTableModRecord[];
      items: LootTableItemRecord[];
    };
  };
};

type LootKind = "mods" | "items";
type StatusTone = "neutral" | "success" | "error";
type SaveStatus = {
  tone: StatusTone;
  message: string;
};

function rarityStyle(rarity: number) {
  return { color: RARITY_COLOR[rarity] || "#C0C0C0" };
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSeconds(value: number | null | undefined) {
  const text = formatNumber(value);
  return text ? `${text}s` : "";
}

function formatEnergyCost(ability: LootTableAbility) {
  if (ability.energyCost === null || ability.energyCost <= 0) return "No Energy Cost";
  return `${formatNumber(ability.energyCost)} Energy`;
}

function formatCastTime(ability: LootTableAbility) {
  if (ability.chargeTime === null || ability.chargeTime <= 0) return "Instant cast";
  return `${formatSeconds(ability.chargeTime)} cast`;
}

function formatCooldown(ability: LootTableAbility) {
  if (ability.cooldown === null || ability.cooldown <= 0) return "No cooldown";
  return `${formatSeconds(ability.cooldown)} cooldown`;
}

function statLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statValue(value: number) {
  if (!Number.isFinite(value)) return String(value);
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}`;
}

function normalizeClientId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^-?\d+(?:\.0+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

function rebuildTable<TRecord extends { id: string; name: string }>(table: LootTableOption<TRecord>, catalogById: Map<string, TRecord>): LootTableOption<TRecord> {
  const entriesWithoutProbability = table.entries
    .map((entry) => {
      const id = normalizeClientId(entry.id);
      const weight = Number(entry.weight);
      const record = catalogById.get(id) ?? null;
      return {
        id,
        weight: Number.isFinite(weight) ? weight : 0,
        name: record?.name ?? null,
        missing: !record,
        record,
      };
    })
    .filter((entry) => entry.id);
  const totalWeight = entriesWithoutProbability.reduce((total, entry) => total + (entry.weight > 0 ? entry.weight : 0), 0);
  return {
    ...table,
    rolls: Number.isFinite(Number(table.rolls)) ? Number(table.rolls) : 1,
    entryCount: entriesWithoutProbability.length,
    totalWeight,
    entries: entriesWithoutProbability.map((entry) => ({
      ...entry,
      probability: totalWeight > 0 && entry.weight > 0 ? entry.weight / totalWeight : 0,
    })),
  };
}

function tableIdBase(kind: LootKind) {
  return kind === "mods" ? "new_mod_loot_table" : "new_item_loot_table";
}

function makeUniqueTableId(baseId: string, tables: Array<Pick<LootTableOption<unknown>, "id">>) {
  const normalizedBase = (baseId.trim() || "new_loot_table").replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "") || "new_loot_table";
  const existing = new Set(tables.map((table) => table.id.toLowerCase()));
  if (!existing.has(normalizedBase.toLowerCase())) return normalizedBase;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${normalizedBase}_${index}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${normalizedBase}_${Date.now()}`;
}

function exportTables<TRecord>(tables: LootTableOption<TRecord>[]) {
  return tables.map((table) => ({
    id: table.id,
    rolls: Number(table.rolls),
    entries: table.entries.map((entry) => ({
      id: normalizeClientId(entry.id),
      weight: Number(entry.weight),
    })),
  }));
}

function validateDraftTables<TRecord>(kind: LootKind, tables: LootTableOption<TRecord>[], catalogById: Map<string, TRecord>) {
  const errors: string[] = [];
  const tableIds = new Set<string>();
  for (const table of tables) {
    const id = table.id.trim();
    if (!id) {
      errors.push("Every loot table needs an ID.");
    } else if (!/^[A-Za-z0-9_.:-]+$/.test(id)) {
      errors.push(`Table "${id}" can only use letters, numbers, underscores, hyphens, periods, and colons.`);
    } else if (tableIds.has(id.toLowerCase())) {
      errors.push(`Duplicate table ID "${id}".`);
    }
    if (id) tableIds.add(id.toLowerCase());

    if (!Number.isFinite(Number(table.rolls)) || Number(table.rolls) <= 0) {
      errors.push(`Table "${id || "Untitled"}" needs a positive rolls value.`);
    }

    const entryIds = new Set<string>();
    for (const entry of table.entries) {
      const entryId = normalizeClientId(entry.id);
      if (!entryId) {
        errors.push(`Table "${id || "Untitled"}" has an entry with no ${kind === "mods" ? "mod" : "item"} ID.`);
      } else if (entryIds.has(entryId)) {
        errors.push(`Table "${id || "Untitled"}" contains duplicate ${kind === "mods" ? "mod" : "item"} ID "${entryId}".`);
      } else if (!catalogById.has(entryId)) {
        errors.push(`Table "${id || "Untitled"}" references unknown ${kind === "mods" ? "mod" : "item"} ID "${entryId}".`);
      }
      if (entryId) entryIds.add(entryId);

      if (!Number.isFinite(Number(entry.weight)) || Number(entry.weight) <= 0) {
        errors.push(`Table "${id || "Untitled"}" entry "${entryId || "unknown"}" needs a positive weight.`);
      }
    }
  }
  return errors;
}

function AbilityTooltip({ ability, className = "" }: { ability: LootTableAbility; className?: string }) {
  const headerLines = [
    ability.damageType,
    ability.attackRange ? `Range: ${formatNumber(ability.attackRange)}m` : null,
    formatCooldown(ability),
  ].filter((line): line is string => Boolean(line));

  const slots = [ability.primaryModSlot, ability.secondaryModSlot].filter((slot): slot is string => Boolean(slot));
  const detailLines = [
    ability.facingRequirement,
    ability.radiusMeters ? `${ability.radiusLabel || "Radius"}: ${formatNumber(ability.radiusMeters)}m` : null,
    slots.length ? `Mod slot${slots.length === 1 ? "" : "s"}: ${slots.join(" / ")}` : null,
    ability.effectNames.length ? `Applies: ${ability.effectNames.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <div
      className={`rounded-lg border px-3.5 py-3 text-left shadow-2xl ${className}`}
      style={{
        width: "100%",
        background: "rgba(4, 6, 13, 0.97)",
        borderColor: "rgba(35, 48, 59, 1)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold leading-tight text-white">{ability.name}</div>
          <div className="mt-1 text-lg leading-6 text-white/90">
            <div>{formatEnergyCost(ability)}</div>
            <div>{formatCastTime(ability)}</div>
          </div>
        </div>
        <div className="shrink-0 text-right text-lg leading-7 text-[#8fa3b8]">
          {headerLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>

      {detailLines.length ? (
        <div className="mt-3 space-y-1 text-base leading-6 text-[#8fa3b8]">
          {detailLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className={`mt-3 text-lg leading-7 ${ability.missing ? "text-amber-200" : "text-[#45c7dc]"}`}>
        {ability.description || "No description available."}
      </div>

      {ability.notes.length ? (
        <div className="mt-2 space-y-1 text-base leading-6 text-amber-200">
          {ability.notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 text-right text-sm text-[#8fa3b8]">ID: {ability.id}</div>
    </div>
  );
}

function AbilityIconButton({
  ability,
  version,
  active = false,
  sizeClass = "h-12 w-12",
  onActivate,
}: {
  ability: LootTableAbility;
  version?: string;
  active?: boolean;
  sizeClass?: string;
  onActivate?: (ability: LootTableAbility) => void;
}) {
  const iconSrc = buildIconSrc(ability.icon || "icon_lootbox.png", ability.id, ability.name, version);

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => onActivate?.(ability)}
        onFocus={() => onActivate?.(ability)}
        onClick={() => onActivate?.(ability)}
        className={`${sizeClass} shrink-0 overflow-hidden rounded border bg-black/30 transition ${
          active
            ? "border-cyan-200 shadow-[0_0_0_2px_rgba(34,211,238,0.18)]"
            : ability.missing
              ? "border-amber-300/35 hover:border-amber-200"
              : "border-white/15 hover:border-cyan-300/60"
        }`}
        aria-label={ability.name}
      >
        <img src={iconSrc} alt="" className="h-full w-full object-cover" />
      </button>
      <span className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-50 hidden w-[min(520px,calc(100vw-2rem))] group-hover:block group-focus-within:block">
        <AbilityTooltip ability={ability} />
      </span>
    </span>
  );
}

type AbilityTableRow = {
  ability: LootTableAbility;
  mods: LootTableModRecord[];
  totalWeight: number;
  probability: number;
};

function collectAbilityRows(table: LootTableOption<LootTableModRecord>) {
  const rows = new Map<string, AbilityTableRow>();
  for (const entry of table.entries) {
    if (!entry.record) continue;
    for (const ability of entry.record.abilities) {
      const current = rows.get(ability.id) ?? { ability, mods: [], totalWeight: 0, probability: 0 };
      if (!current.mods.some((mod) => mod.id === entry.record?.id)) current.mods.push(entry.record);
      current.totalWeight += entry.weight;
      rows.set(ability.id, current);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      probability: table.totalWeight > 0 && row.totalWeight > 0 ? row.totalWeight / table.totalWeight : 0,
    }))
    .sort((left, right) => left.ability.name.localeCompare(right.ability.name, undefined, { numeric: true, sensitivity: "base" }));
}

function TablePicker({
  kind,
  tables,
  selectedId,
  search,
  onSearch,
  onSelect,
}: {
  kind: LootKind;
  tables: LootTableOption<LootTableModRecord | LootTableItemRecord>[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const filteredTables = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter((table) => table.id.toLowerCase().includes(query));
  }, [search, tables]);

  return (
    <aside className="rounded-lg border border-white/10 bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{kind === "mods" ? "Mod Tables" : "Item Tables"}</div>
          <div className="mt-1 text-sm text-white/55">{tables.length} tables</div>
        </div>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">{filteredTables.length}</span>
      </div>

      <input className="input mt-4" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search tables" />

      <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
        {filteredTables.map((table) => {
          const selected = selectedId === table.id;
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelect(table.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                selected ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
              }`}
            >
              <div className="truncate font-mono text-sm text-white">{table.id}</div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-white/55">
                <span>{table.entryCount} entries</span>
                <span>{formatNumber(table.rolls)} rolls</span>
              </div>
            </button>
          );
        })}

        {!filteredTables.length ? <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/55">No tables match.</div> : null}
      </div>
    </aside>
  );
}

function SummaryStrip({
  kind,
  tables,
  selectedTable,
}: {
  kind: LootKind;
  tables: LootTableOption<LootTableModRecord | LootTableItemRecord>[];
  selectedTable: LootTableOption<LootTableModRecord | LootTableItemRecord> | null;
}) {
  const uniqueEntryCount = useMemo(() => new Set(tables.flatMap((table) => table.entries.map((entry) => entry.id))).size, [tables]);
  const missingCount = useMemo(() => tables.flatMap((table) => table.entries).filter((entry) => entry.missing).length, [tables]);

  const cells = [
    { label: "Tables", value: tables.length },
    { label: kind === "mods" ? "Unique Mods" : "Unique Items", value: uniqueEntryCount },
    { label: "Selected Entries", value: selectedTable?.entryCount ?? 0 },
    { label: "Missing", value: missingCount },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border border-white/10 bg-panel px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-white/45">{cell.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${cell.label === "Missing" && cell.value ? "text-amber-200" : "text-white"}`}>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

function ModLootCard({
  entry,
  version,
  onRemove,
  onWeightChange,
}: {
  entry: LootTableEntry<LootTableModRecord>;
  version?: string;
  onRemove: () => void;
  onWeightChange: (weight: number) => void;
}) {
  const mod = entry.record;
  if (!mod) {
    return (
      <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
        <div className="font-mono text-base">Missing mod {entry.id}</div>
        <div className="mt-2 text-xs">
          Drop weight {entry.weight} • chance {formatPercent(entry.probability)}
        </div>
      </div>
    );
  }

  const stats = Object.entries(mod.stats || {}).filter(([, value]) => value !== 0);
  const classRestriction = mod.classRestriction?.length ? mod.classRestriction.join(", ") : "None";

  return (
    <article
      className="rounded-lg border px-4 py-4 shadow-xl"
      style={{
        background: "rgba(4, 6, 13, 0.94)",
        borderColor: "rgba(35, 48, 59, 1)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-white/15 bg-black/30">
          <img src={buildIconSrc(mod.icon || "icon_lootbox.png", mod.id, mod.name, version)} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-semibold leading-tight" style={rarityStyle(mod.rarity)}>
            {mod.name}
          </div>
          <div className="mt-1 flex items-start justify-between gap-3 text-lg leading-6 text-white/90">
            <span>{mod.slot}</span>
            <span className="max-w-[45%] truncate text-right text-[#d8dee8]">{classRestriction}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-lg leading-7 text-[#dfe7f1]">
        {stats.length ? (
          stats.map(([key, value]) => (
            <div key={key}>
              {statValue(value)} {statLabel(key)}
            </div>
          ))
        ) : (
          <div>No stats</div>
        )}
        <div>Requires Level {mod.levelRequirement}</div>
        {mod.durability !== undefined ? <div>Durability: {formatNumber(mod.durability)}</div> : null}
      </div>

      {mod.description ? <div className="mt-3 line-clamp-3 text-sm leading-5 text-white/55">{mod.description}</div> : null}

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 text-lg leading-none text-[#45c7dc]">Ability</div>
          <div className="flex flex-wrap gap-2">
            {mod.abilities.length ? (
              mod.abilities.map((ability) => (
                <AbilityIconButton key={`${mod.id}-${ability.id}`} ability={ability} version={version} />
              ))
            ) : (
              <span className="text-sm text-white/45">None</span>
            )}
          </div>
        </div>
        <div className="grid w-28 shrink-0 gap-2 text-right text-xs text-white/45">
          <label>
            <span className="mb-1 block text-white/45">Drop weight</span>
            <input
              className="input h-8 px-2 py-1 text-right text-xs"
              type="number"
              min="1"
              step="1"
              value={entry.weight}
              onChange={(event) => onWeightChange(Number(event.target.value))}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div>Chance {formatPercent(entry.probability)}</div>
          <button type="button" onClick={onRemove} className="rounded border border-red-300/25 px-2 py-1 text-xs text-red-100 hover:bg-red-400/10">
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}

function ModCatalogAddCard({
  mod,
  version,
  weight,
  onWeightChange,
  onAdd,
}: {
  mod: LootTableModRecord;
  version?: string;
  weight: string;
  onWeightChange: (value: string) => void;
  onAdd: () => void;
}) {
  const stats = Object.entries(mod.stats || {}).filter(([, value]) => value !== 0);
  const classRestriction = mod.classRestriction?.length ? mod.classRestriction.join(", ") : "None";
  const parsedWeight = Number(weight);
  const canAdd = Number.isFinite(parsedWeight) && parsedWeight > 0;

  return (
    <article
      className="rounded-lg border px-4 py-4 shadow-xl"
      style={{
        background: "rgba(4, 6, 13, 0.94)",
        borderColor: "rgba(35, 48, 59, 1)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-white/15 bg-black/30">
          <img src={buildIconSrc(mod.icon || "icon_lootbox.png", mod.id, mod.name, version)} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-semibold leading-tight" style={rarityStyle(mod.rarity)}>
            {mod.name}
          </div>
          <div className="mt-1 flex items-start justify-between gap-3 text-lg leading-6 text-white/90">
            <span>{mod.slot}</span>
            <span className="max-w-[45%] truncate text-right text-[#d8dee8]">{classRestriction}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-lg leading-7 text-[#dfe7f1]">
        {stats.length ? (
          stats.map(([key, value]) => (
            <div key={key}>
              {statValue(value)} {statLabel(key)}
            </div>
          ))
        ) : (
          <div>No stats</div>
        )}
        <div>Requires Level {mod.levelRequirement}</div>
        {mod.durability !== undefined ? <div>Durability: {formatNumber(mod.durability)}</div> : null}
      </div>

      {mod.description ? <div className="mt-3 line-clamp-3 text-sm leading-5 text-white/55">{mod.description}</div> : null}

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 text-lg leading-none text-[#45c7dc]">Ability</div>
          <div className="flex flex-wrap gap-2">
            {mod.abilities.length ? (
              mod.abilities.map((ability) => <AbilityIconButton key={`${mod.id}-${ability.id}`} ability={ability} version={version} />)
            ) : (
              <span className="text-sm text-white/45">None</span>
            )}
          </div>
        </div>
        <div className="grid w-28 shrink-0 gap-2 text-right text-xs text-white/45">
          <label>
            <span className="mb-1 block text-white/45">Drop weight</span>
            <input
              className="input h-8 px-2 py-1 text-right text-xs"
              type="number"
              min="1"
              step="1"
              value={weight}
              onChange={(event) => onWeightChange(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button type="button" onClick={onAdd} disabled={!canAdd} className="rounded border border-cyan-300/35 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
            Add Mod
          </button>
        </div>
      </div>
    </article>
  );
}

function ModAddControl({
  catalog,
  existingIds,
  version,
  onAdd,
}: {
  catalog: LootTableModRecord[];
  existingIds: Set<string>;
  version?: string;
  onAdd: (id: string, weight: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [maxLevel, setMaxLevel] = useState("");
  const [rarity, setRarity] = useState("all");
  const [slot, setSlot] = useState("all");
  const [weights, setWeights] = useState<Record<string, string>>({});

  const availableCatalog = useMemo(() => catalog.filter((mod) => !existingIds.has(normalizeClientId(mod.id))), [catalog, existingIds]);
  const rarityOptions = useMemo(() => [...new Set(availableCatalog.map((mod) => mod.rarity))].sort((left, right) => left - right), [availableCatalog]);
  const slotOptions = useMemo(() => {
    const catalogSlots = availableCatalog.map((mod) => mod.slot).filter(Boolean);
    return [...new Set([...MOD_SLOT_OPTIONS, ...catalogSlots])].sort((left, right) => left.localeCompare(right));
  }, [availableCatalog]);

  const filteredMods = useMemo(() => {
    const query = search.trim().toLowerCase();
    const min = minLevel.trim() ? Number(minLevel) : null;
    const max = maxLevel.trim() ? Number(maxLevel) : null;

    return availableCatalog.filter((mod) => {
      if (min !== null && Number.isFinite(min) && mod.levelRequirement < min) return false;
      if (max !== null && Number.isFinite(max) && mod.levelRequirement > max) return false;
      if (rarity !== "all" && mod.rarity !== Number(rarity)) return false;
      if (slot !== "all" && mod.slot !== slot) return false;
      if (!query) return true;
      const haystack = [
        mod.id,
        mod.name,
        mod.slot,
        RARITY_LABEL[mod.rarity],
        mod.description,
        ...(mod.classRestriction ?? []),
        ...mod.abilities.flatMap((ability) => [ability.id, ability.name, ability.damageType, ability.primaryModSlot, ability.description]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [availableCatalog, maxLevel, minLevel, rarity, search, slot]);

  const visibleMods = filteredMods.slice(0, 120);

  function resetFilters() {
    setSearch("");
    setMinLevel("");
    setMaxLevel("");
    setRarity("all");
    setSlot("all");
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">Add Mods</div>
          <div className="mt-1 text-sm text-white/55">
            Showing {visibleMods.length} of {filteredMods.length} matching available mods
          </div>
        </div>
        <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={resetFilters}>
          Reset Filters
        </button>
      </div>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-panel p-4 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1.3fr),7rem,7rem,10rem,10rem]">
        <label>
          <span className="label mb-1 block">Search</span>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, ID, ability, class" />
        </label>
        <label>
          <span className="label mb-1 block">Min Level</span>
          <input className="input" type="number" min="0" step="1" value={minLevel} onChange={(event) => setMinLevel(event.target.value)} />
        </label>
        <label>
          <span className="label mb-1 block">Max Level</span>
          <input className="input" type="number" min="0" step="1" value={maxLevel} onChange={(event) => setMaxLevel(event.target.value)} />
        </label>
        <label>
          <span className="label mb-1 block">Rarity</span>
          <select className="select w-full" value={rarity} onChange={(event) => setRarity(event.target.value)}>
            <option value="all">All rarities</option>
            {rarityOptions.map((option) => (
              <option key={option} value={option}>
                {RARITY_LABEL[option] ?? `Rarity ${option}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label mb-1 block">Slot</span>
          <select className="select w-full" value={slot} onChange={(event) => setSlot(event.target.value)}>
            <option value="all">All slots</option>
            {slotOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredMods.length > visibleMods.length ? <div className="text-sm text-white/45">Narrow the filters to see the remaining {filteredMods.length - visibleMods.length} mods.</div> : null}

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visibleMods.map((mod) => {
          const id = normalizeClientId(mod.id);
          const weight = weights[id] ?? "50";
          return (
            <ModCatalogAddCard
              key={id}
              mod={mod}
              version={version}
              weight={weight}
              onWeightChange={(value) => setWeights((current) => ({ ...current, [id]: value }))}
              onAdd={() => onAdd(id, Number(weight))}
            />
          );
        })}
      </div>

      {!visibleMods.length ? <div className="rounded-lg border border-white/10 bg-panel p-4 text-sm text-white/55">No available mods match these filters.</div> : null}
    </section>
  );
}

function AbilitiesTable({
  rows,
  version,
}: {
  rows: AbilityTableRow[];
  version?: string;
}) {
  if (!rows.length) {
    return <div className="rounded-lg border border-white/10 bg-panel p-4 text-sm text-white/55">No linked abilities in this mod table.</div>;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-panel">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-lg font-semibold text-white">Abilities In This Table</div>
        <div className="mt-1 text-sm text-white/55">{rows.length} unique abilities from the selected mod entries</div>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[44rem]">
          <thead>
            <tr>
              <th className="px-4 py-3">Ability</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Mods</th>
              <th className="px-4 py-3">Ability Chance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ability = row.ability;
              return (
                <tr key={ability.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3 text-left">
                      <AbilityIconButton ability={ability} version={version} sizeClass="h-10 w-10" />
                      <span className="min-w-0">
                        <span className={`block truncate font-medium ${ability.missing ? "text-amber-100" : "text-white"}`}>{ability.name}</span>
                        <span className="block truncate text-xs text-white/45">{ability.damageType || ability.primaryModSlot || "Ship Ability"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-white/65">{ability.id}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-72 truncate text-white/70">{row.mods.map((mod) => mod.name).join(", ")}</div>
                    <div className="mt-1 text-xs text-white/40">combined weight {formatNumber(row.totalWeight)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{formatPercent(row.probability)}</div>
                    <div className="mt-1 text-xs text-white/40">per mod roll</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryAddControl<TRecord extends { id: string; name: string }>({
  kind,
  catalog,
  existingIds,
  onAdd,
}: {
  kind: LootKind;
  catalog: TRecord[];
  existingIds: Set<string>;
  onAdd: (id: string, weight: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [weight, setWeight] = useState("50");
  const label = kind === "mods" ? "Mod" : "Item";
  const available = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog
      .filter((entry) => !existingIds.has(normalizeClientId(entry.id)))
      .filter((entry) => {
        if (!query) return true;
        return [entry.id, entry.name].join(" ").toLowerCase().includes(query);
      })
      .slice(0, 200);
  }, [catalog, existingIds, search]);

  useEffect(() => {
    if (available.some((entry) => normalizeClientId(entry.id) === selectedId)) return;
    setSelectedId(normalizeClientId(available[0]?.id ?? ""));
  }, [available, selectedId]);

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(11rem,1fr),minmax(14rem,1.4fr),7rem,auto]">
        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()} catalog`} />
        <select className="select w-full" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!available.length}>
          {available.map((entry) => (
            <option key={entry.id} value={normalizeClientId(entry.id)}>
              {entry.name} ({entry.id})
            </option>
          ))}
          {!available.length ? <option value="">No available {label.toLowerCase()}s</option> : null}
        </select>
        <label>
          <span className="label mb-1 block">Drop weight</span>
          <input className="input" type="number" min="1" step="1" value={weight} onChange={(event) => setWeight(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <button
          type="button"
          className="btn whitespace-nowrap disabled:cursor-default disabled:opacity-50"
          disabled={!selectedId || !Number.isFinite(Number(weight)) || Number(weight) <= 0}
          onClick={() => onAdd(selectedId, Number(weight))}
        >
          Add {label}
        </button>
      </div>
    </div>
  );
}

function ModTableView({
  table,
  catalog,
  version,
  onChange,
}: {
  table: LootTableOption<LootTableModRecord>;
  catalog: LootTableModRecord[];
  version?: string;
  onChange: (table: LootTableOption<LootTableModRecord>) => void;
}) {
  const abilityRows = useMemo(() => collectAbilityRows(table), [table]);
  const existingIds = useMemo(() => new Set(table.entries.map((entry) => normalizeClientId(entry.id))), [table.entries]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {table.entries.map((entry, entryIndex) => (
          <ModLootCard
            key={entry.id}
            entry={entry}
            version={version}
            onRemove={() =>
              onChange({
                ...table,
                entries: table.entries.filter((_, currentIndex) => currentIndex !== entryIndex),
              })
            }
            onWeightChange={(weight) =>
              onChange({
                ...table,
                entries: table.entries.map((current, currentIndex) => (currentIndex === entryIndex ? { ...current, weight } : current)),
              })
            }
          />
        ))}
      </div>

      <AbilitiesTable rows={abilityRows} version={version} />

      <ModAddControl
        catalog={catalog}
        existingIds={existingIds}
        version={version}
        onAdd={(id, weight) =>
          onChange({
            ...table,
            entries: [...table.entries, { id, weight, probability: 0, name: null, missing: true, record: null }],
          })
        }
      />
    </div>
  );
}

function ItemTableView({
  table,
  catalog,
  version,
  onChange,
}: {
  table: LootTableOption<LootTableItemRecord>;
  catalog: LootTableItemRecord[];
  version?: string;
  onChange: (table: LootTableOption<LootTableItemRecord>) => void;
}) {
  const existingIds = useMemo(() => new Set(table.entries.map((entry) => normalizeClientId(entry.id))), [table.entries]);
  return (
    <div className="space-y-4">
      <EntryAddControl
        kind="items"
        catalog={catalog}
        existingIds={existingIds}
        onAdd={(id, weight) =>
          onChange({
            ...table,
            entries: [...table.entries, { id, weight, probability: 0, name: null, missing: true, record: null }],
          })
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {table.entries.map((entry, entryIndex) => {
          const item = entry.record;
          if (!item) {
            return (
              <div key={entry.id} className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <div className="font-mono">Missing item {entry.id}</div>
                <div className="mt-2 text-xs">
                  Drop weight {entry.weight} • chance {formatPercent(entry.probability)}
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...table, entries: table.entries.filter((_, currentIndex) => currentIndex !== entryIndex) })}
                  className="mt-3 rounded border border-red-300/25 px-2 py-1 text-xs text-red-100 hover:bg-red-400/10"
                >
                  Remove
                </button>
              </div>
            );
          }

          return (
            <div key={`${entry.id}-${item.id}`} className="rounded-lg border border-white/10 bg-panel p-3">
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-white/10 bg-black/30">
                  <img src={buildIconSrc(item.icon || "icon_lootbox.png", item.id, item.name, version)} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={rarityStyle(item.rarity)}>
                    {item.name}
                  </div>
                  <div className="mt-1 text-xs text-white/55">{item.type || "Unknown type"}</div>
                  <div className="mt-1 font-mono text-xs text-white/40">{item.id}</div>
                </div>
              </div>
              {item.description ? <div className="mt-3 line-clamp-3 text-sm leading-5 text-white/60">{item.description}</div> : null}
              <div className="mt-3 grid grid-cols-[1fr,5.5rem,auto] items-end gap-2 border-t border-white/10 pt-3 text-xs text-white/55">
                <span className="pb-2">Chance {formatPercent(entry.probability)}</span>
                <label>
                  <span className="mb-1 block text-right text-white/45">Drop weight</span>
                  <input
                    className="input h-8 px-2 py-1 text-right text-xs"
                    type="number"
                    min="1"
                    step="1"
                    value={entry.weight}
                    onChange={(event) =>
                      onChange({
                        ...table,
                        entries: table.entries.map((current, currentIndex) => (currentIndex === entryIndex ? { ...current, weight: Number(event.target.value) } : current)),
                      })
                    }
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onChange({ ...table, entries: table.entries.filter((_, currentIndex) => currentIndex !== entryIndex) })}
                  className="rounded border border-red-300/25 px-2 py-1 text-xs text-red-100 hover:bg-red-400/10"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LootTableManagerApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [payload, setPayload] = useState<LootTablePayload | null>(null);
  const [modTables, setModTables] = useState<LootTableOption<LootTableModRecord>[]>([]);
  const [itemTables, setItemTables] = useState<LootTableOption<LootTableItemRecord>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<LootKind>("mods");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [dirty, setDirty] = useState<Record<LootKind, boolean>>({ mods: false, items: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ tone: "neutral", message: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/loot-tables?_v=${sharedDataVersion}`, { cache: "no-store" });
        const nextPayload = (await response.json().catch(() => ({}))) as LootTablePayload;
        if (!response.ok || !nextPayload.ok || !nextPayload.data) {
          throw new Error(nextPayload.error || "Could not load loot tables.");
        }
        if (cancelled) return;
        setPayload(nextPayload);
        setModTables(nextPayload.data.mods);
        setItemTables(nextPayload.data.items);
        setDirty({ mods: false, items: false });
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setPayload(null);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const modCatalog = useMemo(() => payload?.data?.catalogs.mods ?? [], [payload]);
  const itemCatalog = useMemo(() => payload?.data?.catalogs.items ?? [], [payload]);
  const modCatalogById = useMemo(() => new Map(modCatalog.map((entry) => [normalizeClientId(entry.id), entry])), [modCatalog]);
  const itemCatalogById = useMemo(() => new Map(itemCatalog.map((entry) => [normalizeClientId(entry.id), entry])), [itemCatalog]);
  const selectedTables = kind === "mods" ? modTables : itemTables;
  const selectedTableIndex = useMemo(() => {
    const exactIndex = selectedTables.findIndex((table) => table.id === selectedId);
    return exactIndex >= 0 ? exactIndex : selectedTables.length ? 0 : -1;
  }, [selectedId, selectedTables]);
  const selectedTable = selectedTableIndex >= 0 ? selectedTables[selectedTableIndex] : null;
  const validationErrors = useMemo(() => {
    if (kind === "mods") return validateDraftTables("mods", modTables, modCatalogById);
    return validateDraftTables("items", itemTables, itemCatalogById);
  }, [itemCatalogById, itemTables, kind, modCatalogById, modTables]);

  useEffect(() => {
    if (!selectedTables.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedTables.some((table) => table.id === selectedId)) {
      setSelectedId(selectedTables[0].id);
    }
  }, [selectedId, selectedTables]);

  function markDirty(nextKind = kind) {
    setDirty((current) => ({ ...current, [nextKind]: true }));
    setSaveStatus({ tone: "neutral", message: "" });
  }

  function updateSelectedTable(nextTable: LootTableOption<LootTableModRecord> | LootTableOption<LootTableItemRecord>) {
    if (selectedTableIndex < 0) return;
    if (kind === "mods") {
      const rebuilt = rebuildTable(nextTable as LootTableOption<LootTableModRecord>, modCatalogById);
      setModTables((current) => current.map((table, index) => (index === selectedTableIndex ? rebuilt : table)));
      setSelectedId(rebuilt.id);
      markDirty("mods");
      return;
    }

    const rebuilt = rebuildTable(nextTable as LootTableOption<LootTableItemRecord>, itemCatalogById);
    setItemTables((current) => current.map((table, index) => (index === selectedTableIndex ? rebuilt : table)));
    setSelectedId(rebuilt.id);
    markDirty("items");
  }

  function createTable() {
    const nextId = makeUniqueTableId(tableIdBase(kind), selectedTables);
    if (kind === "mods") {
      const nextTable = rebuildTable<LootTableModRecord>({ id: nextId, rolls: 1, entryCount: 0, totalWeight: 0, entries: [] }, modCatalogById);
      setModTables((current) => [...current, nextTable]);
      setSelectedId(nextId);
      markDirty("mods");
      return;
    }

    const nextTable = rebuildTable<LootTableItemRecord>({ id: nextId, rolls: 1, entryCount: 0, totalWeight: 0, entries: [] }, itemCatalogById);
    setItemTables((current) => [...current, nextTable]);
    setSelectedId(nextId);
    markDirty("items");
  }

  function duplicateSelectedTable() {
    if (!selectedTable) return;
    const nextId = makeUniqueTableId(`${selectedTable.id}_copy`, selectedTables);
    const baseTable = {
      ...selectedTable,
      id: nextId,
      entries: selectedTable.entries.map((entry) => ({
        ...entry,
        id: normalizeClientId(entry.id),
        weight: Number(entry.weight),
      })),
    };

    if (kind === "mods") {
      const nextTable = rebuildTable(baseTable as LootTableOption<LootTableModRecord>, modCatalogById);
      setModTables((current) => [...current, nextTable]);
      setSelectedId(nextId);
      markDirty("mods");
      return;
    }

    const nextTable = rebuildTable(baseTable as LootTableOption<LootTableItemRecord>, itemCatalogById);
    setItemTables((current) => [...current, nextTable]);
    setSelectedId(nextId);
    markDirty("items");
  }

  function deleteSelectedTable() {
    if (!selectedTable) return;
    if (!window.confirm(`Delete loot table "${selectedTable.id}" from the ${kind === "mods" ? "mod" : "item"} loot table workspace?`)) return;
    const nextSelection = selectedTables[selectedTableIndex + 1]?.id ?? selectedTables[selectedTableIndex - 1]?.id ?? null;
    if (kind === "mods") {
      setModTables((current) => current.filter((_, index) => index !== selectedTableIndex));
      setSelectedId(nextSelection);
      markDirty("mods");
      return;
    }
    setItemTables((current) => current.filter((_, index) => index !== selectedTableIndex));
    setSelectedId(nextSelection);
    markDirty("items");
  }

  async function saveCurrentKind() {
    const errors = validationErrors;
    if (errors.length) {
      setSaveStatus({ tone: "error", message: errors.slice(0, 4).join(" ") });
      return;
    }

    try {
      setSaveStatus({ tone: "neutral", message: "Saving..." });
      const response = await fetch("/api/loot-tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          tables: kind === "mods" ? exportTables(modTables) : exportTables(itemTables),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Could not save loot tables.");
      }

      setDirty((current) => ({ ...current, [kind]: false }));
      setSaveStatus({ tone: "success", message: `Saved ${result.savedCount ?? selectedTables.length} ${kind === "mods" ? "mod" : "item"} loot tables.` });
    } catch (saveError) {
      setSaveStatus({ tone: "error", message: saveError instanceof Error ? saveError.message : String(saveError) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Loot Tables</h1>
          <div className="text-sm text-white/55">{payload?.sourceLabel ?? "Local game source"}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {(["mods", "items"] as LootKind[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setKind(option);
                  setTableSearch("");
                  setSaveStatus({ tone: "neutral", message: "" });
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition ${
                  kind === option ? "bg-cyan-300 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {option}
                {dirty[option] ? " *" : ""}
              </button>
            ))}
          </div>
          <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10" onClick={createTable} disabled={loading || Boolean(error)}>
            New Table
          </button>
          <button type="button" className="rounded border border-white/10 px-3 py-2 text-sm text-white/75 hover:bg-white/10 disabled:opacity-50" onClick={duplicateSelectedTable} disabled={!selectedTable}>
            Duplicate
          </button>
          <button type="button" className="rounded border border-red-300/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10 disabled:opacity-50" onClick={deleteSelectedTable} disabled={!selectedTable}>
            Delete
          </button>
          <button
            type="button"
            className="btn disabled:cursor-default disabled:opacity-50"
            onClick={saveCurrentKind}
            disabled={!dirty[kind] || validationErrors.length > 0 || loading || Boolean(error)}
          >
            Save {kind === "mods" ? "Mod" : "Item"} Tables
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-lg border border-white/10 bg-panel p-4 text-sm text-white/60">Loading loot tables...</div> : null}
      {error ? <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}
      {saveStatus.message ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            saveStatus.tone === "error"
              ? "border-red-400/30 bg-red-400/10 text-red-100"
              : saveStatus.tone === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-white/10 bg-panel text-white/65"
          }`}
        >
          {saveStatus.message}
        </div>
      ) : null}
      {validationErrors.length ? (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          {validationErrors.slice(0, 5).join(" ")}
        </div>
      ) : null}

      {!loading && !error && payload?.data ? (
        <>
          <SummaryStrip kind={kind} tables={selectedTables} selectedTable={selectedTable} />

          <div className="grid gap-4 xl:grid-cols-[20rem,minmax(0,1fr)]">
            <TablePicker
              kind={kind}
              tables={selectedTables}
              selectedId={selectedTable?.id ?? null}
              search={tableSearch}
              onSearch={setTableSearch}
              onSelect={setSelectedId}
            />

            <main className="min-w-0 space-y-4">
              {selectedTable ? (
                <>
                  <div className="rounded-lg border border-white/10 bg-panel px-4 py-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr),7rem,minmax(15rem,auto)]">
                      <label>
                        <span className="label">Table ID</span>
                        <input className="input mt-1 font-mono" value={selectedTable.id} onChange={(event) => updateSelectedTable({ ...selectedTable, id: event.target.value } as typeof selectedTable)} />
                      </label>
                      <label>
                        <span className="label">Rolls</span>
                        <input
                          className="input mt-1"
                          type="number"
                          min="1"
                          step="1"
                          value={selectedTable.rolls}
                          onChange={(event) => updateSelectedTable({ ...selectedTable, rolls: Number(event.target.value) } as typeof selectedTable)}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </label>
                      <div className="self-end pb-2 text-sm text-white/55">
                        {selectedTable.entryCount} entries • total weight {formatNumber(selectedTable.totalWeight)}
                      </div>
                    </div>
                  </div>

                  {kind === "mods" ? (
                    <ModTableView
                      table={selectedTable as LootTableOption<LootTableModRecord>}
                      catalog={modCatalog}
                      version={sharedDataVersion}
                      onChange={(table) => updateSelectedTable(table)}
                    />
                  ) : (
                    <ItemTableView
                      table={selectedTable as LootTableOption<LootTableItemRecord>}
                      catalog={itemCatalog}
                      version={sharedDataVersion}
                      onChange={(table) => updateSelectedTable(table)}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-white/10 bg-panel p-4 text-sm text-white/55">No {kind} loot tables found.</div>
              )}
            </main>
          </div>
        </>
      ) : null}
    </div>
  );
}
