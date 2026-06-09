"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { CommsContactDraft, CommsLabWorkspace } from "@lib/comms-manager/types";
import { importCommsWorkspace, resolvedPortraitPath, validateCommsContacts } from "@lib/comms-manager/utils";

type DirectoryStatus = {
  tone: "neutral" | "success" | "error";
  message: string;
};

type CommsPortraitOption = {
  fileName: string;
  relativePath: string;
  resPath: string;
};

type DuplicatePortraitGroup = {
  key: string;
  path: string;
  contacts: CommsContactDraft[];
};

type PortraitPickerState = {
  contactKey: string;
  search: string;
};

function contactLabel(contact: CommsContactDraft) {
  return contact.name.trim() || contact.id.trim() || "Unnamed Contact";
}

function canonicalPortraitKey(value: string) {
  return resolvedPortraitPath(value).trim().toLowerCase();
}

function portraitFileName(value: string) {
  const path = resolvedPortraitPath(value);
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function duplicateSummary(group: DuplicatePortraitGroup) {
  return group.contacts.map((contact) => contactLabel(contact)).join(", ");
}

export default function CommsCharacterDirectoryApp() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<CommsLabWorkspace | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [portraitOptions, setPortraitOptions] = useState<CommsPortraitOption[]>([]);
  const [portraitCatalogStatus, setPortraitCatalogStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portraitPicker, setPortraitPicker] = useState<PortraitPickerState | null>(null);
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
            setWorkspace(null);
            setWarnings([]);
            setDirty(false);
            setStatus({
              tone: "error",
              message: "No Comms.json was found under the active local game root.",
            });
          }
          return;
        }

        const imported = importCommsWorkspace(payload.text, payload.sourceLabel || "Local game source", "uploaded");
        if (cancelled) return;
        setWorkspace(imported.workspace);
        setWarnings(imported.warnings);
        setDirty(false);
        setStatus({
          tone: "neutral",
          message: imported.workspace.contacts.length ? "" : "No comms contacts were found.",
        });
      } catch (error) {
        if (cancelled) return;
        setWorkspace(null);
        setWarnings([]);
        setDirty(false);
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

  useEffect(() => {
    let cancelled = false;

    async function loadCommsPortraits() {
      try {
        const response = await fetch("/api/comms-portraits");
        const payload = await response.json().catch(() => ({}));
        const data = Array.isArray(payload?.data) ? (payload.data as CommsPortraitOption[]) : [];
        if (cancelled) return;
        setPortraitOptions(data);
        setPortraitCatalogStatus(typeof payload?.message === "string" ? payload.message : "");
      } catch (error) {
        if (cancelled) return;
        setPortraitOptions([]);
        setPortraitCatalogStatus(error instanceof Error ? error.message : String(error));
      }
    }

    void loadCommsPortraits();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const contacts = workspace?.contacts ?? [];
  const sourceLabel = workspace?.sourceLabel || "Local game source";

  const sortedContacts = useMemo(() => {
    return [...contacts].sort((left, right) => {
      const leftLabel = contactLabel(left).toLowerCase();
      const rightLabel = contactLabel(right).toLowerCase();
      const byLabel = leftLabel.localeCompare(rightLabel);
      if (byLabel !== 0) return byLabel;
      return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [contacts]);

  const validationIssues = useMemo(() => validateCommsContacts(contacts), [contacts]);
  const validationErrors = validationIssues.filter((issue) => issue.level === "error");

  const portraitUsage = useMemo(() => {
    const next = new Map<string, number>();
    for (const contact of contacts) {
      const key = canonicalPortraitKey(contact.portrait);
      next.set(key, (next.get(key) ?? 0) + 1);
    }
    return next;
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
  const pickerContact = portraitPicker ? contacts.find((contact) => contact.key === portraitPicker.contactKey) ?? null : null;

  const filteredPortraitOptions = useMemo(() => {
    const query = (portraitPicker?.search ?? "").trim().toLowerCase();
    return portraitOptions
      .filter((option) => {
        if (!query) return true;
        return [option.fileName, option.relativePath, option.resPath].join(" ").toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftUsage = portraitUsage.get(canonicalPortraitKey(left.resPath)) ?? 0;
        const rightUsage = portraitUsage.get(canonicalPortraitKey(right.resPath)) ?? 0;
        const leftUnused = leftUsage === 0;
        const rightUnused = rightUsage === 0;
        if (leftUnused !== rightUnused) return leftUnused ? -1 : 1;
        if (leftUsage !== rightUsage) return leftUsage - rightUsage;
        return left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: "base" });
      });
  }, [portraitOptions, portraitPicker?.search, portraitUsage]);

  function updateContact(contactKey: string, updater: (contact: CommsContactDraft) => CommsContactDraft) {
    setWorkspace((current) => {
      if (!current) return current;
      return {
        ...current,
        contacts: current.contacts.map((contact) => (contact.key === contactKey ? updater(contact) : contact)),
      };
    });
    setDirty(true);
  }

  function updatePortraitSearch(value: string) {
    setPortraitPicker((current) => (current ? { ...current, search: value } : current));
  }

  function selectPortrait(option: CommsPortraitOption) {
    if (!pickerContact) return;
    updateContact(pickerContact.key, (contact) => ({ ...contact, portrait: option.resPath }));
    setPortraitPicker(null);
  }

  async function saveWorkspace() {
    if (!workspace || saving) return;
    if (validationErrors.length) {
      setStatus({
        tone: "error",
        message: validationErrors.map((issue) => issue.message).join(" "),
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/comms/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspace }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save Comms.json into the configured game build.",
        });
        return;
      }

      setDirty(false);
      setStatus({
        tone: "success",
        message: `Saved ${contacts.length} comms contacts.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save Comms.json.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Comms Characters</h1>
          <div className="text-sm text-white/60">{sourceLabel}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/comms" className="rounded border border-cyan-300/40 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">
            Open Comms Manager
          </Link>
          <button
            className="btn-save-build disabled:cursor-default disabled:opacity-40"
            disabled={!workspace || saving || validationErrors.length > 0}
            onClick={() => void saveWorkspace()}
          >
            {saving ? "Saving..." : dirty ? "Save Character Changes To Build" : "Save Characters To Build"}
          </button>
        </div>
      </div>

      {status.message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.tone === "error"
              ? "border-red-400/30 bg-red-950/30 text-red-100"
              : status.tone === "success"
                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                : "border-white/10 bg-white/5 text-white/70"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      {warnings.length ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {warnings.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="grid gap-3">
              <div>
                <div className="label">Characters</div>
                <div className="mt-2 text-3xl font-semibold text-white">{contacts.length}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label">Portraits Reused</div>
                  <div className={`mt-2 text-2xl font-semibold ${duplicatePortraitGroups.length ? "text-amber-200" : "text-white"}`}>
                    {duplicatePortraitGroups.length}
                  </div>
                </div>
                <div>
                  <div className="label">Affected</div>
                  <div className={`mt-2 text-2xl font-semibold ${duplicateContactCount ? "text-amber-200" : "text-white"}`}>
                    {duplicateContactCount}
                  </div>
                </div>
              </div>
              {dirty ? <div className="rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">Unsaved changes</div> : null}
            </div>
          </div>

          <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-50">
            <div className="font-semibold">Duplicate Portraits</div>
            {duplicatePortraitGroups.length ? (
              <div className="mt-3 max-h-[calc(100vh-330px)] space-y-2 overflow-y-auto pr-1">
                {duplicatePortraitGroups.map((group) => (
                  <div key={group.key} className="rounded border border-amber-200/15 bg-black/20 px-3 py-2">
                    <div className="break-all font-mono text-xs text-amber-100/80">{group.path}</div>
                    <div className="mt-1 text-white/80">{duplicateSummary(group)}</div>
                  </div>
                ))}
              </div>
            ) : contacts.length ? (
              <div className="mt-2 text-emerald-100">No duplicate portraits detected.</div>
            ) : (
              <div className="mt-2 text-white/60">No contacts loaded.</div>
            )}
          </div>
        </aside>

        <div className="grid gap-3 2xl:grid-cols-2">
          {sortedContacts.map((contact) => {
            const portraitPath = resolvedPortraitPath(contact.portrait);
            const duplicateGroup = duplicatePortraitsByContactKey.get(contact.key);
            return (
              <article key={contact.key} className="grid gap-4 rounded-lg border border-white/10 bg-[#10182a] p-4 md:grid-cols-[148px,minmax(0,1fr)]">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="flex h-44 w-full items-end justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b] transition hover:border-cyan-300/45 hover:bg-cyan-300/5"
                    onClick={() => setPortraitPicker({ contactKey: contact.key, search: "" })}
                  >
                    <img
                      src={buildIconSrc(portraitPath, contact.id || "contact", contactLabel(contact), sharedDataVersion)}
                      alt={contactLabel(contact)}
                      className="h-full w-full object-contain object-bottom"
                    />
                  </button>
                  <div className="mt-2 break-all text-center font-mono text-[11px] text-white/45">{portraitFileName(portraitPath)}</div>
                </div>

                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="min-w-0 flex-1 space-y-1">
                      <div className="label">Name</div>
                      <input
                        className="input"
                        value={contact.name}
                        onChange={(event) => updateContact(contact.key, (current) => ({ ...current, name: event.target.value }))}
                        placeholder="Contact name"
                      />
                    </label>
                    {duplicateGroup ? (
                      <div className="mt-6 rounded border border-amber-200/30 bg-amber-300/15 px-2 py-1 text-xs font-semibold text-amber-100">
                        Duplicate portrait x{duplicateGroup.contacts.length}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded border border-white/10 bg-black/15 px-3 py-2">
                    <div className="label">Contact ID</div>
                    <div className="mt-1 break-all font-mono text-xs text-white/55">{contact.id || "missing_id"}</div>
                  </div>

                  <label className="block space-y-1">
                    <div className="label">Greeting</div>
                    <textarea
                      className="input min-h-20"
                      value={contact.greeting}
                      onChange={(event) => updateContact(contact.key, (current) => ({ ...current, greeting: event.target.value }))}
                      placeholder="Greeting"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="label">Meta Notes</div>
                    <textarea
                      className="input min-h-24"
                      value={contact.notes}
                      onChange={(event) => updateContact(contact.key, (current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Meta notes"
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {portraitPicker && pickerContact ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg border border-white/15 bg-[#0f1728] shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <div className="text-xl font-semibold text-white">Portraits</div>
                <div className="mt-1 text-sm text-white/55">{contactLabel(pickerContact)}</div>
              </div>
              <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={() => setPortraitPicker(null)}>
                Close
              </button>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-3">
                <input
                  className="input"
                  value={portraitPicker.search}
                  onChange={(event) => updatePortraitSearch(event.target.value)}
                  placeholder="Search portraits"
                />
                <div className="rounded border border-white/10 bg-white/5 p-3 text-sm text-white/65">
                  <div>{portraitOptions.length} portrait options</div>
                  <div>{portraitOptions.filter((option) => (portraitUsage.get(canonicalPortraitKey(option.resPath)) ?? 0) === 0).length} unused</div>
                  {portraitCatalogStatus ? <div className="mt-2 text-white/50">{portraitCatalogStatus}</div> : null}
                </div>
              </div>

              <div className="max-h-[66vh] overflow-y-auto pr-2">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {filteredPortraitOptions.map((option) => {
                    const usage = portraitUsage.get(canonicalPortraitKey(option.resPath)) ?? 0;
                    const isSelected = canonicalPortraitKey(pickerContact.portrait) === canonicalPortraitKey(option.resPath);
                    return (
                      <button
                        key={option.resPath}
                        type="button"
                        className={`rounded-lg border p-2 text-left transition ${
                          isSelected
                            ? "border-cyan-300/70 bg-cyan-300/10"
                            : usage === 0
                              ? "border-emerald-300/30 bg-emerald-400/10 hover:border-emerald-200/60"
                              : "border-white/10 bg-white/5 hover:border-cyan-300/40"
                        }`}
                        onClick={() => selectPortrait(option)}
                      >
                        <div className="flex h-36 items-end justify-center overflow-hidden rounded bg-[#06101b]">
                          <img
                            src={buildIconSrc(option.resPath, option.relativePath, option.fileName, sharedDataVersion)}
                            alt={option.fileName}
                            className="h-full w-full object-contain object-bottom"
                          />
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-white/70">{option.fileName}</div>
                        <div className={`mt-1 text-xs ${usage === 0 ? "text-emerald-100" : "text-amber-100"}`}>
                          {usage === 0 ? "Unused" : `Used x${usage}`}
                          {isSelected ? " · Selected" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
