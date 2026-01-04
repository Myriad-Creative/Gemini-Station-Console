"use client";
import { useMemo, useState } from "react";
import { RARITY_COLOR } from "@lib/constants";

type Row = {
  id: string; name: string; slot: string; levelRequirement: number; rarity: number;
  classRestriction?: string[]; stats: Record<string, number>; abilities: (number|string)[]; composite: number; icon?: string; description?: string;
};

function rarityStyle(r:number){ return { color: RARITY_COLOR[r] || "#C0C0C0" }; }

function HoverCard({ row }: { row: Row }) {
  const statEntries = Object.entries(row.stats || {}).filter(([_,v]) => (v as any) !== 0);
  return (
    <div className="tooltip-card">
      <div className="font-semibold" style={rarityStyle(row.rarity)}>{row.name}</div>
      <div className="text-xs text-white/70 mb-2">{row.slot} • Level {row.levelRequirement} • Rarity {row.rarity}</div>
      {row.description ? <div className="mb-2 text-sm text-white/80">{row.description}</div> : null}
      {statEntries.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {statEntries.map(([k,v]) => (
            <div key={k} className="flex justify-between gap-6"><span className="text-white/70">{k.replace(/_/g," ")}</span><span>{String(v)}</span></div>
          ))}
        </div>
      ) : <div className="text-white/60 text-sm">No stats</div>}
      {(row.abilities || []).length ? <div className="mt-2 text-xs">Abilities: {(row.abilities || []).map(a => <span key={String(a)} className="badge mr-1">{String(a)}</span>)}</div> : null}
      {row.classRestriction?.length ? <div className="mt-2 text-xs">Classes: {row.classRestriction.join(", ")}</div> : null}
    </div>
  );
}

export default function ModsTable({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<string>("name");
  const [asc, setAsc] = useState<boolean>(true);
  const sorted = useMemo(()=>{
    const arr = [...rows];
    const dir = asc?1:-1;
    return arr.sort((a:any,b:any)=>{
      const ka = (a as any)[sortKey]; const kb = (b as any)[sortKey];
      if (typeof ka === "number" && typeof kb === "number") return (ka - kb)*dir;
      return String(ka).localeCompare(String(kb))*dir;
    });
  }, [rows, sortKey, asc]);

  const columns = useMemo(() => [
    { key: "name", header: "Name", render: (r: Row) => (
      <div className="relative group flex items-center gap-2">
        {r.icon ? <img src={`/api/icon?res=${encodeURIComponent(r.icon)}&id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`} width={28} height={28} style={{borderRadius:4}} alt="" /> : <div style={{width:28,height:28,background:"#222",borderRadius:4}}/>}
        <span className="font-medium" style={rarityStyle(r.rarity)}>{r.name}</span>
        <div className="tooltip group-hover:block hidden"><HoverCard row={r} /></div>
      </div>
    ) },
    { key: "slot", header: "Slot", render: (r: Row) => r.slot },
    { key: "levelRequirement", header: "Level", render: (r: Row) => r.levelRequirement },
    { key: "abilities", header: "Abilities", render: (r: Row) => {
      const count = (r.abilities || []).length;
      return count ? <span className="badge mr-1">{count}</span> : <span className="text-white/50">—</span>;
    } },
    { key: "composite", header: "Score", render: (r: Row) => r.composite.toFixed(2) },
  ], []);

  const headerCell = (c:any) => (
    <th key={c.key} onClick={()=>{ setAsc(c.key===sortKey? !asc : true); setSortKey(c.key);}}
        className="cursor-pointer">{c.header} {sortKey===c.key ? (asc?"▲":"▼") : ""}</th>
  );

  return (
    <div className="overflow-x-auto overflow-y-visible pb-28">
      <table className="table">
        <thead>
          <tr>{columns.map(headerCell)}</tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {columns.map(c => <td key={c.key}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
