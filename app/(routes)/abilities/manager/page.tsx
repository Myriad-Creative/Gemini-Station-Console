import { Suspense } from "react";
import AbilityManagerApp from "@components/ability-manager/AbilityManagerApp";

export default function AbilityManagerPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <AbilityManagerApp />
    </Suspense>
  );
}
