import { NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { normalizeAbilityReference } from "@lib/ability-manager/utils";
import { getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { getLocalGameSourceState } from "@lib/local-game-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const localGameSource = getLocalGameSourceState();
  if (localGameSource.active && localGameSource.gameRootPath && localGameSource.available.data) {
    const database = loadAbilityManagerDatabase(localGameSource.gameRootPath);
    const linkedModCountByAbilityId = new Map<string, number>();
    for (const mod of database.mods) {
      for (const abilityId of mod.abilityIds) {
        linkedModCountByAbilityId.set(abilityId, (linkedModCountByAbilityId.get(abilityId) ?? 0) + 1);
      }
    }
    const data = database.abilities
      .map((ability) => ({
        id: ability.id,
        name: ability.name || String(ability.id),
        description: ability.description,
        icon: ability.icon,
        deliveryType: ability.deliveryType,
        linkedEffectCount: ability.linkedEffects.length,
        linkedModCount: linkedModCountByAbilityId.get(normalizeAbilityReference(ability.id)) ?? 0,
        rarity: ability.rarity.trim() ? Number(ability.rarity) : null,
        minimumModLevel: ability.minimumModLevel.trim() ? Number(ability.minimumModLevel) : null,
        primaryModSlot: ability.primaryModSlot.trim() || null,
        secondaryModSlot: ability.secondaryModSlot.trim() || null,
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
  const linkedModCountByAbilityId = new Map<string, number>();
  for (const mod of store.mods) {
    for (const abilityId of mod.abilities ?? []) {
      const normalizedId = normalizeAbilityReference(abilityId);
      if (!normalizedId) continue;
      linkedModCountByAbilityId.set(normalizedId, (linkedModCountByAbilityId.get(normalizedId) ?? 0) + 1);
    }
  }
  const data = store.abilities
    .slice()
    .map((ability) => ({
      id: ability.id,
      name: ability.name,
      description: ability.description,
      icon: undefined,
      deliveryType: undefined,
      linkedEffectCount: 0,
      linkedModCount: linkedModCountByAbilityId.get(normalizeAbilityReference(ability.id)) ?? 0,
      rarity: null,
      minimumModLevel: null,
      primaryModSlot: null,
      secondaryModSlot: null,
    }))
    .sort((left, right) => {
      const leftLabel = (left.name || String(left.id)).toLowerCase();
      const rightLabel = (right.name || String(right.id)).toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

  return NextResponse.json({ data });
}
