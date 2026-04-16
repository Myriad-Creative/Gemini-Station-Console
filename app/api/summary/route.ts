import { NextRequest, NextResponse } from "next/server";
import { loadAbilityManagerDatabase } from "@lib/ability-manager/load";
import {
  statusEffectOptionsFromDatabase,
  summarizeAbilityManager,
  validateAbilityDrafts,
  validateStatusEffectDrafts,
} from "@lib/ability-manager/utils";
import { normalizeImportedModCollection, validateModDrafts } from "@lib/authoring";
import { importCommsWorkspace, summarizeCommsWorkspace, validateCommsContacts } from "@lib/comms-manager/utils";
import { getConfig } from "@lib/config";
import { getSummary, getStore, warmupLoadIfNeeded } from "@lib/datastore";
import { importItemWorkspace, summarizeItemWorkspace, validateItemDrafts } from "@lib/item-manager/utils";
import { getLocalGameSourceState } from "@lib/local-game-source";
import { importMerchantWorkspace, summarizeMerchantWorkspace, validateMerchantProfiles } from "@lib/merchant-lab/utils";
import { importMobWorkspace, validateMobDrafts } from "@lib/mob-lab/utils";
import { getResolvedMissionLabWorkspace } from "@lib/mission-lab/resolved-workspace";
import { resolveMissionLabSessionId } from "@lib/mission-lab/store";
import { readPreferredDataFileText } from "@lib/shared-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardValidationSummary = {
  errors: number;
  warnings: number;
};

function emptyValidation(): DashboardValidationSummary {
  return {
    errors: 0,
    warnings: 0,
  };
}

function summarizeIssueLevels(issues: Array<{ level: "warning" | "error" }>): DashboardValidationSummary {
  return {
    errors: issues.filter((issue) => issue.level === "error").length,
    warnings: issues.filter((issue) => issue.level === "warning").length,
  };
}

async function loadItemValidation() {
  try {
    const { text, sourceLabel } = await readPreferredDataFileText("items");
    if (!text) {
      return {
        summary: summarizeItemWorkspace(null, []),
        warnings: [] as string[],
      };
    }

    const imported = importItemWorkspace(text, sourceLabel, "local");
    const issues = validateItemDrafts(imported.workspace.items);
    return {
      summary: summarizeItemWorkspace(imported.workspace, issues),
      warnings: imported.warnings.map((message) => `items.json: ${message}`),
    };
  } catch (error) {
    return {
      summary: summarizeItemWorkspace(null, []),
      warnings: [`Could not parse items.json: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function loadCommsValidation() {
  try {
    const { text, sourceLabel } = await readPreferredDataFileText("comms");
    if (!text) {
      return {
        summary: summarizeCommsWorkspace(null, []),
        warnings: [] as string[],
      };
    }

    const imported = importCommsWorkspace(text, sourceLabel, "uploaded");
    const issues = validateCommsContacts(imported.workspace.contacts);
    return {
      summary: summarizeCommsWorkspace(imported.workspace, issues),
      warnings: imported.warnings.map((message) => `Comms.json: ${message}`),
    };
  } catch (error) {
    return {
      summary: summarizeCommsWorkspace(null, []),
      warnings: [`Could not parse Comms.json: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function loadMerchantValidation() {
  try {
    const { text, sourceLabel } = await readPreferredDataFileText("merchantProfiles");
    if (!text) {
      return {
        summary: summarizeMerchantWorkspace(null, []),
        warnings: [] as string[],
      };
    }

    const imported = importMerchantWorkspace(text, sourceLabel, "uploaded");
    const issues = validateMerchantProfiles(imported.workspace.profiles);
    return {
      summary: summarizeMerchantWorkspace(imported.workspace, issues),
      warnings: imported.warnings.map((message) => `merchant_profiles.json: ${message}`),
    };
  } catch (error) {
    return {
      summary: summarizeMerchantWorkspace(null, []),
      warnings: [`Could not parse merchant_profiles.json: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function loadMobValidation() {
  try {
    const { text, sourceLabel } = await readPreferredDataFileText("mobs");
    if (!text) {
      return {
        count: 0,
        validation: emptyValidation(),
        warnings: [] as string[],
      };
    }

    const imported = importMobWorkspace(text, sourceLabel, "uploaded");
    const issues = validateMobDrafts(imported.workspace.mobs);
    return {
      count: imported.workspace.mobs.length,
      validation: summarizeIssueLevels(issues),
      warnings: imported.warnings.map((message) => `mobs.json: ${message}`),
    };
  } catch (error) {
    return {
      count: 0,
      validation: emptyValidation(),
      warnings: [`Could not parse mobs.json: ${error instanceof Error ? error.message : String(error)}`],
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
    const errors = [...store.errors];
    const warnings: string[] = [];

    const [itemValidationResult, commsValidationResult, merchantValidationResult, mobValidationResult] = await Promise.all([
      loadItemValidation(),
      loadCommsValidation(),
      loadMerchantValidation(),
      loadMobValidation(),
    ]);

    warnings.push(
      ...itemValidationResult.warnings,
      ...commsValidationResult.warnings,
      ...merchantValidationResult.warnings,
      ...mobValidationResult.warnings,
    );

    const merchantProfiles = merchantValidationResult.summary.totalProfiles;
    const comms = commsValidationResult.summary.totalContacts;
    const itemsMissingDescriptions = store.items.filter((item) => !String(item.description ?? "").trim()).length;
    const modsWithoutAbilities = store.mods.filter((mod) => !(mod.abilities ?? []).some((ability) => String(ability ?? "").trim())).length;
    const modValidation = summarizeIssueLevels(validateModDrafts(normalizeImportedModCollection(store.mods)));
    let abilitySummary = summarizeAbilityManager(null, [], []);
    let abilityValidation = emptyValidation();
    let statusEffectValidation = emptyValidation();
    let abilityModCatalogAvailable = false;

    const missionRows = missionWorkspace.summary ? missionWorkspace.missions : [];
    const missionsByBand = missionWorkspace.summary
      ? cfg.level_bands.map(([min, max]) => ({
          band: `${min}-${max}`,
          count: missionRows.filter((mission) => mission.level != null && mission.level >= min && mission.level <= max).length,
        }))
      : summary.missionsByBand;

    if (localGameSource.active && localGameSource.gameRootPath && localGameSource.available.data) {
      try {
        const abilityDatabase = loadAbilityManagerDatabase(localGameSource.gameRootPath);
        const abilityDiagnostics = abilityDatabase.diagnostics;
        errors.push(...abilityDiagnostics.filter((entry) => entry.level === "error").map((entry) => entry.message));
        warnings.push(...abilityDiagnostics.filter((entry) => entry.level === "warning").map((entry) => entry.message));

        const statusEffectOptions = statusEffectOptionsFromDatabase(abilityDatabase);
        const abilityIssues = validateAbilityDrafts(
          abilityDatabase.abilities,
          statusEffectOptions,
          abilityDatabase.mods,
          abilityDatabase.modCatalogAvailable,
        );
        const statusEffectIssues = validateStatusEffectDrafts(abilityDatabase.statusEffects);
        abilitySummary = summarizeAbilityManager(abilityDatabase, abilityIssues, statusEffectIssues);
        abilityValidation = summarizeIssueLevels(abilityIssues);
        statusEffectValidation = summarizeIssueLevels(statusEffectIssues);
        abilityModCatalogAvailable = abilityDatabase.modCatalogAvailable;
      } catch (error) {
        warnings.push(`Could not load ability orphan summaries: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!localGameSource.active) {
      if (localGameSource.gameRootPath) warnings.push(...localGameSource.errors);
      else warnings.push("No local game root is configured.");
    } else {
      if (!merchantProfiles) warnings.push("No merchant profiles were found in the local game root.");
      if (!comms) warnings.push("No comms contacts were found in the local game root.");
      if (!missionRows.length) warnings.push("No missions were found in the local game root.");
      if (itemsMissingDescriptions) warnings.push(`${itemsMissingDescriptions} item${itemsMissingDescriptions === 1 ? " is" : "s are"} missing descriptions.`);
    }

    const counts = {
      mods: store.mods.length,
      modsWithoutAbilities,
      items: itemValidationResult.summary.totalItems || store.items.length,
      itemsMissingDescriptions,
      missions: missionRows.length,
      mobs: mobValidationResult.count || store.mobs.length,
      abilities: abilitySummary.totalAbilities || store.abilities.length,
      statusEffects: abilitySummary.totalStatusEffects,
      orphanAbilities: abilitySummary.orphanAbilityCount,
      orphanStatusEffects: abilitySummary.orphanStatusEffectCount,
      merchantProfiles,
      comms,
      holes: summary.holes.length,
      outliers: summary.outliers.length,
    };

    const validation = {
      mods: modValidation,
      abilities: abilityValidation,
      statusEffects: statusEffectValidation,
      items: {
        errors: itemValidationResult.summary.errorCount,
        warnings: itemValidationResult.summary.warningCount,
      },
      missions: {
        errors: missionWorkspace.summary?.parseErrors ?? 0,
        warnings: missionWorkspace.summary?.parseWarnings ?? 0,
      },
      mobs: mobValidationResult.validation,
      merchantProfiles: {
        errors: merchantValidationResult.summary.errorCount,
        warnings: merchantValidationResult.summary.warningCount,
      },
      comms: {
        errors: commsValidationResult.summary.errorCount,
        warnings: commsValidationResult.summary.warningCount,
      },
    };

    const priorities = {
      modsWithoutAbilities,
      orphanAbilities: abilitySummary.orphanAbilityCount,
      orphanStatusEffects: abilitySummary.orphanStatusEffectCount,
      abilitiesMissingSlotTags: Math.max(abilitySummary.modAssignableAbilityCount - abilitySummary.slotTaggedAbilityCount, 0),
      abilitiesMissingMinimumModLevel: Math.max(
        abilitySummary.modAssignableAbilityCount - abilitySummary.minimumModLevelAbilityCount,
        0,
      ),
      itemsMissingDescriptions,
    };

    const abilityCoverage = {
      totalAbilities: abilitySummary.totalAbilities,
      modAssignableAbilities: abilitySummary.modAssignableAbilityCount,
      effectLinkedAbilities: abilitySummary.effectLinkedAbilityCount,
      modLinkedAbilities: abilitySummary.modLinkedAbilityCount,
      slotTaggedAbilities: abilitySummary.slotTaggedAbilityCount,
      minimumModLevelAbilities: abilitySummary.minimumModLevelAbilityCount,
      totalStatusEffects: abilitySummary.totalStatusEffects,
      trackedStatusEffects: abilitySummary.trackedStatusEffectCount,
      linkedStatusEffects: abilitySummary.linkedStatusEffectCount,
    };

    return NextResponse.json({
      lastLoaded: store.lastLoaded,
      errors,
      warnings,
      source: {
        active: localGameSource.active,
        gameRootPath: localGameSource.gameRootPath,
        lastValidated: localGameSource.lastValidated,
      },
      abilityModCatalogAvailable,
      counts,
      validation,
      priorities,
      abilityCoverage,
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
      counts: {
        mods: 0,
        modsWithoutAbilities: 0,
        items: 0,
        itemsMissingDescriptions: 0,
        missions: 0,
        mobs: 0,
        abilities: 0,
        statusEffects: 0,
        orphanAbilities: 0,
        orphanStatusEffects: 0,
        merchantProfiles: 0,
        comms: 0,
        holes: 0,
        outliers: 0,
      },
      validation: {
        mods: emptyValidation(),
        abilities: emptyValidation(),
        statusEffects: emptyValidation(),
        items: emptyValidation(),
        missions: emptyValidation(),
        mobs: emptyValidation(),
        merchantProfiles: emptyValidation(),
        comms: emptyValidation(),
      },
      priorities: {
        modsWithoutAbilities: 0,
        orphanAbilities: 0,
        orphanStatusEffects: 0,
        abilitiesMissingSlotTags: 0,
        abilitiesMissingMinimumModLevel: 0,
        itemsMissingDescriptions: 0,
      },
      abilityCoverage: {
        totalAbilities: 0,
        modAssignableAbilities: 0,
        effectLinkedAbilities: 0,
        modLinkedAbilities: 0,
        slotTaggedAbilities: 0,
        minimumModLevelAbilities: 0,
        totalStatusEffects: 0,
        trackedStatusEffects: 0,
        linkedStatusEffects: 0,
      },
      missionsByBand: [], modsCoverage: [], modsCoverageBands: [], bandLabels: [], rarityCounts: [], holes: [], outliers: []
    }, { status: 500 });
  }
}
