"use client";

import { useEffect, useState } from "react";
import ModsTable from "@components/ModsTable";
import ModFilters from "@components/filters/ModFilters";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type ModRow = {
  id: string;
  name: string;
  slot: string;
  levelRequirement: number;
  rarity: number;
  classRestriction?: string[];
  stats: Record<string, number>;
  abilities: Array<number | string>;
  composite: number;
  icon?: string;
  description?: string;
};

export default function ModsExplorerPage() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [rows, setRows] = useState<ModRow[]>([]);
  const [meta, setMeta] = useState<{ slots: string[]; rarities: number[]; classes: string[]; stats: string[] } | null>(null);
  const [query, setQuery] = useState({ slot: "", min: "", max: "", rarity: [] as string[], cls: "", stat: "", ability: "", q: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const params = new URLSearchParams();
      if (query.slot) params.set("slot", query.slot);
      if (query.min) params.set("level_min", query.min);
      if (query.max) params.set("level_max", query.max);
      for (const rarity of query.rarity) params.append("rarity", rarity);
      if (query.cls) params.set("class", query.cls);
      if (query.stat) params.set("stat", query.stat);
      if (query.ability) params.set("ability", query.ability);
      if (query.q) params.set("q", query.q);
      params.set("_v", sharedDataVersion);
      const response = await fetch(`/api/mods?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (cancelled) return;
      setRows(json.data);
      setMeta({ slots: json.slots, rarities: json.rarities, classes: json.classes, stats: json.stats });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [query, sharedDataVersion]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Mods Explorer</h1>
      {meta ? <ModFilters meta={meta} query={query} setQuery={setQuery} /> : null}
      <ModsTable rows={rows} />
    </div>
  );
}
