import Link from "next/link";
import MissionWorkspaceManager from "@components/mission-lab/MissionWorkspaceManager";

const missionLinks = [
  {
    href: "/missions/explorer",
    title: "Mission Explorer",
    description: "Browse the current console mission data set and inspect objective coverage and level bands.",
  },
  {
    href: "/missions/lab",
    title: "Mission Lab",
    description: "Import zipped mission workspaces, inspect diagnostics, and visualize prerequisite chains.",
  },
  {
    href: "/missions/creator",
    title: "Mission Creator",
    description: "Author and export richer mission drafts with prerequisite validation and JSON export tooling.",
  },
];

export default function MissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Missions</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Import a shared missions workspace here, then use that same normalized mission data across Mission Explorer, Mission Lab, and Mission Creator.
        </p>
      </div>

      <MissionWorkspaceManager />

      <div className="grid gap-4 lg:grid-cols-3">
        {missionLinks.map((link) => (
          <Link key={link.href} href={link.href} className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
            <div className="text-xl font-semibold text-white">{link.title}</div>
            <div className="text-sm leading-6 text-white/65">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
