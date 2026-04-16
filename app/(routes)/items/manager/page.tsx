import { Suspense } from "react";
import ItemManagerApp from "@components/item-manager/ItemManagerApp";

export default function ItemManagerPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <ItemManagerApp />
    </Suspense>
  );
}
