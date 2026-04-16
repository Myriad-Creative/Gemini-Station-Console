import { Suspense } from "react";
import ModBuilderPage from "@components/authoring/ModBuilderPage";

export default function ModsManagerRoute() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <ModBuilderPage />
    </Suspense>
  );
}
