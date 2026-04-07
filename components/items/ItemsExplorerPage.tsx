"use client";

import { useEffect, useState } from "react";
import { RARITY_COLOR } from "@lib/constants";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type Item = { id: string; name: string; levelRequirement: number; rarity: number; icon?: string; type?: string };

const DEFAULT_ITEM_ICON = "icon_lootbox.png";

function rarityStyle(rarity: number) {
  return { color: RARITY_COLOR[rarity] || "#C0C0C0" };
}

export default function ItemsExplorerPage() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [rows, setRows] = useState<Item[]>([]);
  const [rarities, setRarities] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [rsel, setRsel] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (min) params.set("level_min", min);
      if (max) params.set("level_max", max);
      for (const rarity of rsel) params.append("rarity", rarity);
      const response = await fetch(`/api/items?${params.toString()}`);
      const payload = await response.json().catch(() => ({ data: [], rarities: [] }));
      setRows(Array.isArray(payload.data) ? payload.data : []);
      setRarities(Array.isArray(payload.rarities) ? payload.rarities : []);
    }

    void load();
  }, [max, min, q, rsel, sharedDataVersion]);

  const [sortKey, setSortKey] = useState<string>("name");
  const [asc, setAsc] = useState<boolean>(true);
  const sorted = [...rows].sort((left: any, right: any) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const direction = asc ? 1 : -1;
    if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });

  return (
    <div className="space-y-4">
      <h1 className="page-title">Items Explorer</h1>
      <div className="card grid gap-3 md:grid-cols-4">
        <div>
          <div className="label">Search</div>
          <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name / ID" />
        </div>
        <div>
          <div className="label">Level Min</div>
          <input className="input" value={min} onChange={(event) => setMin(event.target.value)} />
        </div>
        <div>
          <div className="label">Level Max</div>
          <input className="input" value={max} onChange={(event) => setMax(event.target.value)} />
        </div>
        <div>
          <div className="label">Rarity</div>
          <select
            className="select w-full"
            multiple
            value={rsel}
            onChange={(event) => setRsel(Array.from(event.target.selectedOptions).map((option) => option.value))}
          >
            {rarities.map((rarity: number) => (
              <option key={rarity} value={String(rarity)}>
                {rarity}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {["id", "name", "levelRequirement", "rarity", "type"].map((key) => (
                <th
                  key={key}
                  onClick={() => {
                    setAsc(key === sortKey ? !asc : true);
                    setSortKey(key);
                  }}
                  className="cursor-pointer"
                >
                  {key === "levelRequirement" ? "Level" : key === "id" ? "ID" : key[0].toUpperCase() + key.slice(1)}{" "}
                  {sortKey === key ? (asc ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id}>
                <td className="font-mono text-xs text-white/70">{item.id}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <img src={buildIconSrc(item.icon || DEFAULT_ITEM_ICON, item.id, item.name, sharedDataVersion)} alt="" width={28} height={28} style={{ borderRadius: 4 }} />
                    <span style={rarityStyle(item.rarity)} className="font-medium">
                      {item.name}
                    </span>
                  </div>
                </td>
                <td>{item.levelRequirement}</td>
                <td style={rarityStyle(item.rarity)}>{item.rarity}</td>
                <td>{item.type || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
