"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSectionAnchorHref, getSectionLinks, isSectionLinkActive } from "@components/nav-config";

export default function SectionNav() {
  const pathname = usePathname();
  const links = getSectionLinks(pathname);
  const anchorHref = getSectionAnchorHref(pathname);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  useEffect(() => {
    function updateOffset() {
      const root = rootRef.current;
      if (!root || !anchorHref) {
        setOffset(null);
        return;
      }

      const anchor = document.querySelector<HTMLElement>(`[data-main-nav-link="true"][data-nav-href="${anchorHref}"]`);
      if (!anchor) {
        setOffset(null);
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      setOffset(Math.max(0, anchorRect.left - rootRect.left));
    }

    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => {
      window.removeEventListener("resize", updateOffset);
    };
  }, [anchorHref, pathname]);

  if (!links.length) return null;

  return (
    <div ref={rootRef} className="border-t border-white/10 pt-3">
      <nav className="flex flex-wrap gap-4" style={offset !== null ? { paddingLeft: `${offset}px` } : undefined}>
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
