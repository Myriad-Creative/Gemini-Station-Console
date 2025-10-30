export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}
export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-semibold mb-2">{children}</div>;
}
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
