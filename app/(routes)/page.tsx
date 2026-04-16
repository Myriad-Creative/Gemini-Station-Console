"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ChartBar from "@components/ChartBar";
import HeatmapBands from "@components/HeatmapBands";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type ValidationSummary = {
  errors: number;
  warnings: number;
};

type Summary = {
  lastLoaded?: string | null;
  errors: string[];
  warnings: string[];
  source: {
    active: boolean;
    gameRootPath: string | null;
    lastValidated: string | null;
  };
  counts: {
    mods: number;
    modsWithoutAbilities: number;
    items: number;
    itemsMissingDescriptions: number;
    missions: number;
    mobs: number;
    abilities: number;
    statusEffects: number;
    orphanAbilities: number;
    orphanStatusEffects: number;
    merchantProfiles: number;
    comms: number;
    holes: number;
    outliers: number;
  };
  abilityModCatalogAvailable: boolean;
  validation: {
    mods: ValidationSummary;
    abilities: ValidationSummary;
    statusEffects: ValidationSummary;
    items: ValidationSummary;
    missions: ValidationSummary;
    mobs: ValidationSummary;
    merchantProfiles: ValidationSummary;
    comms: ValidationSummary;
  };
  priorities: {
    modsWithoutAbilities: number;
    orphanAbilities: number;
    orphanStatusEffects: number;
    abilitiesMissingSlotTags: number;
    abilitiesMissingMinimumModLevel: number;
    itemsMissingDescriptions: number;
  };
  abilityCoverage: {
    totalAbilities: number;
    modAssignableAbilities: number;
    effectLinkedAbilities: number;
    modLinkedAbilities: number;
    slotTaggedAbilities: number;
    minimumModLevelAbilities: number;
    totalStatusEffects: number;
    trackedStatusEffects: number;
    linkedStatusEffects: number;
  };
  missionsByBand: { band: string; count: number }[];
  modsCoverageBands: { slot: string; band: string; count: number }[];
  bandLabels: string[];
  rarityCounts: { rarity: number; count: number }[];
};

type ServiceCard = {
  href: string;
  label: string;
  description: string;
  value: number;
  accent?: string;
  notice?: string | null;
};

function DashboardCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div className="text-lg font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

function ServiceLinkCard({ href, label, description, value, accent, notice }: ServiceCard) {
  return (
    <Link href={href} className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">{label}</div>
          <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
          {notice ? <div className="mt-2 text-xs text-yellow-100/75">{notice}</div> : null}
        </div>
        <div className={`text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
      </div>
    </Link>
  );
}

function IssuePill({
  tone,
  message,
}: {
  tone: "error" | "warning";
  message: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        tone === "error" ? "border-red-400/20 bg-red-400/10 text-red-100" : "border-yellow-400/20 bg-yellow-400/10 text-yellow-100"
      }`}
    >
      {message}
    </div>
  );
}

function joinNoticeParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatValidationNotice(summary: ValidationSummary, labelPrefix?: string) {
  const prefix = labelPrefix ? `${labelPrefix} ` : "";
  return joinNoticeParts([
    summary.errors ? formatCount(summary.errors, `${prefix}error`) : null,
    summary.warnings ? formatCount(summary.warnings, `${prefix}warning`) : null,
  ]);
}

function MetricLinkRow({
  href,
  label,
  value,
  description,
  accent,
}: {
  href: string;
  label: string;
  value: number | string;
  description: string;
  accent?: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="mt-1 text-xs leading-5 text-white/55">{description}</div>
      </div>
      <div className={`shrink-0 text-2xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </Link>
  );
}

function ValidationLinkTile({
  href,
  label,
  summary,
}: {
  href: string;
  label: string;
  summary: ValidationSummary;
}) {
  const hasErrors = summary.errors > 0;
  const hasWarnings = summary.warnings > 0;

  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full border px-2.5 py-1 ${hasErrors ? "border-red-400/35 bg-red-400/10 text-red-100" : "border-white/10 bg-white/[0.03] text-white/55"}`}>
          {summary.errors} error{summary.errors === 1 ? "" : "s"}
        </span>
        <span className={`rounded-full border px-2.5 py-1 ${hasWarnings ? "border-yellow-400/35 bg-yellow-400/10 text-yellow-100" : "border-white/10 bg-white/[0.03] text-white/55"}`}>
          {summary.warnings} warning{summary.warnings === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}

function CoverageRow({
  href,
  label,
  count,
  total,
  description,
  available = true,
}: {
  href: string;
  label: string;
  count: number;
  total: number;
  description: string;
  available?: boolean;
}) {
  const percent = available && total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <Link href={href} className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className={`text-sm font-semibold ${available ? "text-white" : "text-white/45"}`}>
          {available ? `${count} / ${total}` : "N/A"}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${available ? "bg-cyan-300/80" : "bg-white/20"}`}
          style={{ width: `${available ? Math.min(percent, 100) : 100}%` }}
        />
      </div>
      <div className="mt-2 text-xs leading-5 text-white/55">{available ? `${percent}% · ${description}` : description}</div>
    </Link>
  );
}

export default function DashboardPage() {
  const sessionId = useMissionLabSessionId();
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/summary", {
          headers: buildMissionLabSessionHeaders(sessionId),
        });
        const payload = (await response.json().catch(() => null)) as Summary | null;
        if (!cancelled) setData(payload);
      } catch (error) {
        if (cancelled) return;
        setData({
          lastLoaded: null,
          errors: [String(error)],
          warnings: [],
          source: {
            active: false,
            gameRootPath: null,
            lastValidated: null,
          },
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
          abilityModCatalogAvailable: false,
          validation: {
            mods: { errors: 0, warnings: 0 },
            abilities: { errors: 0, warnings: 0 },
            statusEffects: { errors: 0, warnings: 0 },
            items: { errors: 0, warnings: 0 },
            missions: { errors: 0, warnings: 0 },
            mobs: { errors: 0, warnings: 0 },
            merchantProfiles: { errors: 0, warnings: 0 },
            comms: { errors: 0, warnings: 0 },
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
          missionsByBand: [],
          modsCoverageBands: [],
          bandLabels: [],
          rarityCounts: [],
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, sharedDataVersion]);

  if (!data) return <div>Loading…</div>;

  const abilitySectionValidation = {
    errors: data.validation.abilities.errors + data.validation.statusEffects.errors,
    warnings: data.validation.abilities.warnings + data.validation.statusEffects.warnings,
  } satisfies ValidationSummary;

  const serviceCards: ServiceCard[] = [
    {
      href: "/mods",
      label: "Mods",
      description: "Browse and author console mod data.",
      value: data.counts.mods,
      notice: joinNoticeParts([
        data.counts.modsWithoutAbilities
          ? `${formatCount(data.counts.modsWithoutAbilities, "mod")} without abilities attached`
          : "All mods have abilities attached",
        formatValidationNotice(data.validation.mods),
      ]),
    },
    {
      href: "/abilities",
      label: "Abilities",
      description: "Manage runtime abilities and linked status effects.",
      value: data.counts.abilities,
      notice: joinNoticeParts([
        data.abilityModCatalogAvailable
          ? formatCount(data.counts.orphanAbilities, "orphan ability", "orphan abilities")
          : "Mod link data unavailable",
        formatCount(data.counts.orphanStatusEffects, "orphan effect", "orphan effects"),
        formatValidationNotice(abilitySectionValidation),
      ]),
    },
    {
      href: "/items",
      label: "Items",
      description: "Inspect the current item catalog.",
      value: data.counts.items,
      notice: joinNoticeParts([
        data.counts.itemsMissingDescriptions
          ? formatCount(data.counts.itemsMissingDescriptions, "missing description")
          : "Descriptions complete",
        formatValidationNotice(data.validation.items),
      ]),
    },
    {
      href: "/missions",
      label: "Missions",
      description: "Open mission explorer, lab, and creator.",
      value: data.counts.missions,
      notice: formatValidationNotice(data.validation.missions, "parse") || "No parse issues detected",
    },
    {
      href: "/mob-lab",
      label: "Mobs",
      description: "Manage runtime mob and NPC data.",
      value: data.counts.mobs,
      notice: formatValidationNotice(data.validation.mobs) || "No validation issues detected",
    },
    {
      href: "/merchant-lab",
      label: "Merchant Profiles",
      description: "Build and inspect vendor assortments.",
      value: data.counts.merchantProfiles,
      notice: formatValidationNotice(data.validation.merchantProfiles) || "No validation issues detected",
    },
    {
      href: "/comms",
      label: "Comms",
      description: "Manage contact directory entries.",
      value: data.counts.comms,
      notice: formatValidationNotice(data.validation.comms) || "No validation issues detected",
    },
    {
      href: "/reports/holes",
      label: "Holes",
      description: "Coverage gaps by slot, level band, and rarity.",
      value: data.counts.holes,
      accent: data.counts.holes ? "text-yellow-200" : "text-white",
    },
  ];

  const issueCount = data.errors.length + data.warnings.length;
  const sourceIssues = [
    ...data.errors.map((message) => ({ tone: "error" as const, message })),
    ...data.warnings.map((message) => ({ tone: "warning" as const, message })),
  ];
  const visibleSourceIssues = sourceIssues.slice(0, 8);
  const hiddenSourceIssueCount = Math.max(sourceIssues.length - visibleSourceIssues.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Dashboard</h1>
        <p className="max-w-4xl text-sm text-white/65">
          At-a-glance overview of the content currently loaded from the active Gemini Station local game root.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {serviceCards.map((card) => (
          <ServiceLinkCard key={card.href} {...card} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard title="Authoring Priorities">
          <div className="grid gap-3">
            <MetricLinkRow
              href="/mods"
              label="Mods Without Abilities"
              value={data.priorities.modsWithoutAbilities}
              description="Mods still missing their first ability assignment."
              accent={data.priorities.modsWithoutAbilities ? "text-amber-200" : undefined}
            />
            <MetricLinkRow
              href="/abilities"
              label="Orphan Abilities"
              value={data.abilityModCatalogAvailable ? data.priorities.orphanAbilities : "N/A"}
              description={
                data.abilityModCatalogAvailable
                  ? "Abilities not attached to any mod yet."
                  : "Mod link data is unavailable for the current source."
              }
              accent={data.abilityModCatalogAvailable && data.priorities.orphanAbilities ? "text-amber-200" : undefined}
            />
            <MetricLinkRow
              href="/abilities/status-effects"
              label="Orphan Status Effects"
              value={data.priorities.orphanStatusEffects}
              description="Tracked status effects still waiting for an ability."
              accent={data.priorities.orphanStatusEffects ? "text-amber-200" : undefined}
            />
            <MetricLinkRow
              href="/abilities"
              label="Missing Slot Tags"
              value={data.priorities.abilitiesMissingSlotTags}
              description="Abilities without primary or secondary mod slot tags."
              accent={data.priorities.abilitiesMissingSlotTags ? "text-amber-200" : undefined}
            />
            <MetricLinkRow
              href="/abilities"
              label="Missing Minimum Mod Level"
              value={data.priorities.abilitiesMissingMinimumModLevel}
              description="Abilities without minimum tier guidance for pairing."
              accent={data.priorities.abilitiesMissingMinimumModLevel ? "text-amber-200" : undefined}
            />
            <MetricLinkRow
              href="/items"
              label="Items Missing Descriptions"
              value={data.priorities.itemsMissingDescriptions}
              description="Items that exist in data but still need player-facing copy."
              accent={data.priorities.itemsMissingDescriptions ? "text-amber-200" : undefined}
            />
          </div>
        </DashboardCard>

        <DashboardCard title="Ability Coverage">
          <div className="grid gap-3">
            <CoverageRow
              href="/abilities"
              label="Effect-Linked Abilities"
              count={data.abilityCoverage.effectLinkedAbilities}
              total={data.abilityCoverage.totalAbilities}
              description="Abilities with at least one resolved status-effect link."
            />
            <CoverageRow
              href="/abilities"
              label="Mod-Linked Abilities"
              count={data.abilityCoverage.modLinkedAbilities}
              total={data.abilityCoverage.modAssignableAbilities}
              description={
                data.abilityModCatalogAvailable
                  ? "Assignable abilities already used by at least one mod."
                  : "Mod link data is unavailable for the current source."
              }
              available={data.abilityModCatalogAvailable}
            />
            <CoverageRow
              href="/abilities"
              label="Slot-Tagged Abilities"
              count={data.abilityCoverage.slotTaggedAbilities}
              total={data.abilityCoverage.modAssignableAbilities}
              description="Assignable abilities with primary or secondary mod slots."
            />
            <CoverageRow
              href="/abilities"
              label="Minimum-Level Tagged"
              count={data.abilityCoverage.minimumModLevelAbilities}
              total={data.abilityCoverage.modAssignableAbilities}
              description="Assignable abilities with minimumModLevel defined."
            />
            <CoverageRow
              href="/abilities/status-effects"
              label="Linked Status Effects"
              count={data.abilityCoverage.linkedStatusEffects}
              total={data.abilityCoverage.trackedStatusEffects}
              description="Tracked status effects already referenced by an ability."
            />
          </div>
        </DashboardCard>

        <DashboardCard title="Validation Snapshot">
          <div className="grid gap-3 md:grid-cols-2">
            <ValidationLinkTile href="/mods" label="Mods" summary={data.validation.mods} />
            <ValidationLinkTile href="/abilities" label="Abilities" summary={data.validation.abilities} />
            <ValidationLinkTile href="/abilities/status-effects" label="Status Effects" summary={data.validation.statusEffects} />
            <ValidationLinkTile href="/items" label="Items" summary={data.validation.items} />
            <ValidationLinkTile href="/missions" label="Missions" summary={data.validation.missions} />
            <ValidationLinkTile href="/mob-lab" label="Mobs" summary={data.validation.mobs} />
            <ValidationLinkTile href="/merchant-lab" label="Merchant Profiles" summary={data.validation.merchantProfiles} />
            <ValidationLinkTile href="/comms" label="Comms" summary={data.validation.comms} />
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="Source Issues">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
          <span>{data.errors.length} error(s)</span>
          <span>{data.warnings.length} warning(s)</span>
          <span>{data.counts.abilities} abilities</span>
          <span>{data.counts.statusEffects} status effects</span>
        </div>

        {issueCount ? (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleSourceIssues.map((issue, index) => (
                <IssuePill key={`${issue.tone}-${index}`} tone={issue.tone} message={issue.message} />
              ))}
            </div>
            {hiddenSourceIssueCount ? (
              <div className="text-xs text-white/50">
                Showing the first {visibleSourceIssues.length} source issues. {hiddenSourceIssueCount} more issue{hiddenSourceIssueCount === 1 ? "" : "s"} remain.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-white/55">No current source or parsing issues detected.</div>
        )}
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard title="Mission Level Bands">
          {data.missionsByBand.length ? (
            <ChartBar labels={data.missionsByBand.map((entry) => entry.band)} values={data.missionsByBand.map((entry) => entry.count)} />
          ) : (
            <div className="text-sm text-white/55">No mission data loaded yet.</div>
          )}
        </DashboardCard>

        <DashboardCard title="Mod Rarity Distribution">
          {data.rarityCounts.length ? (
            <ChartBar labels={data.rarityCounts.map((entry) => String(entry.rarity))} values={data.rarityCounts.map((entry) => entry.count)} />
          ) : (
            <div className="text-sm text-white/55">No mod data loaded yet.</div>
          )}
        </DashboardCard>
      </div>

      <DashboardCard title="Mod Coverage By Band">
        {data.modsCoverageBands.length ? (
          <HeatmapBands data={data.modsCoverageBands} bands={data.bandLabels} />
        ) : (
          <div className="text-sm text-white/55">No mod coverage data loaded yet.</div>
        )}
      </DashboardCard>

      <DashboardCard title="Source">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="min-w-0">
            <div className="label">Game Root</div>
            <div className="mt-2 break-all font-mono text-xs text-white/75">{data.source.gameRootPath || "No local game root configured."}</div>
          </div>
          <div>
            <div className="label">Last Loaded</div>
            <div className="mt-2 text-sm text-white/80">{data.lastLoaded ? new Date(data.lastLoaded).toLocaleString() : "—"}</div>
          </div>
          <div>
            <div className="label">Last Validated</div>
            <div className="mt-2 text-sm text-white/80">{data.source.lastValidated ? new Date(data.source.lastValidated).toLocaleString() : "—"}</div>
          </div>
        </div>

        {!data.source.active ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
            <span>No active local game root is configured.</span>
            <Link href="/settings" className="btn">
              Open Settings
            </Link>
          </div>
        ) : null}
      </DashboardCard>
    </div>
  );
}
