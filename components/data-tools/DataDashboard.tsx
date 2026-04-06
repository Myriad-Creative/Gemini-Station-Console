"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBanner, SummaryCard } from "@components/data-tools/shared";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type LocalGameSourceStatus = {
  active: boolean;
  gameRootPath: string | null;
  dataRootPath?: string | null;
  assetsRootPath?: string | null;
  missionsRootPath?: string | null;
  lastValidated?: string | null;
  available: {
    data: boolean;
    assets: boolean;
    missions: boolean;
  };
};

const EMPTY_LOCAL_STATUS: LocalGameSourceStatus = {
  active: false,
  gameRootPath: null,
  dataRootPath: null,
  assetsRootPath: null,
  missionsRootPath: null,
  lastValidated: null,
  available: {
    data: false,
    assets: false,
    missions: false,
  },
};

const DATA_SECTIONS = [
  {
    href: "/data/map",
    title: "Map",
    description: "Edit points of interest and region rectangles from the active local game root.",
    keys: ["poi", "regions"],
  },
  {
    href: "/data/routes",
    title: "Routes",
    description: "Manage trade routes and NPC traffic configuration tied to the map and sector flow.",
    keys: ["tradeRoutes", "npcTraffic"],
  },
  {
    href: "/data/tutorial",
    title: "Tutorial",
    description: "Edit tutorial entries, trigger groups, event mappings, and discovery areas.",
    keys: ["tutorialEntries", "tutorialTriggers"],
  },
  {
    href: "/data/systems",
    title: "Systems",
    description: "Manage ship stat descriptions, zones, stages, and hazard barrier profiles.",
    keys: ["shipStatDescriptions", "zones", "stages", "hazardBarrierProfiles"],
  },
];

export default function DataDashboard() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [localStatus, setLocalStatus] = useState<LocalGameSourceStatus>(EMPTY_LOCAL_STATUS);
  const [message, setMessage] = useState("Checking local game root…");

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/settings");
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        const nextLocalStatus = payload.localGameSource || EMPTY_LOCAL_STATUS;
        setLocalStatus(nextLocalStatus);
        if (nextLocalStatus.active && nextLocalStatus.available.data) {
          setMessage("Local game source is active. The Data tools below are reading directly from that Gemini Station folder.");
        } else {
          setMessage("No local game root is active. Configure Settings first, then these editors will read directly from that Gemini Station folder.");
        }
      } catch {
        if (!cancelled) {
          setLocalStatus(EMPTY_LOCAL_STATUS);
          setMessage("Unable to read local game root status. Configure Settings first.");
        }
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Data</h1>
        <p className="max-w-4xl text-white/65">
          These editors read directly from the active Gemini Station local game root and are intended for non-mission JSON used by the Godot game:
          map data, trade routes, tutorial info, ship stat descriptions, zones, stages, hazard barriers, and traffic config.
        </p>
      </div>

      <StatusBanner tone={localStatus.active ? "success" : "neutral"} message={message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Source" value={localStatus.active ? "Local Game Root" : "Missing"} />
        <SummaryCard label="Data Folder" value={localStatus.available.data ? "Found" : "Missing"} />
        <SummaryCard label="Assets Folder" value={localStatus.available.assets ? "Found" : "Missing"} />
        <SummaryCard label="Missions Folder" value={localStatus.available.missions ? "Found" : "Missing"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {DATA_SECTIONS.map((section) => {
          return (
            <div key={section.href} className="card space-y-4">
              <div>
                <div className="text-xl font-semibold text-white">{section.title}</div>
                <div className="mt-1 text-sm text-white/55">{section.description}</div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/55">
                {section.keys.map((key) => (
                  <span key={key} className="rounded-full bg-white/5 px-2 py-1 text-white/60">
                    {key}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-white/60">{localStatus.available.data ? "Reading from the local game root." : "Set the local game root in Settings first."}</div>
                <Link href={section.href} className="btn">
                  Open {section.title}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
