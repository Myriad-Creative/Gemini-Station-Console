"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBanner, SummaryCard } from "@components/data-tools/shared";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type UploadedDataStatus = {
  active: boolean;
  sourceLabel: string | null;
  fileCount: number;
  jsonCount: number;
  lastImported: string | null;
  available: Record<string, boolean>;
};

type LocalGameSourceStatus = {
  active: boolean;
  gameRootPath: string | null;
  available: {
    data: boolean;
    assets: boolean;
    missions: boolean;
  };
};

const EMPTY_STATUS: UploadedDataStatus = {
  active: false,
  sourceLabel: null,
  fileCount: 0,
  jsonCount: 0,
  lastImported: null,
  available: {},
};

const EMPTY_LOCAL_STATUS: LocalGameSourceStatus = {
  active: false,
  gameRootPath: null,
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
    description: "Edit points of interest and region rectangles from the uploaded shared data workspace.",
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
  const [status, setStatus] = useState<UploadedDataStatus>(EMPTY_STATUS);
  const [localStatus, setLocalStatus] = useState<LocalGameSourceStatus>(EMPTY_LOCAL_STATUS);
  const [message, setMessage] = useState("Checking shared uploaded data workspace…");

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/settings");
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        const nextStatus = payload.uploadedData || EMPTY_STATUS;
        const nextLocalStatus = payload.localGameSource || EMPTY_LOCAL_STATUS;
        setStatus(nextStatus);
        setLocalStatus(nextLocalStatus);
        if (nextLocalStatus.active && nextLocalStatus.available.data) {
          setMessage("Local game source is active. The Data tools below are reading directly from that Gemini Station folder.");
        } else if (nextStatus.active) {
          setMessage("Shared uploaded data is active. The Data tools below will auto-seed from that workspace.");
        } else {
          setMessage("No local game source or shared uploaded data is active. Configure Settings first, or start blank in each editor.");
        }
      } catch {
        if (!cancelled) {
          setStatus(EMPTY_STATUS);
          setLocalStatus(EMPTY_LOCAL_STATUS);
          setMessage("Unable to read shared uploaded data status. You can still open the editors, but they may start blank.");
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
          These editors are driven by the shared <code>/data</code> upload from Settings and are intended for non-mission JSON used by the Godot game:
          map data, trade routes, tutorial info, ship stat descriptions, zones, stages, hazard barriers, and traffic config.
        </p>
      </div>

      <StatusBanner tone={status.active ? "success" : "neutral"} message={message} />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Source" value={localStatus.active ? "Local Game Root" : status.active ? "Uploaded Data" : "Missing"} />
        <SummaryCard label="Files" value={status.fileCount} />
        <SummaryCard label="JSON Files" value={status.jsonCount} />
        <SummaryCard
          label={localStatus.active ? "Game Root" : "Last Imported"}
          value={localStatus.active ? localStatus.gameRootPath || "—" : status.lastImported ? new Date(status.lastImported).toLocaleDateString() : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {DATA_SECTIONS.map((section) => {
          const available = section.keys.filter((key) => status.available?.[key]).length;
          return (
            <div key={section.href} className="card space-y-4">
              <div>
                <div className="text-xl font-semibold text-white">{section.title}</div>
                <div className="mt-1 text-sm text-white/55">{section.description}</div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/55">
                {section.keys.map((key) => (
                  <span
                    key={key}
                    className={`rounded-full px-2 py-1 ${status.available?.[key] ? "bg-emerald-400/15 text-emerald-100" : "bg-white/5 text-white/50"}`}
                  >
                    {key}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-white/60">
                  {available} of {section.keys.length} shared file{section.keys.length === 1 ? "" : "s"} currently available.
                </div>
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
