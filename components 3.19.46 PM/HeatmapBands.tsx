"use client";
export default function HeatmapBands({ data, bands }: { data: { slot: string; band: string; count: number }[]; bands: string[] }) {
  if (!data.length) return <div className="text-white/70">No coverage data.</div>;
  const slots = Array.from(new Set(data.map(d => d.slot))).sort();
  const map = new Map<string, number>();
  let max = 0;
  for (const d of data) {
    const k = `${d.slot}::${d.band}`;
    map.set(k, d.count);
    max = Math.max(max, d.count);
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Slot \\ Band</th>
            {bands.map(b => <th key={b}>{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {slots.map(slot => (
            <tr key={slot}>
              <td className="font-medium">{slot}</td>
              {bands.map(b => {
                const c = map.get(`${slot}::${b}`) ?? 0;
                const intensity = max ? Math.round((c / max) * 100) : 0;
                return (
                  <td key={b}>
                    <div className="rounded text-center" style={{ background: `linear-gradient(90deg, rgba(73,168,255,0.2) ${intensity}%, transparent ${intensity}%)` }}>
                      {c}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
