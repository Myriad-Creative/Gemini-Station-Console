"use client";
import { useEffect, useState } from "react";
import { RARITY_COLOR } from "@lib/constants";

type Item = { id:string; name:string; levelRequirement:number; rarity:number; icon?:string; type?:string; };

function rarityStyle(r:number) { return { color: RARITY_COLOR[r] || "#C0C0C0" }; }

export default function ItemsPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [rarities, setRarities] = useState<number[]>([]);
  const [q, setQ] = useState(""); const [min,setMin]=useState(""); const [max,setMax]=useState(""); const [rsel,setRsel]=useState<string[]>([]);
  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (min) params.set("level_min", min);
    if (max) params.set("level_max", max);
    for (const r of rsel) params.append("rarity", r);
    const r = await fetch(`/api/items?${params.toString()}`);
    const j = await r.json();
    setRows(j.data); setRarities(j.rarities);
  };
  useEffect(()=>{ load(); }, [q,min,max,JSON.stringify(rsel)]);

  const [sortKey, setSortKey] = useState<string>("name");
  const [asc, setAsc] = useState<boolean>(true);
  const sorted = [...rows].sort((a:any,b:any)=>{
    const ka = (a as any)[sortKey]; const kb=(b as any)[sortKey];
    const dir = asc?1:-1;
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb)*dir;
    return String(ka).localeCompare(String(kb))*dir;
  });

  return (
    <div className="space-y-4">
      <h1 className="page-title">Items Explorer</h1>
      <div className="card grid gap-3 md:grid-cols-4">
        <div><div className="label">Search</div><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Name / ID" /></div>
        <div><div className="label">Level Min</div><input className="input" value={min} onChange={e=>setMin(e.target.value)} /></div>
        <div><div className="label">Level Max</div><input className="input" value={max} onChange={e=>setMax(e.target.value)} /></div>
        <div>
          <div className="label">Rarity</div>
          <select className="select w-full" multiple value={rsel} onChange={e=>setRsel(Array.from(e.target.selectedOptions).map(o=>o.value))}>
            {rarities.map((r:number)=> <option key={r} value={String(r)}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {["name","levelRequirement","rarity","type"].map(k=> (
                <th key={k} onClick={()=>{ setAsc(k===sortKey ? !asc : true); setSortKey(k); }} className="cursor-pointer">
                  {k === "levelRequirement" ? "Level" : k[0].toUpperCase()+k.slice(1)} {sortKey===k ? (asc?"▲":"▼"):""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(it => (
              <tr key={it.id}>
                <td>
                  <div className="flex items-center gap-2">
                    {it.icon ? <img src={`/api/icon?res=${encodeURIComponent(it.icon)}&id=${encodeURIComponent(it.id)}&name=${encodeURIComponent(it.name)}`} alt="" width={28} height={28} style={{borderRadius:4}} /> : <div style={{width:28,height:28,background:"#222",borderRadius:4}}/>}
                    <span style={rarityStyle(it.rarity)} className="font-medium">{it.name}</span>
                  </div>
                </td>
                <td>{it.levelRequirement}</td>
                <td style={rarityStyle(it.rarity)}>{it.rarity}</td>
                <td>{it.type || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
