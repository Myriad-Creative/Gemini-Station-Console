import { NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (localGameSource.active && localGameSource.gameRootPath && localGameSource.available.data) {
    const database = loadAbilityManagerDatabase(localGameSource.gameRootPath);
    const data = database.abilities
      .map((ability) => ({
        id: ability.id,
        name: ability.name || String(ability.id),
        description: ability.description,
        icon: ability.icon,
        deliveryType: ability.deliveryType,
        linkedEffectCount: ability.linkedEffects.length,
        minimumModLevel: ability.minimumModLevel.trim() ? Number(ability.minimumModLevel) : null,
      }))
      .sort((left, right) => {
        const leftLabel = (left.name || String(left.id)).toLowerCase();
        const rightLabel = (right.name || String(right.id)).toLowerCase();
        return leftLabel.localeCompare(rightLabel);
      });

    return NextResponse.json({ data });
  }

  await warmupLoadIfNeeded();
  const store = getStore();
  const data = store.abilities
    .slice()
    .map((ability) => ({
      id: ability.id,
      name: ability.name,
      description: ability.description,
      icon: undefined,
      deliveryType: undefined,
      linkedEffectCount: 0,
      minimumModLevel: null,
    }))
    .sort((left, right) => {
      const leftLabel = (left.name || String(left.id)).toLowerCase();
      const rightLabel = (right.name || String(right.id)).toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

  return NextResponse.json({ data });
}
