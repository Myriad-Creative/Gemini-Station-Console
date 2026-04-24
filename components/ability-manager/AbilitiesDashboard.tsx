"use client";

import Link from "next/link";
import { useMemo } from "react";
import { summarizeAbilityManager } from "@lib/ability-manager/utils";
import { Section, StatusBanner, SummaryCard } from "@components/ability-manager/common";
import { useAbilityDatabase } from "@components/ability-manager/useAbilityDatabase";

export default function AbilitiesDashboard() {
  const { database, loading, error } = useAbilityDatabase();
  const summary = useMemo(() => summarizeAbilityManager(database, [], []), [database]);

  if (loading) return <div>Loading…</div>;

  if (!database) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">Abilities</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Ability and status-effect tooling is grouped here. Set the Gemini Station local game root in Settings first.
          </p>
        </div>
        <StatusBanner tone="error" message={error || "No local game root is configured."} />
        <Section title="Local Game Root Required">
          <p className="text-sm leading-6 text-white/65">
            Abilities and status effects now load directly from the active local Gemini Station folder. The console reads the indexed JSON files and
            the linked Godot ability scripts so it can show real status-effect connections.
          </p>
          <div>
            <Link href="/settings" className="btn">
              Open Settings
            </Link>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Abilities</h1>
        <p className="max-w-4xl text-sm text-white/70">
          Browse the runtime ability catalog, inspect script-linked status effects, and manage both ability JSON files and status effect JSON files
          from the active local game root.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <SummaryCard label="Abilities" value={summary.totalAbilities} />
        <SummaryCard label="Status Effects" value={summary.totalStatusEffects} />
        <SummaryCard label="Projectile" value={summary.projectileCount} />
        <SummaryCard label="Beam" value={summary.beamCount} />
        <SummaryCard
          label="Orphan Abilities"
          value={database.modCatalogAvailable ? summary.orphanAbilityCount : "N/A"}
          accent={database.modCatalogAvailable ? (summary.orphanAbilityCount ? "text-amber-200" : undefined) : "text-white/55"}
        />
        <SummaryCard label="Orphan Effects" value={summary.orphanStatusEffectCount} accent={summary.orphanStatusEffectCount ? "text-amber-200" : undefined} />
        <SummaryCard label="Warnings / Errors" value={`${summary.warningCount} / ${summary.errorCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
      </div>

      {database.diagnostics.length ? (
        <StatusBanner
          tone={database.diagnostics.some((entry) => entry.level === "error") ? "error" : "neutral"}
          message={`${database.diagnostics.length} loader diagnostic(s) detected across ability and status-effect files.`}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Link href="/abilities/manager" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Abilities Manager</div>
          <div className="text-sm leading-6 text-white/65">
            Search, create, clone, edit, delete, and export the indexed ability JSON set. Filter by delivery type like projectile or beam and inspect
            JSON-linked or script-linked status effects.
          </div>
        </Link>
        <Link href="/abilities/talents" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Talent Manager</div>
          <div className="text-sm leading-6 text-white/65">
            Manage class and talent tree presentation from TalentTrees.json, including requirements, descriptions, grid placement, and icon browsing.
          </div>
        </Link>
        <Link href="/abilities/bulk" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Ability Bulk Edit</div>
          <div className="text-sm leading-6 text-white/65">
            Filter the ability library, select any subset, and apply shared gameplay changes like threat, targeting, range, cooldown, rarity, and mod
            gating in one pass.
          </div>
        </Link>
        <Link href="/abilities/status-effects" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Status Effects Manager</div>
          <div className="text-sm leading-6 text-white/65">
            Manage status-effect entries, modifier payloads, stack rules, and linked abilities, all from the JSON files used by the Godot runtime.
          </div>
        </Link>
      </div>

      <Section title="Diagnostics" description="These warnings come from the current local game files and help explain mismatches between the index files, JSON files, and scripts.">
        {database.diagnostics.length ? (
          <div className="space-y-3">
            {database.diagnostics.map((entry, index) => (
              <div
                key={`${entry.level}-${index}`}
                className={`rounded-xl border px-3 py-3 text-sm ${
                  entry.level === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100"
                }`}
              >
                {entry.message}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/55">No current loader diagnostics were found.</div>
        )}
      </Section>
    </div>
  );
}
