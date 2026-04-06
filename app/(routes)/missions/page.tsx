import Link from "next/link";

const missionLinks = [
  {
    href: "/missions/explorer",
    title: "Mission Explorer",
    description: "Browse the current shared imported mission workspace and inspect objective coverage and level bands.",
  },
  {
    href: "/missions/lab",
    title: "Mission Lab",
    description: "Inspect diagnostics and visualize prerequisite chains from the shared uploaded missions workspace.",
  },
  {
    href: "/missions/creator",
    title: "Mission Creator",
    description: "Author and export richer mission drafts seeded from the shared uploaded missions workspace.",
  },
];

export default function MissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Missions</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Mission uploads now live in Settings alongside the shared data and assets uploads. Once a missions zip or folder is loaded there, the same shared mission
          workspace is available across Mission Explorer, Mission Lab, and Mission Creator.
        </p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-white">Shared Mission Workspace</div>
          <div className="text-sm text-white/60">Use Settings to import or clear the shared missions zip/folder workspace for this browser session.</div>
        </div>
        <Link href="/settings" className="btn">
          Open Settings
        </Link>
      </div>

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
