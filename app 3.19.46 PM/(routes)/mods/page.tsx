"use client";
import { useEffect, useState } from "react";
import ModsTable from "@components/ModsTable";
import ModFilters from "@components/filters/ModFilters";

type ModRow = {
  id: string; name: string; slot: string; levelRequirement: number; rarity: number;
  classRestriction?: string[]; stats: Record<string, number>; abilities: (number|string)[]; composite: number; icon?: string; description?: string;
};

export default function ModsPage() {
  const [rows, setRows] = useState<ModRow[]>([]);
  const [meta, setMeta] = useState<{ slots: string[]; rarities: number[]; classes: string[]; stats: string[] } | null>(null);
  const [query, setQuery] = useState({ slot: "", min: "", max: "", rarity: [] as string[], cls: "", stat: "", ability: "", q: "" });

  const load = async () => {
    const params = new URLSearchParams();
    if (query.slot) params.set("slot", query.slot);
    if (query.min) params.set("level_min", query.min);
    if (query.max) params.set("level_max", query.max);
    for (const r of query.rarity) params.append("rarity", r);
    if (query.cls) params.set("class", query.cls);
    if (query.stat) params.set("stat", query.stat);
    if (query.ability) params.set("ability", query.ability);
    if (query.q) params.set("q", query.q);
    const r = await fetch(`/api/mods?${params.toString()}`);
    const j = await r.json();
    setRows(j.data);
    setMeta({ slots: j.slots, rarities: j.rarities, classes: j.classes, stats: j.stats });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [JSON.stringify(query)]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Mods Explorer</h1>
      {meta && (
        <ModFilters meta={meta} query={query} setQuery={setQuery} />
      )}
      <ModsTable rows={rows} />
    </div>
  );
}
