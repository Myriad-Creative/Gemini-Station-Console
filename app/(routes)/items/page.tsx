import Link from "next/link";

const itemLinks = [
  {
    href: "/items/explorer",
    title: "Items Explorer",
    description: "Browse the current console item dataset with the existing filters, icons, and rarity-aware listing.",
  },
  {
    href: "/items/manager",
    title: "Items Manager",
    description: "Create, clone, edit, validate, and export item drafts from the active local game root.",
  },
];

export default function ItemsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Items</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Item tooling is now grouped here. Use the explorer for the read-only catalog view and the manager for item draft editing, cloning, and
          JSON export.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {itemLinks.map((link) => (
          <Link key={link.href} href={link.href} className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
            <div className="text-xl font-semibold text-white">{link.title}</div>
            <div className="text-sm leading-6 text-white/65">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
