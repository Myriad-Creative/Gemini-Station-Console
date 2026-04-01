"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isMainLinkActive, MAIN_NAV_LINKS } from "@components/nav-config";

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap justify-end gap-4">
      {MAIN_NAV_LINKS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`text-sm ${isMainLinkActive(pathname, t.href) ? "text-accent" : "text-white/80 hover:text-white"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
