import { Suspense } from "react";
import AbilityBulkEditorApp from "@components/ability-manager/AbilityBulkEditorApp";

export default function AbilityBulkEditPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <AbilityBulkEditorApp />
    </Suspense>
  );
}
