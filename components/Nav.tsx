"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard" },
  { href: "/mods", label: "Mods" },
  { href: "/items", label: "Items" },
  { href: "/missions", label: "Missions" },
  { href: "/mob-lab", label: "Mobs" },
  { href: "/merchant-lab", label: "Merchant Profiles" },
  { href: "/mission-lab", label: "Missions" },
  { href: "/authoring", label: "Authoring" },
  { href: "/reports/holes", label: "Holes" },
  { href: "/reports/outliers", label: "Outliers" },
  { href: "/settings", label: "Settings" }
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4">
      {tabs.map(t => (
        <Link
          key={t.href}
          href={t.href}
          className={`text-sm ${
            t.href === "/"
              ? pathname === "/"
                ? "text-accent"
                : "text-white/80 hover:text-white"
              : pathname === t.href || pathname?.startsWith(`${t.href}/`)
                ? "text-accent"
                : "text-white/80 hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
