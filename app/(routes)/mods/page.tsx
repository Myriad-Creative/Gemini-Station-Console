import Link from "next/link";

const modLinks = [
  {
    href: "/mods/explorer",
    title: "Mods Explorer",
    description: "Browse the current console mod dataset with the existing filters, stats, and ability views.",
  },
  {
    href: "/mods/builder",
    title: "Mod Builder",
    description: "Create, batch build, auto-generate, validate, and export mod drafts with the current budget rules.",
  },
];

export default function ModsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Mods</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Mod tooling is now grouped here. This dashboard is a placeholder entry point for the mod explorer and the mod builder.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {modLinks.map((link) => (
          <Link key={link.href} href={link.href} className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
            <div className="text-xl font-semibold text-white">{link.title}</div>
            <div className="text-sm leading-6 text-white/65">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
