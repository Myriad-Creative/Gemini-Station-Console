"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { CommsContactDraft } from "@lib/comms-manager/types";
import { importCommsWorkspace, resolvedPortraitPath } from "@lib/comms-manager/utils";

type DirectoryStatus = {
  tone: "neutral" | "error";
  message: string;
};

type DuplicatePortraitGroup = {
  key: string;
  path: string;
  contacts: CommsContactDraft[];
};

function contactLabel(contact: CommsContactDraft) {
  return contact.name.trim() || contact.id.trim() || "Unnamed Contact";
}

function canonicalPortraitKey(value: string) {
  return resolvedPortraitPath(value).trim().toLowerCase();
}

function duplicateSummary(group: DuplicatePortraitGroup) {
  return group.contacts.map((contact) => contactLabel(contact)).join(", ");
}

export default function CommsCharacterDirectoryApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [contacts, setContacts] = useState<CommsContactDraft[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<DirectoryStatus>({
    tone: "neutral",
    message: "Loading comms contacts.",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadCommsContacts() {
      try {
        const response = await fetch("/api/settings/data/source?kind=comms");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || typeof payload.text !== "string") {
          if (!cancelled) {
            setContacts([]);
            setSourceLabel("");
            setWarnings([]);
            setStatus({
              tone: "error",
              message: "No Comms.json was found under the active local game root.",
            });
          }
          return;
        }

        const imported = importCommsWorkspace(payload.text, payload.sourceLabel || "Local game source", "uploaded");
        if (cancelled) return;
        setContacts(imported.workspace.contacts);
        setSourceLabel(imported.workspace.sourceLabel || "");
        setWarnings(imported.warnings);
        setStatus({
          tone: "neutral",
          message: imported.workspace.contacts.length ? "" : "No comms contacts were found.",
        });
      } catch (error) {
        if (cancelled) return;
        setContacts([]);
        setSourceLabel("");
        setWarnings([]);
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "Could not load comms contacts.",
        });
      }
    }

    void loadCommsContacts();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((left, right) => {
      const leftLabel = contactLabel(left).toLowerCase();
      const rightLabel = contactLabel(right).toLowerCase();
      const byLabel = leftLabel.localeCompare(rightLabel);
      if (byLabel !== 0) return byLabel;
      return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [contacts]);

  const duplicatePortraitGroups = useMemo(() => {
    const groups = new Map<string, DuplicatePortraitGroup>();
    for (const contact of contacts) {
      const key = canonicalPortraitKey(contact.portrait);
      const path = resolvedPortraitPath(contact.portrait);
      const group = groups.get(key);
      if (group) {
        group.contacts.push(contact);
      } else {
        groups.set(key, { key, path, contacts: [contact] });
      }
    }
    return Array.from(groups.values())
      .filter((group) => group.contacts.length > 1)
      .sort((left, right) => right.contacts.length - left.contacts.length || left.path.localeCompare(right.path));
  }, [contacts]);

  const duplicatePortraitsByContactKey = useMemo(() => {
    const next = new Map<string, DuplicatePortraitGroup>();
    for (const group of duplicatePortraitGroups) {
      for (const contact of group.contacts) {
        next.set(contact.key, group);
      }
    }
    return next;
  }, [duplicatePortraitGroups]);

  const duplicateContactCount = duplicatePortraitGroups.reduce((total, group) => total + group.contacts.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Comms Characters</h1>
          <div className="text-sm text-white/60">{sourceLabel || "Local game source"}</div>
        </div>
        <Link href="/comms" className="rounded border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">
          Open Comms Manager
        </Link>
      </div>

      {status.message ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${status.tone === "error" ? "border-red-400/30 bg-red-950/30 text-red-100" : "border-white/10 bg-white/5 text-white/70"}`}>
          {status.message}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {warnings.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="label">Characters</div>
          <div className="mt-2 text-3xl font-semibold text-white">{contacts.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="label">Portraits Reused</div>
          <div className={`mt-2 text-3xl font-semibold ${duplicatePortraitGroups.length ? "text-amber-200" : "text-white"}`}>{duplicatePortraitGroups.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="label">Characters Affected</div>
          <div className={`mt-2 text-3xl font-semibold ${duplicateContactCount ? "text-amber-200" : "text-white"}`}>{duplicateContactCount}</div>
        </div>
      </div>

      {duplicatePortraitGroups.length ? (
        <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-50">
          <div className="font-semibold">Duplicate portrait alert</div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {duplicatePortraitGroups.map((group) => (
              <div key={group.key} className="rounded border border-amber-200/15 bg-black/20 px-3 py-2">
                <div className="break-all font-mono text-xs text-amber-100/80">{group.path}</div>
                <div className="mt-1 text-white/80">{duplicateSummary(group)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : contacts.length ? (
        <div className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          No duplicate portraits detected.
        </div>
      ) : null}

      <div className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-y-auto pr-2">
        <div className="grid gap-3 2xl:grid-cols-2">
          {sortedContacts.map((contact) => {
            const portraitPath = resolvedPortraitPath(contact.portrait);
            const duplicateGroup = duplicatePortraitsByContactKey.get(contact.key);
            return (
              <article key={contact.key} className="grid gap-4 rounded-lg border border-white/10 bg-[#10182a] p-4 md:grid-cols-[132px,minmax(0,1fr)]">
                <div className="flex h-44 w-full items-end justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b] md:w-32">
                  <img
                    src={buildIconSrc(portraitPath, contact.id || "contact", contactLabel(contact), sharedDataVersion)}
                    alt={contactLabel(contact)}
                    className="h-full w-full object-contain object-bottom"
                  />
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-semibold text-white">{contactLabel(contact)}</h2>
                      <div className="mt-1 break-all font-mono text-xs text-white/45">{contact.id || "missing_id"}</div>
                    </div>
                    {duplicateGroup ? (
                      <div className="rounded border border-amber-200/30 bg-amber-300/15 px-2 py-1 text-xs font-semibold text-amber-100">
                        Duplicate portrait x{duplicateGroup.contacts.length}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="label">Greeting</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/80">{contact.greeting.trim() || "No greeting."}</div>
                  </div>

                  <div>
                    <div className="label">Meta Notes</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/68">{contact.notes.trim() || "No meta notes."}</div>
                  </div>

                  <div className="break-all font-mono text-[11px] text-white/38">{portraitPath}</div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
