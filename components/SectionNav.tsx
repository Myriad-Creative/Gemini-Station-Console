"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getActiveSection, getSectionLinks, isSectionLinkActive } from "@components/nav-config";
import { publishSharedDataWorkspaceUpdate } from "@lib/shared-upload-client";

export default function SectionNav() {
  const pathname = usePathname();
  const links = getSectionLinks(pathname);
  const activeSection = getActiveSection(pathname);
  const [reindexing, setReindexing] = useState(false);

  if (!links.length) return null;

  async function handleReindexLocalData() {
    if (reindexing) return;
    setReindexing(true);
    try {
      const response = await fetch("/api/reload", { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.ok) {
        publishSharedDataWorkspaceUpdate();
      }
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="border-t border-white/10 pt-3">
      <nav className="flex flex-wrap items-center gap-4">
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
        {activeSection === "settings" ? (
          <button
            className="rounded border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-50"
            onClick={() => void handleReindexLocalData()}
            disabled={reindexing}
          >
            {reindexing ? "Re-indexing..." : "Refresh / Re-index Local Data"}
          </button>
        ) : null}
      </nav>
    </div>
  );
}
