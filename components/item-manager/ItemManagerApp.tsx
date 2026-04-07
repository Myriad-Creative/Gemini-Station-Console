"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RARITY_COLOR } from "@lib/constants";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { ItemDraft, ItemManagerWorkspace, ItemValidationIssue } from "@lib/item-manager/types";
import {
  cloneItemDraft,
  createBlankItem,
  createBlankItemWorkspace,
  deleteItemDraftAt,
  duplicateItemIdMap,
  importItemWorkspace,
  insertItemDraftAfter,
  normalizeComparableItemId,
  resolvedItemIconPath,
  stringifyItemWorkspace,
  stringifySingleItem,
  summarizeItemWorkspace,
  updateItemDraftAt,
  validateItemDrafts,
} from "@lib/item-manager/utils";

type StatusTone = "neutral" | "success" | "error";

function buildIconSrc(icon: string | undefined, id: string, name: string) {
  const params = new URLSearchParams({
    res: icon || "icon_lootbox.png",
    id,
    name,
  });
  return `/api/icon?${params.toString()}`;
}

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

function mergeStatusMessage(existing: string, message: string) {
  return existing ? `${existing} ${message}` : message;
}

export default function ItemManagerApp() {
  const workspaceRef = useRef<ItemManagerWorkspace | null>(null);
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [workspace, setWorkspace] = useState<ItemManagerWorkspace | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState<{ tone: StatusTone; message: string }>({
    tone: "neutral",
    message: "Items Manager reads items.json directly from the active local game root in Settings.",
  });

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const validation = useMemo(() => validateItemDrafts(workspace?.items ?? []), [workspace]);
  const validationByItemKey = useMemo(() => {
    const next = new Map<string, ItemValidationIssue[]>();
    for (const issue of validation) {
      const current = next.get(issue.itemKey) ?? [];
      current.push(issue);
      next.set(issue.itemKey, current);
    }
    return next;
  }, [validation]);
  const duplicateIds = useMemo(() => duplicateItemIdMap(workspace?.items ?? []), [workspace]);
  const summary = useMemo(() => summarizeItemWorkspace(workspace, validation), [workspace, validation]);

  const rarityOptions = useMemo(() => {
    return Array.from(new Set((workspace?.items ?? []).map((item) => item.rarity.trim()).filter(Boolean))).sort((left, right) => Number(left) - Number(right));
  }, [workspace]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set((workspace?.items ?? []).map((item) => item.type.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [workspace]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (workspace?.items ?? [])
      .filter((item) => {
        if (!query) return true;
        return [item.id, item.name, item.description, item.type].join(" ").toLowerCase().includes(query);
      })
      .filter((item) => (rarityFilter ? item.rarity.trim() === rarityFilter : true))
      .filter((item) => (typeFilter ? item.type.trim() === typeFilter : true));
  }, [rarityFilter, search, typeFilter, workspace]);

  useEffect(() => {
    const items = workspace?.items ?? [];
    if (!items.length) {
      if (selectedItemKey !== null) setSelectedItemKey(null);
      return;
    }

    if (!selectedItemKey || !items.some((item) => item.key === selectedItemKey)) {
      setSelectedItemKey(filteredItems[0]?.key ?? items[0]?.key ?? null);
      return;
    }

    if (filteredItems.length && !filteredItems.some((item) => item.key === selectedItemKey)) {
      setSelectedItemKey(filteredItems[0]?.key ?? items[0]?.key ?? null);
    }
  }, [filteredItems, selectedItemKey, workspace]);

  useEffect(() => {
    let cancelled = false;

    async function loadSharedWorkspace() {
      try {
        const response = await fetch("/api/settings/data/source?kind=items");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.text) {
          if (!cancelled && workspaceRef.current?.sourceType === "local") {
            setWorkspace(null);
            setSelectedItemKey(null);
            setStatus({
              tone: "neutral",
              message: "No items.json was found under the active local game root. Set a valid Gemini Station folder in Settings first.",
            });
          }
          return;
        }

        if (cancelled) return;

        const result = importItemWorkspace(payload.text, payload.sourceLabel || "Local game source", "local");
        setWorkspace(result.workspace);
        setSelectedItemKey(result.workspace.items[0]?.key ?? null);
        setStatus({
          tone: "success",
          message: result.warnings.length
            ? mergeStatusMessage("Loaded items.json from the active local game root.", result.warnings.join(" "))
            : "Loaded items.json from the active local game root.",
        });
      } catch {
        if (cancelled) return;
        setWorkspace(null);
        setSelectedItemKey(null);
        setStatus({
          tone: "error",
          message: "Items Manager could not read items.json from the current local game root.",
        });
      }
    }

    void loadSharedWorkspace();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const selectedItem = useMemo(() => {
    const items = workspace?.items ?? [];
    return items.find((item) => item.key === selectedItemKey) ?? filteredItems[0] ?? items[0] ?? null;
  }, [filteredItems, selectedItemKey, workspace]);

  const selectedIssues = selectedItem ? validationByItemKey.get(selectedItem.key) ?? [] : [];
  const selectedHasErrors = selectedIssues.some((issue) => issue.level === "error");
  const selectedDuplicateKeys =
    selectedItem && normalizeComparableItemId(selectedItem.id)
      ? (duplicateIds.get(normalizeComparableItemId(selectedItem.id)) ?? []).filter((key) => key !== selectedItem.key)
      : [];
  const fullJson = useMemo(() => (workspace ? stringifyItemWorkspace(workspace) : "[]"), [workspace]);
  const selectedJson = useMemo(() => (selectedItem ? stringifySingleItem(selectedItem) : ""), [selectedItem]);
  const workspaceSourceLabel = useMemo(() => {
    if (!workspace) return "";
    if (workspace.sourceType === "blank") return "Manual workspace";
    return `${workspace.sourceLabel ?? "Local game source"} · ${workspace.strictJsonValid ? "strict JSON" : "tolerant JSON"}`;
  }, [workspace]);

  function updateSelectedItem(updater: (current: ItemDraft) => ItemDraft) {
    if (!workspace || !selectedItem) return;
    setWorkspace(updateItemDraftAt(workspace, selectedItem.key, updater));
  }

  function addBlankItem() {
    const existingIds = (workspace?.items ?? []).map((item) => item.id);
    const nextDraft = createBlankItem(existingIds);
    const baseWorkspace = workspace ?? createBlankItemWorkspace();
    const nextWorkspace = insertItemDraftAfter(baseWorkspace, selectedItem?.key ?? null, nextDraft);
    setWorkspace(nextWorkspace);
    setSelectedItemKey(nextDraft.key);
    setStatus({
      tone: "success",
      message: "Added a new blank item draft to the workspace.",
    });
  }

  function cloneSelectedItem() {
    if (!workspace || !selectedItem) return;
    const nextDraft = cloneItemDraft(selectedItem, workspace.items.map((item) => item.id));
    const nextWorkspace = insertItemDraftAfter(workspace, selectedItem.key, nextDraft);
    setWorkspace(nextWorkspace);
    setSelectedItemKey(nextDraft.key);
    setStatus({
      tone: "success",
      message: `Cloned ${selectedItem.name || selectedItem.id || "the selected item"} into a new draft.`,
    });
  }

  function deleteSelectedItem() {
    if (!workspace || !selectedItem) return;
    const nextWorkspace = deleteItemDraftAt(workspace, selectedItem.key);
    setWorkspace(nextWorkspace);
    setSelectedItemKey(nextWorkspace.items[0]?.key ?? null);
    setStatus({
      tone: "success",
      message: `Deleted ${selectedItem.name || selectedItem.id || "the selected item"} from the workspace.`,
    });
  }

  async function handleCopyUpdatedJson() {
    if (!workspace) return;
    const copied = await copyToClipboard(fullJson);
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the updated items.json to the clipboard." : "Copy failed. Your browser blocked clipboard access.",
    });
  }

  async function handleCopyCurrentItem() {
    if (!selectedItem) return;
    const copied = await copyToClipboard(selectedJson);
    setStatus({
      tone: copied ? "success" : "error",
      message: copied ? "Copied the current item JSON to the clipboard." : "Copy failed. Your browser blocked clipboard access.",
    });
  }

  const previewIcon = buildIconSrc(selectedItem ? resolvedItemIconPath(selectedItem.icon) : "icon_lootbox.png", selectedItem?.id || "item", selectedItem?.name || "Item");
  const titleColor = selectedItem ? RARITY_COLOR[Number(selectedItem.rarity)] || "#FFFFFF" : "#FFFFFF";

  return (
    <div className="space-y-6">
      {!workspace ? (
        <>
          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">What Items Manager Includes</div>
            <div className="space-y-3 text-sm text-white/70">
              <div>Edit, create, clone, and delete item drafts while preserving unmodeled runtime JSON.</div>
              <div>Set core authoring fields like item ID, name, rarity, image, and type with live duplicate-ID validation.</div>
              <div>Preview item icons with the standard lootbox fallback whenever the icon field is blank.</div>
              <div>Download the updated items JSON, copy the whole file JSON, or copy only the current item entry.</div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="text-xl font-semibold text-white">Local Game Root Required</div>
            <div className="text-sm leading-6 text-white/65">
              Items Manager reads <code>data/database/items/items.json</code> directly from the active Gemini Station local game root.
              Set that folder in Settings and this editor will auto-load the runtime item data.
            </div>
            <div>
              <Link href="/settings" className="btn">
                Open Settings
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard label="Items" value={summary.totalItems} />
            <SummaryCard label="Typed Items" value={summary.typedItems} />
            <SummaryCard label="Duplicate IDs" value={summary.duplicateIdCount} accent={summary.duplicateIdCount ? "text-red-300" : "text-white"} />
            <SummaryCard label="Warnings / Errors" value={`${summary.warningCount} / ${summary.errorCount}`} accent={summary.errorCount ? "text-red-300" : "text-white"} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-6">
              <div className="card h-fit space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold text-white">Item Library</div>
                    <div className="mt-1 text-sm text-white/55">{workspaceSourceLabel}</div>
                  </div>
                  <button className="btn shrink-0" onClick={addBlankItem}>
                    New Item
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="label">Search</div>
                    <input
                      className="input mt-1"
                      value={search}
                      placeholder="Search ID, name, description, or type..."
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>

                  <div>
                    <div className="label">Rarity</div>
                    <select className="select mt-1 w-full" value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)}>
                      <option value="">All rarities</option>
                      {rarityOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="label">Type</div>
                    <select className="select mt-1 w-full" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                      <option value="">All types</option>
                      {typeOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                  {filteredItems.length ? (
                    filteredItems.map((item) => {
                      const issues = validationByItemKey.get(item.key) ?? [];
                      const hasErrors = issues.some((issue) => issue.level === "error");
                      const selected = selectedItem?.key === item.key;
                      const isDuplicate = duplicateIds.has(normalizeComparableItemId(item.id));

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedItemKey(item.key)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
                              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <img
                              src={buildIconSrc(resolvedItemIconPath(item.icon), item.id || "item", item.name || item.id)}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-[#07111d] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-semibold text-white">{item.name || "Unnamed Item"}</div>
                              <div className="mt-1 truncate font-mono text-xs text-white/55">{item.id || "missing-id"}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/55">
                                <span className="rounded bg-white/5 px-2 py-1">Rarity {item.rarity || "?"}</span>
                                {item.type.trim() ? <span className="rounded bg-white/5 px-2 py-1">{item.type}</span> : null}
                                {isDuplicate ? <span className="rounded bg-red-400/15 px-2 py-1 text-red-100">Duplicate ID</span> : null}
                                {hasErrors ? <span className="rounded bg-red-400/15 px-2 py-1 text-red-100">Errors</span> : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                      No items match the current search or filters.
                    </div>
                  )}
                </div>
              </div>

              <div className="card space-y-4">
                <div className="text-lg font-semibold text-white">Validation</div>
                {selectedItem ? (
                  selectedIssues.length ? (
                    <div className="space-y-3">
                      {selectedIssues.map((issue, index) => (
                        <div
                          key={`${issue.field}-${index}`}
                          className={`rounded-xl border px-3 py-3 ${
                            issue.level === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100"
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.2em]">{issue.level}</div>
                          <div className="mt-2 text-sm">{issue.message}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-4 text-sm text-emerald-100">
                      The selected item currently passes validation.
                    </div>
                  )
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/45">
                    Select an item to review validation.
                  </div>
                )}
              </div>
            </aside>

            <div className="space-y-6">
              {selectedItem ? (
                <>
                  <Section
                    title="Item Editor"
                    description="Edit the item fields you care about directly and preserve the rest of the runtime shape through Additional Runtime JSON."
                  >
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={cloneSelectedItem}>
                        Clone Item
                      </button>
                      <button
                        className="rounded border border-red-400/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10"
                        onClick={deleteSelectedItem}
                      >
                        Delete Item
                      </button>
                      <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={handleCopyCurrentItem}>
                        Copy Current Item JSON
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="label">Item ID</div>
                        <input className="input mt-1" value={selectedItem.id} onChange={(event) => updateSelectedItem((current) => ({ ...current, id: event.target.value }))} />
                        {selectedDuplicateKeys.length ? (
                          <div className="mt-2 text-xs text-red-200">This ID is already used by another item in the workspace.</div>
                        ) : null}
                      </div>
                      <div>
                        <div className="label">Name</div>
                        <input className="input mt-1" value={selectedItem.name} onChange={(event) => updateSelectedItem((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div>
                        <div className="label">Rarity</div>
                        <input
                          className="input mt-1"
                          value={selectedItem.rarity}
                          inputMode="numeric"
                          placeholder="1"
                          onChange={(event) => updateSelectedItem((current) => ({ ...current, rarity: event.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="label">Type</div>
                        <input className="input mt-1" value={selectedItem.type} onChange={(event) => updateSelectedItem((current) => ({ ...current, type: event.target.value }))} />
                      </div>
                      <div className="md:col-span-2">
                        <div className="label">Image</div>
                        <input
                          className="input mt-1"
                          value={selectedItem.icon}
                          placeholder="item_lootbox.png"
                          onChange={(event) => updateSelectedItem((current) => ({ ...current, icon: event.target.value }))}
                        />
                        <div className="mt-2 text-xs text-white/55">If left blank, the item exports with the standard lootbox fallback icon.</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="label">Description</div>
                        <textarea
                          className="input mt-1 min-h-24"
                          value={selectedItem.description}
                          onChange={(event) => updateSelectedItem((current) => ({ ...current, description: event.target.value }))}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <div className="label">Additional Runtime JSON</div>
                        <textarea
                          className="input mt-1 min-h-52 font-mono text-sm"
                          value={selectedItem.extraJson}
                          placeholder='{"sell_price": 10, "stackable": true}'
                          onChange={(event) => updateSelectedItem((current) => ({ ...current, extraJson: event.target.value }))}
                        />
                      </div>
                    </div>
                  </Section>

                  <Section title="Preview" description="Preview the current icon and core item fields with the same lootbox fallback used elsewhere in the console.">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <div className="flex flex-col gap-5 md:flex-row md:items-start">
                        <img src={previewIcon} alt="" className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 bg-[#07111d] object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="text-3xl font-semibold" style={{ color: titleColor }}>
                            {selectedItem.name || "Unnamed Item"}
                          </div>
                          <div className="mt-2 font-mono text-xs text-white/55">{selectedItem.id || "missing-id"}</div>
                          <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/65">
                            <span className="rounded bg-white/5 px-2 py-1">Rarity {selectedItem.rarity || "?"}</span>
                            <span className="rounded bg-white/5 px-2 py-1">{selectedItem.type.trim() || "Type unset"}</span>
                          </div>
                          {selectedItem.description.trim() ? <div className="mt-4 max-w-3xl text-sm leading-6 text-white/70">{selectedItem.description}</div> : null}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="Export Preview" description="Copy the whole items file or save it locally after editing this workspace.">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn" onClick={handleCopyUpdatedJson}>
                        Copy Updated JSON
                      </button>
                      <button className="rounded bg-white/5 px-3 py-2 text-sm hover:bg-white/10" onClick={() => downloadTextFile("items.json", fullJson)}>
                        Download items.json
                      </button>
                    </div>
                    <pre className="max-h-[40rem] overflow-auto rounded-xl border border-white/10 bg-[#08101c] p-4 text-sm text-white/80">{fullJson}</pre>
                  </Section>
                </>
              ) : (
                <Section title="No Item Selected" description="Create a new item or pick one from the left sidebar to start editing.">
                  <button className="btn" onClick={addBlankItem}>
                    New Item
                  </button>
                </Section>
              )}
            </div>
          </div>
        </>
      )}

      <div
        className={`card text-sm ${
          status.tone === "error" ? "text-red-200" : status.tone === "success" ? "text-emerald-100" : "text-white/70"
        }`}
      >
        {status.message}
      </div>
    </div>
  );
}
