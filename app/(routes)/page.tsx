"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ChartBar from "@components/ChartBar";
import HeatmapBands from "@components/HeatmapBands";
import { buildMissionLabSessionHeaders, useMissionLabSessionId } from "@lib/mission-lab/client-session";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

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
    items: number;
    missions: number;
    mobs: number;
    abilities: number;
    merchantProfiles: number;
    comms: number;
    holes: number;
    outliers: number;
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

function ServiceLinkCard({ href, label, description, value, accent }: ServiceCard) {
  return (
    <Link href={href} className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">{label}</div>
          <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
        </div>
        <div className={`text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
      </div>
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-100/65">Open</div>
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
            items: 0,
            missions: 0,
            mobs: 0,
            abilities: 0,
            merchantProfiles: 0,
            comms: 0,
            holes: 0,
            outliers: 0,
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

  const serviceCards: ServiceCard[] = [
    {
      href: "/mods",
      label: "Mods",
      description: "Browse and author console mod data.",
      value: data.counts.mods,
    },
    {
      href: "/items",
      label: "Items",
      description: "Inspect the current item catalog.",
      value: data.counts.items,
    },
    {
      href: "/missions",
      label: "Missions",
      description: "Open mission explorer, lab, and creator.",
      value: data.counts.missions,
    },
    {
      href: "/mob-lab",
      label: "Mobs",
      description: "Manage runtime mob and NPC data.",
      value: data.counts.mobs,
    },
    {
      href: "/merchant-lab",
      label: "Merchant Profiles",
      description: "Build and inspect vendor assortments.",
      value: data.counts.merchantProfiles,
    },
    {
      href: "/comms",
      label: "Comms",
      description: "Manage contact directory entries.",
      value: data.counts.comms,
    },
    {
      href: "/reports/holes",
      label: "Holes",
      description: "Coverage gaps by slot, level band, and rarity.",
      value: data.counts.holes,
      accent: data.counts.holes ? "text-yellow-200" : "text-white",
    },
    {
      href: "/reports/outliers",
      label: "Outliers",
      description: "Stat outliers and suspicious mod rolls.",
      value: data.counts.outliers,
      accent: data.counts.outliers ? "text-yellow-200" : "text-white",
    },
  ];

  const issueCount = data.errors.length + data.warnings.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Dashboard</h1>
        <p className="max-w-4xl text-sm text-white/65">
          At-a-glance overview of the content currently loaded from the active Gemini Station local game root.
        </p>
      </div>

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {serviceCards.map((card) => (
          <ServiceLinkCard key={card.href} {...card} />
        ))}
      </div>

      <DashboardCard title="Issues">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
          <span>{data.errors.length} error(s)</span>
          <span>{data.warnings.length} warning(s)</span>
          <span>{data.counts.abilities} abilities loaded</span>
        </div>

        {issueCount ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.errors.map((message, index) => (
              <IssuePill key={`error-${index}`} tone="error" message={message} />
            ))}
            {data.warnings.map((message, index) => (
              <IssuePill key={`warning-${index}`} tone="warning" message={message} />
            ))}
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
    </div>
  );
}
