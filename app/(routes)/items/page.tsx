"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

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

type ItemsSummary = {
  counts: {
    itemsMissingDescriptions: number;
  };
};

export default function ItemsPage() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [missingDescriptions, setMissingDescriptions] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch("/api/summary");
        const payload = (await response.json().catch(() => null)) as ItemsSummary | null;
        if (!cancelled) {
          setMissingDescriptions(payload?.counts?.itemsMissingDescriptions ?? 0);
        }
      } catch {
        if (!cancelled) {
          setMissingDescriptions(0);
        }
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Items</h1>
        <p className="max-w-3xl text-sm text-white/70">
          Item tooling is now grouped here. Use the explorer for the read-only catalog view and the manager for item draft editing, cloning, and
          JSON export.
        </p>
      </div>

      {missingDescriptions ? (
        <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
          {missingDescriptions} item{missingDescriptions === 1 ? " is" : "s are"} missing description
          {missingDescriptions === 1 ? "" : "s"}.
        </div>
      ) : null}

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
