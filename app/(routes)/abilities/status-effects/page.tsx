import { Suspense } from "react";
import StatusEffectManagerApp from "@components/ability-manager/StatusEffectManagerApp";

export default function StatusEffectManagerPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <StatusEffectManagerApp />
    </Suspense>
  );
}
