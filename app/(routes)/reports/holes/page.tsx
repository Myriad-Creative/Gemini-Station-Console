"use client";
import { Fragment, useEffect, useState } from "react";
import { RARITY_COLOR } from "@lib/constants";

export default function HolesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [rarities, setRarities] = useState<number[]>([0,1,2,3,4]);
  const [bands, setBands] = useState<[number,number][]>([]);

  useEffect(()=>{ fetch("/api/reports/holes").then(r=>r.json()).then(j=>{ setRows(j.rows); setRarities(j.rarities); setBands(j.bands); }); }, []);

  const grouped = rows.reduce((acc:any, r:any)=>{
    acc[r.band] ||= []; acc[r.band].push(r); return acc;
  }, {} as Record<string, any[]>);

  const header = (
    <tr>
      <th>Level Band</th>
      <th>Slot</th>
      {rarities.map(r => <th key={r} style={{color: RARITY_COLOR[r] || "#C0C0C0"}}>
        {r===0?"White":r===1?"Green":r===2?"Blue":r===3?"Purple":r===4?"Gold":"R"+r}</th>)}
      <th>Total</th>
      <th>Required</th>
    </tr>
  );

  return (
    <div className="space-y-4">
      <h1 className="page-title">Holes Report</h1>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>{header}</thead>
          <tbody>
            {Object.keys(grouped).map(band => (
              <Fragment key={band}>
                {grouped[band].map((r:any, idx:number) => (
                  <tr key={band + r.slot}>
                    <td className={idx===0 ? "font-medium" : ""}>{idx===0 ? band : ""}</td>
                    <td className="font-medium">{r.slot}</td>
                    {rarities.map(rr => <td key={rr} style={{color: RARITY_COLOR[rr] || "#C0C0C0"}}>{r[`r${rr}`] ?? 0}</td>)}
                    <td className={r.total >= r.required ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>{r.total}</td>
                    <td>{r.required}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-white/70">
        Target per slot × level band: <b>Required</b> equals the value in <code>config.json</code> (default 10).
      </div>
    </div>
  );
}
