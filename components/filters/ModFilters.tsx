"use client";
export default function ModFilters({
  meta,
  query,
  setQuery
}: {
  meta: { slots: string[]; rarities: number[]; classes: string[]; stats: string[] };
  query: any;
  setQuery: (q: any) => void;
}) {
  return (
    <div className="card grid gap-3 md:grid-cols-4">
      <div>
        <div className="label">Slot</div>
        <select className="select w-full" value={query.slot} onChange={e => setQuery({ ...query, slot: e.target.value })}>
          <option value="">Any</option>
          {meta.slots.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <div className="label">Level Range</div>
        <div className="flex gap-2">
          <input className="input" placeholder="Min" value={query.min} onChange={e => setQuery({ ...query, min: e.target.value })} />
          <input className="input" placeholder="Max" value={query.max} onChange={e => setQuery({ ...query, max: e.target.value })} />
        </div>
      </div>
      <div>
        <div className="label">Rarity</div>
        <select className="select w-full" multiple value={query.rarity} onChange={e => {
          const opts = Array.from(e.target.selectedOptions).map(o => o.value);
          setQuery({ ...query, rarity: opts });
        }}>
          {meta.rarities.map(r => <option key={r} value={String(r)}>{r}</option>)}
        </select>
      </div>
      <div>
        <div className="label">Class Restriction</div>
        <select className="select w-full" value={query.cls} onChange={e => setQuery({ ...query, cls: e.target.value })}>
          <option value="">Any</option>
          {meta.classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <div className="label">Search</div>
        <input className="input" placeholder="Name / ID" value={query.q} onChange={e => setQuery({ ...query, q: e.target.value })} />
      </div>
    </div>
  );
}
