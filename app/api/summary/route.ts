import { NextRequest, NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import { summarizeAbilityManager } from "@lib/ability-manager/utils";
import { getConfig } from "@lib/config";
import { getSummary, getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { parseLooseJson } from "@lib/json";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId } from "@lib/mission-lab/store";
import { readPreferredDataFileText } from "@lib/shared-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function countJsonEntries(kind: "merchantProfiles" | "comms") {
  try {
    const { text } = await readPreferredDataFileText(kind);
    if (!text) return { count: 0, warning: null };

    const parsed = parseLooseJson<unknown>(text);
    if (Array.isArray(parsed)) return { count: parsed.length, warning: null };
    if (parsed && typeof parsed === "object") {
      return {
        count: Object.keys(parsed as Record<string, unknown>).length,
        warning: null,
      };
    }
    return {
      count: 0,
      warning: `${kind === "merchantProfiles" ? "merchant_profiles.json" : "Comms.json"} does not contain an array or object map.`,
    };
  } catch (error) {
    return {
      count: 0,
      warning: `Could not parse ${kind === "merchantProfiles" ? "merchant_profiles.json" : "Comms.json"}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    await warmupLoadIfNeeded();
    const store = getStore();
    const summary = getSummary();
    const sessionId = resolveMissionLabSessionId(req);
    const missionWorkspace = await getResolvedMissionLabWorkspace(sessionId);
    const cfg = getConfig();
    const localGameSource = getLocalGameSourceState();
    const [merchantProfilesResult, commsResult] = await Promise.all([countJsonEntries("merchantProfiles"), countJsonEntries("comms")]);
    const merchantProfiles = merchantProfilesResult.count;
    const comms = commsResult.count;
    const itemsMissingDescriptions = store.items.filter((item) => !String(item.description ?? "").trim()).length;
    const modsWithoutAbilities = store.mods.filter((mod) => !(mod.abilities ?? []).some((ability) => String(ability ?? "").trim())).length;
    let orphanAbilities = 0;
    let orphanStatusEffects = 0;
    let abilityModCatalogAvailable = false;

    const missionRows = missionWorkspace.summary ? missionWorkspace.missions : [];
    const missionsByBand = missionWorkspace.summary
      ? cfg.level_bands.map(([min, max]) => ({
          band: `${min}-${max}`,
          count: missionRows.filter((mission) => mission.level != null && mission.level >= min && mission.level <= max).length,
        }))
      : summary.missionsByBand;

    const warnings: string[] = [];
    if (localGameSource.active && localGameSource.gameRootPath && localGameSource.available.data) {
      try {
        const abilityDatabase = loadAbilityManagerDatabase(localGameSource.gameRootPath);
        const abilitySummary = summarizeAbilityManager(abilityDatabase, [], []);
        orphanAbilities = abilitySummary.orphanAbilityCount;
        orphanStatusEffects = abilitySummary.orphanStatusEffectCount;
        abilityModCatalogAvailable = abilityDatabase.modCatalogAvailable;
      } catch (error) {
        warnings.push(`Could not load ability orphan summaries: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!localGameSource.active) {
      if (localGameSource.gameRootPath) warnings.push(...localGameSource.errors);
      else warnings.push("No local game root is configured.");
    } else {
      if (merchantProfilesResult.warning) warnings.push(merchantProfilesResult.warning);
      if (commsResult.warning) warnings.push(commsResult.warning);
      if (!merchantProfiles) warnings.push("No merchant profiles were found in the local game root.");
      if (!comms) warnings.push("No comms contacts were found in the local game root.");
      if (!missionRows.length) warnings.push("No missions were found in the local game root.");
      if (itemsMissingDescriptions) warnings.push(`${itemsMissingDescriptions} item${itemsMissingDescriptions === 1 ? " is" : "s are"} missing descriptions.`);
    }

    const counts = {
      mods: store.mods.length,
      modsWithoutAbilities,
      items: store.items.length,
      itemsMissingDescriptions,
      missions: missionRows.length,
      mobs: store.mobs.length,
      abilities: store.abilities.length,
      orphanAbilities,
      orphanStatusEffects,
      merchantProfiles,
      comms,
      holes: summary.holes.length,
      outliers: summary.outliers.length,
    };
    return NextResponse.json({
      lastLoaded: store.lastLoaded,
      errors: store.errors,
      warnings,
      source: {
        active: localGameSource.active,
        gameRootPath: localGameSource.gameRootPath,
        lastValidated: localGameSource.lastValidated,
      },
      abilityModCatalogAvailable,
      counts,
      ...summary,
      missionsByBand,
    });
  } catch (e:any) {
    return NextResponse.json({
      lastLoaded: null,
      errors: [String(e?.message || e)],
      warnings: [],
      source: {
        active: false,
        gameRootPath: null,
        lastValidated: null,
      },
      abilityModCatalogAvailable: false,
      counts: { mods: 0, modsWithoutAbilities: 0, items: 0, itemsMissingDescriptions: 0, missions: 0, mobs: 0, abilities: 0, orphanAbilities: 0, orphanStatusEffects: 0, merchantProfiles: 0, comms: 0, holes: 0, outliers: 0 },
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
