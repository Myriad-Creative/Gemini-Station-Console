"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DismissibleStatusBanner,
  StatusBanner,
  useDismissibleStatusCountdown,
  type TimedStatusState,
} from "@components/ability-manager/common";
import { buildIconSrc } from "@lib/icon-src";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { CommsContactDraft, CommsContactValidationIssue, CommsLabWorkspace } from "@lib/comms-manager/types";
import {
  DEFAULT_COMMS_PORTRAIT,
  cloneCommsContact,
  createBlankCommsContact,
  createBlankCommsWorkspace,
  deleteCommsContactAt,
  duplicateCommsIdMap,
  generateCommsIdFromName,
  importCommsWorkspace,
  insertCommsContactAfter,
  normalizeCommsIdValue,
  resolvedPortraitPath,
  stringifyCommsWorkspace,
  stringifySingleCommsContact,
  summarizeCommsWorkspace,
  updateCommsContactAt,
  validateCommsContacts,
} from "@lib/comms-manager/utils";

type CommsPortraitOption = {
  fileName: string;
  relativePath: string;
  resPath: string;
};

const GENERATED_CONTACT_ID_PATTERN = /^contact_\d+$/;

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card space-y-4">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-sm text-white/55">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

function DialogLineEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="label">Dialog Lines</div>
        <button
          type="button"
          className="rounded border border-white/10 px-2 py-1 text-xs text-white/75 hover:bg-white/5"
          onClick={() => onChange([...values, ""])}
        >
          Add Line
        </button>
      </div>
      {values.length ? (
        <div className="space-y-2">
          {values.map((value, index) => (
            <div key={`dialog-${index}`} className="flex gap-2">
              <textarea
                className="input min-h-20"
                value={value}
                placeholder="Contact dialog line"
                onChange={(event) => onChange(values.map((current, currentIndex) => (currentIndex === index ? event.target.value : current)))}
              />
              <button
                type="button"
                className="rounded border border-red-400/20 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
          No dialog lines yet. Add lines if this contact has additional comms text beyond the greeting.
        </div>
      )}
    </div>
  );
}

export default function CommsManagerApp() {
  const workspaceRef = useRef<CommsLabWorkspace | null>(null);
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<CommsLabWorkspace | null>(null);
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [portraitOptions, setPortraitOptions] = useState<CommsPortraitOption[]>([]);
  const [portraitSearch, setPortraitSearch] = useState("");
  const [portraitCatalogStatus, setPortraitCatalogStatus] = useState("");
  const [manuallyEditedContactIds, setManuallyEditedContactIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<TimedStatusState>({
    tone: "neutral",
    message: "Comms Manager reads Comms.json directly from the active local game root in Settings.",
    dismissAfterMs: null,
  });
  const clearStatus = () =>
    setStatus({
      tone: "neutral",
      message: "Comms Manager reads Comms.json directly from the active local game root in Settings.",
      dismissAfterMs: null,
    });
  const statusCountdown = useDismissibleStatusCountdown(status, clearStatus);

  const validation = useMemo(() => validateCommsContacts(workspace?.contacts ?? []), [workspace]);
  const validationByContactKey = useMemo(() => {
    const next = new Map<string, CommsContactValidationIssue[]>();
    for (const issue of validation) {
      const current = next.get(issue.contactKey) ?? [];
      current.push(issue);
      next.set(issue.contactKey, current);
    }
    return next;
  }, [validation]);
  const duplicateIds = useMemo(() => duplicateCommsIdMap(workspace?.contacts ?? []), [workspace]);
  const summary = useMemo(() => summarizeCommsWorkspace(workspace, validation), [workspace, validation]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (workspace?.contacts ?? [])
      .filter((contact) => {
        if (!query) return true;
        return [contact.id, contact.name, contact.greeting, contact.notes, ...contact.dialog].join(" ").toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftLabel = (left.name || left.id || "").trim().toLowerCase();
        const rightLabel = (right.name || right.id || "").trim().toLowerCase();
        const byLabel = leftLabel.localeCompare(rightLabel);
        if (byLabel !== 0) return byLabel;
        return left.id.trim().localeCompare(right.id.trim(), undefined, { numeric: true, sensitivity: "base" });
      });
  }, [search, workspace]);

  useEffect(() => {
    const contacts = workspace?.contacts ?? [];
    if (!contacts.length) {
      if (selectedContactKey !== null) setSelectedContactKey(null);
      return;
    }

    if (!selectedContactKey || !contacts.some((contact) => contact.key === selectedContactKey)) {
      setSelectedContactKey(filteredContacts[0]?.key ?? contacts[0]?.key ?? null);
      return;
    }

    if (filteredContacts.length && !filteredContacts.some((contact) => contact.key === selectedContactKey)) {
      setSelectedContactKey(filteredContacts[0]?.key ?? contacts[0]?.key ?? null);
    }
  }, [filteredContacts, selectedContactKey, workspace]);

  useEffect(() => {
    let cancelled = false;
    async function loadSharedWorkspace() {
      try {
        const response = await fetch("/api/settings/data/source?kind=comms");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled && workspaceRef.current?.sourceType === "uploaded") {
            setWorkspace(null);
            setSelectedContactKey(null);
            setStatus({
              tone: "neutral",
              message: "No Comms.json was found under the active local game root. Set a valid Gemini Station folder in Settings first.",
            });
          }
          return;
        }
        if (cancelled) return;
        if (workspaceRef.current && workspaceRef.current.sourceType !== "uploaded") return;
        importText(payload.text, payload.sourceLabel || "Local game source", "uploaded");
      } catch {
        // Local game source may not be configured yet.
      }
    }

    void loadSharedWorkspace();
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
        if (!cancelled) {
          setPortraitOptions([]);
          setPortraitCatalogStatus(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadCommsPortraits();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const selectedContact = useMemo(() => {
    const contacts = workspace?.contacts ?? [];
    return contacts.find((contact) => contact.key === selectedContactKey) ?? filteredContacts[0] ?? contacts[0] ?? null;
  }, [filteredContacts, selectedContactKey, workspace]);

  const selectedIssues = selectedContact ? validationByContactKey.get(selectedContact.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const selectedDuplicateKeys =
    selectedContact && selectedContact.id.trim()
      ? (duplicateIds.get(selectedContact.id.trim()) ?? []).filter((key) => key !== selectedContact.key)
      : [];
  const workspaceHasErrors = summary.errorCount > 0;
  const filteredPortraitOptions = useMemo(() => {
    const query = portraitSearch.trim().toLowerCase();
    if (!query) return portraitOptions;
    return portraitOptions.filter((option) =>
      [option.fileName, option.relativePath, option.resPath].join(" ").toLowerCase().includes(query),
    );
  }, [portraitOptions, portraitSearch]);

  const workspaceSourceLabel = useMemo(() => {
    if (!workspace) return "";
    if (workspace.sourceType === "blank") return "Manual workspace";
    return `${workspace.sourceLabel ?? "Local game source"} · ${workspace.strictJsonValid ? "strict JSON" : "tolerant JSON"}`;
  }, [workspace]);

  function updateSelectedContact(updater: (current: CommsContactDraft) => CommsContactDraft) {
    if (!workspace || !selectedContact) return;
    setWorkspace(updateCommsContactAt(workspace, selectedContact.key, updater));
  }

  function importText(text: string, sourceLabel: string | null, sourceType: "uploaded" | "pasted") {
    try {
      const result = importCommsWorkspace(text, sourceLabel, sourceType);
      setWorkspace(result.workspace);
      setSelectedContactKey(result.workspace.contacts[0]?.key ?? null);
      setManuallyEditedContactIds(new Set());
      setStatus({
        tone: "success",
        message: result.warnings.length
          ? `Imported ${result.workspace.contacts.length} comms contact(s). ${result.warnings.join(" ")}`
          : `Imported ${result.workspace.contacts.length} comms contact(s).`,
        dismissAfterMs: 7000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  function startBlankWorkspace() {
    const nextWorkspace = createBlankCommsWorkspace();
    setWorkspace(nextWorkspace);
    setSelectedContactKey(nextWorkspace.contacts[0]?.key ?? null);
    setManuallyEditedContactIds(new Set());
    setStatus({
      tone: "success",
      message: "Started a blank Comms Manager workspace.",
      dismissAfterMs: 4000,
    });
  }

  function addBlankContact() {
    if (!workspace) {
      startBlankWorkspace();
      return;
    }

    const nextContact = createBlankCommsContact(workspace.contacts.map((contact) => contact.id));
    const nextWorkspace = insertCommsContactAfter(workspace, selectedContact?.key ?? null, nextContact);
    setWorkspace(nextWorkspace);
    setSelectedContactKey(nextContact.key);
    setStatus({
      tone: "success",
      message: `Created contact "${nextContact.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function cloneSelected() {
    if (!workspace || !selectedContact) return;
    const nextContact = cloneCommsContact(selectedContact, workspace.contacts.map((contact) => contact.id));
    const nextWorkspace = insertCommsContactAfter(workspace, selectedContact.key, nextContact);
    setWorkspace(nextWorkspace);
    setSelectedContactKey(nextContact.key);
    setStatus({
      tone: "success",
      message: `Cloned contact "${selectedContact.id}" into "${nextContact.id}".`,
      dismissAfterMs: 4000,
    });
  }

  function deleteSelected() {
    if (!workspace || !selectedContact) return;
    const nextWorkspace = deleteCommsContactAt(workspace, selectedContact.key);
    setWorkspace(nextWorkspace);
    setSelectedContactKey(nextWorkspace.contacts[0]?.key ?? null);
    setManuallyEditedContactIds((current) => {
      const next = new Set(current);
      next.delete(selectedContact.key);
      return next;
    });
    setStatus({
      tone: "success",
      message: `Deleted contact "${selectedContact.id || selectedContact.name || "untitled"}".`,
      dismissAfterMs: 4000,
    });
  }

  async function handleUpdatedJsonCopy() {
    if (!workspace) return;
    const copied = await copyToClipboard(stringifyCommsWorkspace(workspace));
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the updated comms JSON to the clipboard." : "Clipboard copy failed in this browser context.",
      dismissAfterMs: copied ? 7000 : null,
    });
  }

  async function handleSaveAllCommsToBuild() {
    if (!workspace) return;
    if (workspaceHasErrors) {
      setStatus({
        tone: "error",
        message: "Fix comms validation errors before saving Comms.json into the configured game build.",
        dismissAfterMs: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/comms/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setStatus({
          tone: "error",
          message: payload?.error || "Could not save Comms.json into the configured game build.",
          dismissAfterMs: null,
        });
        return;
      }

      setStatus({
        tone: "success",
        message: `Saved all ${workspace.contacts.length} comms contacts into the live Comms.json file.`,
        dismissAfterMs: 10000,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
        dismissAfterMs: null,
      });
    }
  }

  async function handleCurrentContactCopy() {
    if (!selectedContact || selectedHasErrors) return;
    const copied = await copyToClipboard(stringifySingleCommsContact(selectedContact));
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? `Copied contact "${selectedContact.id}" JSON to the clipboard.` : "Clipboard copy failed in this browser context.",
      dismissAfterMs: copied ? 5000 : null,
    });
  }

  function handleDownload() {
    if (!workspace || workspaceHasErrors) return;
    downloadTextFile("comms.json", stringifyCommsWorkspace(workspace));
    setStatus({
      tone: "success",
      message: "Downloaded updated comms.json.",
      dismissAfterMs: 7000,
    });
  }

  const resolvedPortrait = selectedContact ? resolvedPortraitPath(selectedContact.portrait) : DEFAULT_COMMS_PORTRAIT;
  const portraitSrc = selectedContact
    ? buildIconSrc(resolvedPortrait, selectedContact.id || "contact", selectedContact.name || "Contact", sharedDataVersion)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="page-title mb-1">Comms Manager</h1>
          <p className="text-sm text-white/70">
            Manage contact IDs, portraits, greetings, dialog lines, and authoring notes for the comms directory JSON.
          </p>
        </div>

        <button
          className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40"
          disabled={!workspace || workspaceHasErrors}
          onClick={() => void handleSaveAllCommsToBuild()}
        >
          Save All Comms To Build
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn disabled:cursor-default disabled:opacity-40"
          disabled={!workspace || workspaceHasErrors}
          onClick={handleDownload}
        >
          Download Updated comms.json
        </button>
        <button
          className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
          disabled={!workspace || workspaceHasErrors}
          onClick={() => void handleUpdatedJsonCopy()}
        >
          Copy Updated JSON
        </button>
      </div>

      {status.tone === "neutral" ? (
        <StatusBanner tone={status.tone} message={status.message} />
      ) : (
        <DismissibleStatusBanner tone={status.tone} message={status.message} onDismiss={clearStatus} countdownSeconds={statusCountdown} />
      )}

      {workspace ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Contacts" value={summary.totalContacts} />
          <SummaryCard label="Dialog Lines" value={summary.dialogLineCount} />
          <SummaryCard label="Notes" value={summary.notedContacts} />
          <SummaryCard label="Duplicate IDs" value={summary.duplicateIdCount} accent={summary.duplicateIdCount ? "text-yellow-200" : undefined} />
          <SummaryCard label="Errors / Warnings" value={`${summary.errorCount} / ${summary.warningCount}`} accent={summary.errorCount ? "text-red-200" : undefined} />
        </div>
      ) : null}

      {!workspace ? (
        <>
          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">What Comms Manager Includes</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Create, clone, edit, delete, and browse comms contacts with unique contact ID validation.</div>
              <div>Manage authoring-only notes under <code>meta.notes</code> while keeping the contact ID as the primary key.</div>
              <div>Preview portraits, greetings, and dialog lines, with a default portrait path applied whenever the portrait field is blank.</div>
              <div>Download the updated JSON, copy the whole file JSON, or copy only the current contact entry.</div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Local Game Root Required</div>
            <div className="text-sm leading-6 text-white/65">
              Comms Manager no longer loads separate comms JSON files. Set the Gemini Station local game root in Settings and the editor will
              automatically read `data/database/comms/Comms.json` from that folder.
            </div>
            <div>
              <Link href="/settings" className="btn">
                Open Settings
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="card h-fit space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Contact Library</div>
                <div className="mt-1 text-sm text-white/55">{workspaceSourceLabel}</div>
              </div>
              <button className="btn shrink-0" onClick={addBlankContact}>
                New Contact
              </button>
            </div>

            <div>
              <div className="label">Search Contacts</div>
              <input
                className="input mt-1"
                value={search}
                placeholder="Search ID, name, greeting, notes, or dialog..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filteredContacts.length ? (
                filteredContacts.map((contact) => {
                  const issues = validationByContactKey.get(contact.key) ?? [];
                  const hasErrors = issues.some((issue) => issue.level === "error");
                  const selected = selectedContact?.key === contact.key;
                  const isDuplicate = duplicateIds.has(contact.id.trim());

                  return (
                    <button
                      key={contact.key}
                      type="button"
                      onClick={() => setSelectedContactKey(contact.key)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                          : "border-white/10 bg-black/20 hover:border-cyan-300/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="truncate text-base font-semibold text-white">{contact.name || contact.id || "Untitled Contact"}</div>
                      <div className="mt-1 truncate text-xs text-white/50">{contact.id || "Missing ID"}</div>
                      {contact.greeting ? <div className="mt-1 line-clamp-2 text-xs text-white/45">{contact.greeting}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="badge">{contact.dialog.length} dialog line{contact.dialog.length === 1 ? "" : "s"}</span>
                        {contact.notes.trim() ? <span className="badge">Notes</span> : null}
                        {isDuplicate ? <span className="badge border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Duplicate ID</span> : null}
                        {hasErrors ? <span className="badge border border-red-300/20 bg-red-300/10 text-red-100">Needs Fixes</span> : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                  No contacts match the current search.
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            {selectedContact ? (
              <>
                <div className="card space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-2xl font-semibold text-white">{selectedContact.name || selectedContact.id || "Untitled Contact"}</div>
                      <div className="mt-1 text-sm text-white/55">
                        Editing contact {workspace.contacts.findIndex((contact) => contact.key === selectedContact.key) + 1} of {workspace.contacts.length}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn" onClick={cloneSelected}>
                        Clone Contact
                      </button>
                      <button
                        className="rounded border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40"
                        disabled={selectedHasErrors}
                        onClick={() => void handleCurrentContactCopy()}
                      >
                        Copy Current Contact JSON
                      </button>
                      <button
                        className="rounded border border-red-400/20 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10"
                        onClick={deleteSelected}
                      >
                        Delete Contact
                      </button>
                    </div>
                  </div>

                  {selectedDuplicateKeys.length ? (
                    <div className="rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      This contact ID already exists on {selectedDuplicateKeys.length} other contact{selectedDuplicateKeys.length === 1 ? "" : "s"} in the
                      workspace. Change the ID before copying or downloading JSON.
                    </div>
                  ) : null}

                  {selectedIssues.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {selectedIssues.map((issue, index) => (
                        <div
                          key={`${issue.field}-${index}`}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            issue.level === "error"
                              ? "border-red-400/25 bg-red-400/10 text-red-100"
                              : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
                          }`}
                        >
                          <span className="font-medium">{issue.field}:</span> {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
                  <Section title="Identity" description="Core comms contact fields exported into the keyed object map.">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="label">Contact ID</div>
                        <input
                          className={`input mt-1 ${selectedDuplicateKeys.length ? "border-red-300/35" : ""}`}
                          value={selectedContact.id}
                          placeholder="ava_ray"
                          onChange={(event) => {
                            const nextId = normalizeCommsIdValue(event.target.value);
                            setManuallyEditedContactIds((current) => new Set(current).add(selectedContact.key));
                            updateSelectedContact((current) => ({ ...current, id: nextId }));
                          }}
                        />
                        <div className="mt-2 text-xs text-white/50">Manual IDs are normalized to lowercase underscores.</div>
                      </div>
                      <div>
                        <div className="label">Name</div>
                        <input
                          className="input mt-1"
                          value={selectedContact.name}
                          placeholder="Ava Ray"
                          onChange={(event) =>
                            updateSelectedContact((current) => {
                              const nextName = event.target.value;
                              const otherIds = (workspace?.contacts ?? [])
                                .filter((entry) => entry.key !== current.key)
                                .map((entry) => entry.id);
                              const currentAutoId = generateCommsIdFromName(current.name, otherIds);
                              const nextAutoId = generateCommsIdFromName(nextName, otherIds);
                              const currentId = current.id.trim();
                              const idWasManuallyEdited = manuallyEditedContactIds.has(current.key);
                              const isGeneratedPlaceholder =
                                current.sourceIndex === -1 && GENERATED_CONTACT_ID_PATTERN.test(currentId);
                              const shouldAutoUpdateId =
                                !currentId || (!idWasManuallyEdited && (currentId === currentAutoId || isGeneratedPlaceholder));

                              return {
                                ...current,
                                name: nextName,
                                id: shouldAutoUpdateId ? nextAutoId : current.id,
                              };
                            })
                          }
                        />
                        <div className="mt-2 text-xs text-white/50">
                          Entering a name auto-generates a lowercase ID with underscores and no special characters. You can still edit the ID manually.
                        </div>
                      </div>
                      <div className="lg:col-span-2">
                        <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="label">Portrait</div>
                              <div className="mt-1 text-xs text-white/45">
                                Choose from <code>res://assets/comms/</code>, or edit the path directly if needed.
                              </div>
                            </div>
                            <div className="shrink-0 rounded border border-white/10 px-3 py-2 text-xs text-white/55">
                              {portraitOptions.length} portrait option{portraitOptions.length === 1 ? "" : "s"}
                            </div>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)]">
                            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#06101b]">
                              {portraitSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={portraitSrc}
                                  alt={selectedContact.name || selectedContact.id || "Contact portrait"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="px-3 text-center text-xs text-white/35">No portrait</div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <input
                                className="input"
                                value={selectedContact.portrait}
                                placeholder={DEFAULT_COMMS_PORTRAIT}
                                onChange={(event) => updateSelectedContact((current) => ({ ...current, portrait: event.target.value }))}
                              />
                              <input
                                className="input"
                                value={portraitSearch}
                                placeholder="Search comms portraits by file name or path..."
                                onChange={(event) => setPortraitSearch(event.target.value)}
                              />
                              <div className="text-xs text-white/50">
                                If blank, Comms Manager exports and previews the default portrait: <code>{DEFAULT_COMMS_PORTRAIT}</code>
                              </div>
                              {portraitCatalogStatus ? (
                                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/55">{portraitCatalogStatus}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="max-h-80 overflow-y-auto pr-1">
                            {filteredPortraitOptions.length ? (
                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {filteredPortraitOptions.map((option) => {
                                  const isSelected = resolvedPortraitPath(selectedContact.portrait) === option.resPath;
                                  return (
                                    <button
                                      key={option.resPath}
                                      type="button"
                                      className={`rounded-xl border p-2 text-left transition ${
                                        isSelected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/20 hover:bg-white/5"
                                      }`}
                                      onClick={() => updateSelectedContact((current) => ({ ...current, portrait: option.resPath }))}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#06101b]">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={buildIconSrc(option.resPath, option.fileName, option.fileName, sharedDataVersion)}
                                            alt={option.fileName}
                                            className="h-full w-full object-cover"
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-medium text-white">{option.fileName}</div>
                                          <div className="mt-1 truncate font-mono text-xs text-white/45">{option.relativePath}</div>
                                          {isSelected ? <div className="mt-2 text-xs font-medium text-cyan-100">Selected</div> : null}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-white/45">
                                No comms portraits matched the current search.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="lg:col-span-2">
                        <div className="label">Greeting</div>
                        <input
                          className="input mt-1"
                          value={selectedContact.greeting}
                          placeholder="Well?"
                          onChange={(event) => updateSelectedContact((current) => ({ ...current, greeting: event.target.value }))}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <div className="label">Meta Notes</div>
                        <textarea
                          className="input mt-1 min-h-24"
                          value={selectedContact.notes}
                          placeholder="Authoring notes about where this contact is used."
                          onChange={(event) => updateSelectedContact((current) => ({ ...current, notes: event.target.value }))}
                        />
                      </div>
                    </div>
                  </Section>

                  <Section title="Preview">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start gap-4">
                        <div className="h-28 w-28 overflow-hidden rounded-2xl border border-white/10 bg-[#06101b]">
                          {portraitSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={portraitSrc} alt={selectedContact.name || selectedContact.id || "Contact"} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="text-lg font-semibold text-white">{selectedContact.name || selectedContact.id || "Unnamed Contact"}</div>
                          <div className="text-sm text-white/80">{selectedContact.greeting || "[No greeting set]"}</div>
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>

                <Section title="Dialog" description="Manage additional dialog lines after the contact greeting. Blank entries are preserved if you keep them in the list.">
                  <DialogLineEditor
                    values={selectedContact.dialog}
                    onChange={(next) => updateSelectedContact((current) => ({ ...current, dialog: next }))}
                  />
                </Section>

                <Section title="Export Preview" description="Current contact JSON entry preview using the keyed object-map format.">
                  <pre className="max-h-[50vh] overflow-auto rounded bg-black/30 p-4 text-xs text-white/80">{stringifySingleCommsContact(selectedContact)}</pre>
                </Section>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
