"use client";

import { useEffect, useMemo, useState } from "react";
import { RARITY_COLOR, RARITY_LABEL } from "@lib/constants";
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
  };
};

type LootKind = "mods" | "items";

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

function AbilityTooltip({ ability }: { ability: LootTableAbility }) {
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
      className="pointer-events-none rounded-lg border px-3.5 py-3 text-left shadow-2xl"
      style={{
        width: "min(520px, calc(100vw - 2rem))",
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

function AbilityChip({ ability, version }: { ability: LootTableAbility; version?: string }) {
  const iconSrc = buildIconSrc(ability.icon || "icon_lootbox.png", ability.id, ability.name, version);

  return (
    <span className="group relative inline-flex">
      <span
        className={`inline-flex max-w-full items-center gap-2 rounded border px-2 py-1 text-xs ${
          ability.missing
            ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
            : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
        }`}
      >
        <span className="h-7 w-7 shrink-0 overflow-hidden rounded border border-white/10 bg-black/30">
          <img src={iconSrc} alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0 truncate">{ability.name}</span>
      </span>
      <span className="absolute left-0 top-[calc(100%+8px)] z-50 hidden group-hover:block group-focus-within:block">
        <AbilityTooltip ability={ability} />
      </span>
    </span>
  );
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

function ModHoverCard({ mod, version }: { mod: LootTableModRecord; version?: string }) {
  const stats = Object.entries(mod.stats || {}).filter(([, value]) => value !== 0);
  return (
    <div className="tooltip-card w-96">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-white/10 bg-black/30">
          <img src={buildIconSrc(mod.icon || "icon_lootbox.png", mod.id, mod.name, version)} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold" style={rarityStyle(mod.rarity)}>
            {mod.name}
          </div>
          <div className="mt-1 text-xs text-white/60">
            {mod.slot} • Level {mod.levelRequirement} • {RARITY_LABEL[mod.rarity] ?? `Rarity ${mod.rarity}`}
          </div>
        </div>
      </div>
      {mod.description ? <div className="mt-3 text-sm leading-5 text-white/70">{mod.description}</div> : null}
      {stats.length ? (
        <div className="mt-3 grid gap-1 text-sm">
          {stats.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <span className="text-white/55">{statLabel(key)}</span>
              <span className="text-white">{statValue(value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModTableView({ table, version }: { table: LootTableOption<LootTableModRecord>; version?: string }) {
  return (
    <div className="overflow-visible rounded-lg border border-white/10 bg-panel">
      <div className="grid grid-cols-[minmax(18rem,1.4fr),8rem,7rem,9rem,minmax(15rem,1fr),minmax(16rem,1.2fr)] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/45">
        <div>Mod</div>
        <div>Slot</div>
        <div>Level</div>
        <div>Weight</div>
        <div>Stats</div>
        <div>Abilities</div>
      </div>
      <div className="divide-y divide-white/5">
        {table.entries.map((entry) => {
          const mod = entry.record;
          if (!mod) {
            return (
              <div key={entry.id} className="grid grid-cols-[minmax(18rem,1.4fr),8rem,7rem,9rem,minmax(15rem,1fr),minmax(16rem,1.2fr)] gap-3 px-4 py-3 text-sm text-amber-100">
                <div className="font-mono">Missing mod {entry.id}</div>
                <div>—</div>
                <div>—</div>
                <div>{entry.weight} / {formatPercent(entry.probability)}</div>
                <div>—</div>
                <div>—</div>
              </div>
            );
          }

          const stats = Object.entries(mod.stats || {}).filter(([, value]) => value !== 0);
          return (
            <div
              key={`${entry.id}-${mod.id}`}
              className="grid grid-cols-[minmax(18rem,1.4fr),8rem,7rem,9rem,minmax(15rem,1fr),minmax(16rem,1.2fr)] gap-3 px-4 py-3 text-sm text-white/80"
            >
              <div className="group relative flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-white/10 bg-black/30">
                  <img src={buildIconSrc(mod.icon || "icon_lootbox.png", mod.id, mod.name, version)} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={rarityStyle(mod.rarity)}>
                    {mod.name}
                  </div>
                  <div className="truncate font-mono text-xs text-white/45">{mod.id}</div>
                </div>
                <div className="tooltip hidden group-hover:block">
                  <ModHoverCard mod={mod} version={version} />
                </div>
              </div>
              <div>{mod.slot}</div>
              <div>{mod.levelRequirement}</div>
              <div>
                <div>{entry.weight}</div>
                <div className="text-xs text-white/45">{formatPercent(entry.probability)}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {stats.length ? (
                  stats.map(([key, value]) => (
                    <span key={key} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs">
                      {statLabel(key)} {statValue(value)}
                    </span>
                  ))
                ) : (
                  <span className="text-white/45">None</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 overflow-visible">
                {mod.abilities.length ? (
                  mod.abilities.map((ability) => <AbilityChip key={`${mod.id}-${ability.id}`} ability={ability} version={version} />)
                ) : (
                  <span className="text-white/45">None</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemTableView({ table, version }: { table: LootTableOption<LootTableItemRecord>; version?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {table.entries.map((entry) => {
        const item = entry.record;
        if (!item) {
          return (
            <div key={entry.id} className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              <div className="font-mono">Missing item {entry.id}</div>
              <div className="mt-2 text-xs">Weight {entry.weight} • {formatPercent(entry.probability)}</div>
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
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/55">
              <span>Weight {entry.weight}</span>
              <span>{formatPercent(entry.probability)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LootTableManagerApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [payload, setPayload] = useState<LootTablePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<LootKind>("mods");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");

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

  const modTables = useMemo(() => payload?.data?.mods ?? [], [payload]);
  const itemTables = useMemo(() => payload?.data?.items ?? [], [payload]);
  const selectedTables = kind === "mods" ? modTables : itemTables;
  const selectedTable = useMemo(() => selectedTables.find((table) => table.id === selectedId) ?? selectedTables[0] ?? null, [selectedId, selectedTables]);

  useEffect(() => {
    if (!selectedTables.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedTables.some((table) => table.id === selectedId)) {
      setSelectedId(selectedTables[0].id);
    }
  }, [selectedId, selectedTables]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Loot Tables</h1>
          <div className="text-sm text-white/55">{payload?.sourceLabel ?? "Local game source"}</div>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {(["mods", "items"] as LootKind[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setKind(option);
                setTableSearch("");
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition ${
                kind === option ? "bg-cyan-300 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="rounded-lg border border-white/10 bg-panel p-4 text-sm text-white/60">Loading loot tables...</div> : null}
      {error ? <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{error}</div> : null}

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
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-lg font-semibold text-white">{selectedTable.id}</div>
                        <div className="mt-1 text-sm text-white/55">
                          {selectedTable.entryCount} entries • {formatNumber(selectedTable.rolls)} rolls • total weight {formatNumber(selectedTable.totalWeight)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {kind === "mods" ? (
                    <ModTableView table={selectedTable as LootTableOption<LootTableModRecord>} version={sharedDataVersion} />
                  ) : (
                    <ItemTableView table={selectedTable as LootTableOption<LootTableItemRecord>} version={sharedDataVersion} />
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
