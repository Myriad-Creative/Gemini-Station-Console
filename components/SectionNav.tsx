"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getActiveSection, getSectionLinks, isSectionLinkActive } from "@components/nav-config";
import { publishSharedDataWorkspaceUpdate } from "@lib/shared-upload-client";

type RefreshState =
  | { tone: "success"; message: string }
  | { tone: "error"; message: string }
  | null;

export default function SectionNav() {
  const pathname = usePathname();
  const links = getSectionLinks(pathname);
  const activeSection = getActiveSection(pathname);
  const [reindexing, setReindexing] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState>(null);

  useEffect(() => {
    if (!refreshState) return;
    const timeout = window.setTimeout(() => setRefreshState(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [refreshState]);

  async function handleReindexLocalData() {
    if (reindexing) return;
    setReindexing(true);
    setRefreshState(null);
    try {
      const response = await fetch("/api/reload", { method: "POST" });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.ok && Array.isArray(json.errors) && json.errors.length === 0) {
        publishSharedDataWorkspaceUpdate();
        setRefreshState({ tone: "success", message: "Data loaded" });
        return;
      }
      setRefreshState({ tone: "error", message: "Data not loaded" });
      if (response.ok && json.ok) {
        publishSharedDataWorkspaceUpdate();
      }
    } catch {
      setRefreshState({ tone: "error", message: "Data not loaded" });
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <nav className="flex min-w-0 flex-wrap items-center gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            target={link.newTab ? "_blank" : undefined}
            rel={link.newTab ? "noreferrer" : undefined}
            className={`text-sm ${
              isSectionLinkActive(pathname, link) ? "text-accent" : "text-white/60 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {refreshState ? (
          <div className={`text-sm ${refreshState.tone === "success" ? "text-emerald-300" : "text-red-300"}`}>{refreshState.message}</div>
        ) : null}
        <button
          className="rounded border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white disabled:cursor-default disabled:opacity-50"
          onClick={() => void handleReindexLocalData()}
          disabled={reindexing}
        >
          {reindexing ? "Refreshing..." : "Refresh data"}
        </button>
      </div>
    </div>
  );
}
