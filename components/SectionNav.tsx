"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSectionLinks, isSectionLinkActive } from "@components/nav-config";

export default function SectionNav() {
  const pathname = usePathname();
  const links = getSectionLinks(pathname);

  if (!links.length) return null;

  return (
    <div className="border-t border-white/10 pt-3">
      <nav className="flex flex-wrap gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm ${
              isSectionLinkActive(pathname, link) ? "text-accent" : "text-white/60 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
