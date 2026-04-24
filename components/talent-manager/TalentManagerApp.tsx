"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIconSrc } from "@lib/icon-src";
import type { TalentClass, TalentIconOption, TalentSpecialization, TalentTemplate, TalentValidationIssue, TalentWorkspace } from "@lib/talent-manager/types";
import { expandedTalentsForSpec, sanitizeTalentId, templateRequirementText, validateTalentWorkspace } from "@lib/talent-manager/utils";

type LoadResponse = {
  ok: boolean;
  error?: string;
  sourcePath?: string;
  workspace?: TalentWorkspace;
  warnings?: string[];
  validation?: TalentValidationIssue[];
};

type IconResponse = {
  ok: boolean;
  data: TalentIconOption[];
  error?: string;
  message?: string;
  capped?: boolean;
};

type Status = {
  tone: "success" | "error" | "neutral";
  message: string;
};

type IconTarget = "class" | "spec" | "talent";

function uniqueId(base: string, existingIds: string[]) {
  const root = sanitizeTalentId(base) || "new_entry";
  if (!existingIds.includes(root)) return root;
  let suffix = 2;
  while (existingIds.includes(`${root}_${suffix}`)) suffix += 1;
  return `${root}_${suffix}`;
}

function iconSrc(icon: string | undefined, id: string, name: string, version: string) {
  return buildIconSrc(icon || "icon_lootbox.png", id || name || "talent", name || id || "Talent", version);
}

function requirementBadgeClass(template: TalentTemplate) {
  return template.requires_tree_points > 0 || template.requires_talent ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
}

function issueClass(issue: TalentValidationIssue) {
  return issue.level === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
}

export default function TalentManagerApp() {
  const [workspace, setWorkspace] = useState<TalentWorkspace | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [icons, setIcons] = useState<TalentIconOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [iconQuery, setIconQuery] = useState("");
  const [iconCategory, setIconCategory] = useState("");
  const [iconTarget, setIconTarget] = useState<IconTarget>("talent");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [dataVersion, setDataVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setStatus(null);
      try {
        const [talentsResponse, iconsResponse] = await Promise.all([fetch("/api/talents", { cache: "no-store" }), fetch("/api/talent-icons", { cache: "no-store" })]);
        const talentsPayload = (await talentsResponse.json().catch(() => ({}))) as LoadResponse;
        const iconsPayload = (await iconsResponse.json().catch(() => ({ data: [] }))) as IconResponse;
        if (cancelled) return;

        if (!talentsResponse.ok || !talentsPayload.ok || !talentsPayload.workspace) {
          setWorkspace(null);
          setStatus({ tone: "error", message: talentsPayload.error || "Could not load TalentTrees.json." });
        } else {
          const nextWorkspace = talentsPayload.workspace;
          setWorkspace(nextWorkspace);
          setSourcePath(talentsPayload.sourcePath || "");
          setWarnings(talentsPayload.warnings ?? []);
          setSelectedClassId(nextWorkspace.classes[0]?.id ?? "");
          setSelectedSpecId(nextWorkspace.classes[0]?.specializations[0]?.id ?? "");
          setSelectedTemplateId(nextWorkspace.talent_templates[0]?.id ?? "");
          setDataVersion(String(Date.now()));
          setDirty(false);
        }

        if (iconsPayload.ok && Array.isArray(iconsPayload.data)) {
          setIcons(iconsPayload.data);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const validation = useMemo(() => (workspace ? validateTalentWorkspace(workspace) : []), [workspace]);
  const validationErrors = validation.filter((issue) => issue.level === "error");

  const selectedClass = useMemo(() => workspace?.classes.find((entry) => entry.id === selectedClassId) ?? workspace?.classes[0] ?? null, [selectedClassId, workspace]);
  const selectedSpec = useMemo(
    () => selectedClass?.specializations.find((entry) => entry.id === selectedSpecId) ?? selectedClass?.specializations[0] ?? null,
    [selectedClass, selectedSpecId],
  );
  const selectedTemplate = useMemo(() => workspace?.talent_templates.find((entry) => entry.id === selectedTemplateId) ?? workspace?.talent_templates[0] ?? null, [selectedTemplateId, workspace]);
  const expandedTalents = useMemo(
    () => (workspace && selectedClass && selectedSpec ? expandedTalentsForSpec(workspace, selectedClass, selectedSpec) : []),
    [selectedClass, selectedSpec, workspace],
  );

  const iconCategories = useMemo(() => Array.from(new Set(icons.map((icon) => icon.category))).sort((left, right) => left.localeCompare(right)), [icons]);
  const filteredIcons = useMemo(() => {
    const normalizedQuery = iconQuery.trim().toLowerCase();
    return icons
      .filter((icon) => !iconCategory || icon.category === iconCategory)
      .filter((icon) => {
        if (!normalizedQuery) return true;
        return `${icon.fileName} ${icon.relativePath} ${icon.resPath}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 180);
  }, [iconCategory, iconQuery, icons]);

  function mutateWorkspace(mutator: (current: TalentWorkspace) => TalentWorkspace) {
    setWorkspace((current) => {
      if (!current) return current;
      const next = mutator(current);
      return next;
    });
    setDirty(true);
    setStatus(null);
  }

  function updateSelectedClass(patch: Partial<TalentClass>) {
    if (!selectedClass) return;
    mutateWorkspace((current) => ({
      ...current,
      classes: current.classes.map((entry) => (entry.id === selectedClass.id ? { ...entry, ...patch } : entry)),
    }));
  }

  function updateSelectedSpec(patch: Partial<TalentSpecialization>) {
    if (!selectedClass || !selectedSpec) return;
    mutateWorkspace((current) => ({
      ...current,
      classes: current.classes.map((entry) =>
        entry.id === selectedClass.id
          ? {
              ...entry,
              specializations: entry.specializations.map((spec) => (spec.id === selectedSpec.id ? { ...spec, ...patch } : spec)),
            }
          : entry,
      ),
    }));
  }

  function updateSelectedTemplate(patch: Partial<TalentTemplate>) {
    if (!selectedTemplate) return;
    mutateWorkspace((current) => ({
      ...current,
      talent_templates: current.talent_templates.map((entry) => (entry.id === selectedTemplate.id ? { ...entry, ...patch } : entry)),
    }));
  }

  function addClass() {
    if (!workspace) return;
    const id = uniqueId("new_class", workspace.classes.map((entry) => entry.id));
    mutateWorkspace((current) => ({
      ...current,
      classes: [
        ...current.classes,
        {
          id,
          name: "New Class",
          description: "",
          icon: "",
          specializations: [
            {
              id: "new_spec",
              name: "New Spec",
              role: "Specialization",
              description: "",
              icon: "",
            },
          ],
        },
      ],
    }));
    setSelectedClassId(id);
    setSelectedSpecId("new_spec");
    setIconTarget("class");
  }

  function addSpec() {
    if (!workspace || !selectedClass) return;
    const id = uniqueId("new_spec", selectedClass.specializations.map((entry) => entry.id));
    mutateWorkspace((current) => ({
      ...current,
      classes: current.classes.map((entry) =>
        entry.id === selectedClass.id
          ? {
              ...entry,
              specializations: [
                ...entry.specializations,
                {
                  id,
                  name: "New Spec",
                  role: "Specialization",
                  description: "",
                  icon: "",
                },
              ],
            }
          : entry,
      ),
    }));
    setSelectedSpecId(id);
    setIconTarget("spec");
  }

  function addTalentTemplate() {
    if (!workspace) return;
    const id = uniqueId("new_talent", workspace.talent_templates.map((entry) => entry.id));
    mutateWorkspace((current) => ({
      ...current,
      talent_templates: [
        ...current.talent_templates,
        {
          id,
          name: "New {spec} Talent",
          description: "",
          row: 1,
          column: 1,
          max_rank: 1,
          requires_tree_points: 0,
          requires_talent: "",
          requires_talent_full: false,
          requires_rank: 1,
          icon: "res://assets/mods/mod_utility_circuit_3_common.png",
        },
      ],
    }));
    setSelectedTemplateId(id);
    setIconTarget("talent");
  }

  function applyIcon(icon: TalentIconOption) {
    if (iconTarget === "class") {
      updateSelectedClass({ icon: icon.resPath });
      return;
    }
    if (iconTarget === "spec") {
      updateSelectedSpec({ icon: icon.resPath });
      return;
    }
    updateSelectedTemplate({ icon: icon.resPath });
  }

  async function saveToBuild() {
    if (!workspace || validationErrors.length) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setStatus({ tone: "error", message: payload.error || "Could not save TalentTrees.json." });
        return;
      }
      setDirty(false);
      setDataVersion(String(Date.now()));
      setStatus({
        tone: "success",
        message: `Saved ${payload.savedClasses ?? workspace.classes.length} classes and ${payload.savedTalentTemplates ?? workspace.talent_templates.length} talent templates to TalentTrees.json.`,
      });
    } catch (error) {
      setStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card text-sm text-white/65">Loading talent tree data...</div>;
  }

  if (!workspace) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">Talent Manager</h1>
          <p className="max-w-4xl text-sm text-white/70">Manage class and talent tree presentation from the active Gemini Station game root.</p>
        </div>
        {status ? <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">{status.message}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">Talent Manager</h1>
          <p className="max-w-5xl text-sm leading-6 text-white/70">
            Edit the visual class and talent data consumed by TalentService. Templates expand across every class specialization, so text can use {"{class}"}, {"{spec}"}, and {"{role}"} tokens.
          </p>
          {sourcePath ? <div className="mt-2 break-all font-mono text-xs text-white/45">{sourcePath}</div> : null}
        </div>
        <button className="btn-save-build shrink-0 disabled:cursor-default disabled:opacity-40" disabled={saving || validationErrors.length > 0} onClick={() => void saveToBuild()}>
          {saving ? "Saving..." : dirty ? "Save to build" : "Save to build"}
        </button>
      </div>

      {status ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${status.tone === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : status.tone === "success" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/70"}`}>
          {status.message}
        </div>
      ) : null}

      {validation.length || warnings.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {validation.map((issue, index) => (
            <div key={`${issue.level}-${index}`} className={`rounded-xl border px-4 py-3 text-sm ${issueClass(issue)}`}>
              {issue.message}
            </div>
          ))}
          {warnings.map((warning, index) => (
            <div key={`warning-${index}`} className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm text-yellow-100">
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-white">Classes</div>
            <div className="mt-1 text-sm text-white/55">Pick a class across the top, then choose a specialization for the tree.</div>
          </div>
          <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={addClass}>
            Add Class
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {workspace.classes.map((talentClass) => (
            <button
              key={talentClass.id}
              className={`rounded-lg border px-3 py-3 text-left transition ${selectedClass?.id === talentClass.id ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-white/[0.03] hover:border-cyan-300/30 hover:bg-white/[0.05]"}`}
              onClick={() => {
                setSelectedClassId(talentClass.id);
                setSelectedSpecId(talentClass.specializations[0]?.id ?? "");
                setIconTarget("class");
              }}
            >
              <div className="flex items-center gap-3">
                <img src={iconSrc(talentClass.icon, talentClass.id, talentClass.name, dataVersion)} alt="" className="h-11 w-11 rounded border border-white/10 bg-black/25 object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{talentClass.name}</div>
                  <div className="mt-1 text-xs text-white/45">{talentClass.specializations.length} specs</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        {selectedClass ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <div className="mr-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Specs</div>
            {selectedClass.specializations.map((spec) => (
              <button
                key={spec.id}
                className={`rounded border px-3 py-2 text-sm ${selectedSpec?.id === spec.id ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                onClick={() => {
                  setSelectedSpecId(spec.id);
                  setIconTarget("spec");
                }}
              >
                {spec.name}
                <span className="ml-2 text-white/45">{spec.role || "Specialization"}</span>
              </button>
            ))}
            <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={addSpec}>
              Add Spec
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <main className="space-y-4">
          <section className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">{selectedClass?.name || "No Class"} / {selectedSpec?.name || "No Spec"}</div>
                <div className="mt-1 text-sm text-white/55">{selectedSpec?.description || selectedClass?.description || "Select a class and specialization to preview generated talents."}</div>
              </div>
              <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={addTalentTemplate}>
                Add Talent
              </button>
            </div>

            <div className="overflow-auto rounded-lg border border-white/10 bg-black/20 p-4">
              <div
                className="grid min-w-[520px] gap-3"
                style={{
                  gridTemplateColumns: `repeat(${workspace.tree_columns}, minmax(128px, 1fr))`,
                  gridTemplateRows: `repeat(${workspace.tree_rows}, minmax(104px, auto))`,
                }}
              >
                {Array.from({ length: workspace.tree_rows * workspace.tree_columns }).map((_, index) => {
                  const row = Math.floor(index / workspace.tree_columns);
                  const column = index % workspace.tree_columns;
                  const talent = expandedTalents.find((entry) => entry.row === row && entry.column === column);
                  if (!talent) {
                    return <div key={`empty-${row}-${column}`} className="min-h-24 rounded-lg border border-dashed border-white/10 bg-white/[0.02]" />;
                  }
                  const isSelected = selectedTemplate?.id === talent.template_id;
                  return (
                    <button
                      key={talent.talent_id}
                      className={`min-h-24 rounded-lg border p-3 text-left transition ${isSelected ? "border-cyan-300/55 bg-cyan-300/12" : "border-white/10 bg-white/[0.04] hover:border-cyan-300/30 hover:bg-white/[0.06]"}`}
                      onClick={() => {
                        setSelectedTemplateId(talent.template_id);
                        setIconTarget("talent");
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <img src={iconSrc(talent.icon, talent.talent_id, talent.name, dataVersion)} alt="" className="h-12 w-12 rounded border border-white/10 bg-black/30 object-cover" />
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-semibold text-white">{talent.name}</div>
                          <div className="mt-1 text-xs text-white/45">Rank {talent.max_rank} · Row {talent.display_row}, Col {talent.display_column}</div>
                        </div>
                      </div>
                      <div className={`mt-3 rounded border px-2 py-1 text-[11px] ${requirementBadgeClass(talent)}`}>{templateRequirementText(workspace, talent)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

        </main>

        <aside className="space-y-4">
          {iconTarget === "class" ? (
          <section className="card space-y-4">
            <div className="text-xl font-semibold text-white">Class Visuals</div>
            {selectedClass ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <img src={iconSrc(selectedClass.icon, selectedClass.id, selectedClass.name, dataVersion)} alt="" className="h-[72px] w-[72px] rounded-lg border border-white/10 bg-black/25 object-cover" />
                  <label className="text-sm text-white/65">
                    Class Icon
                    <input className="input mt-1 font-mono text-xs" value={selectedClass.icon ?? ""} onChange={(event) => updateSelectedClass({ icon: event.target.value })} onFocus={() => setIconTarget("class")} />
                  </label>
                </div>
                <label className="block text-sm text-white/65">
                  Class Name
                  <input className="input mt-1" value={selectedClass.name} onChange={(event) => updateSelectedClass({ name: event.target.value })} />
                </label>
                <label className="block text-sm text-white/65">
                  Class ID
                  <input
                    className="input mt-1 font-mono"
                    value={selectedClass.id}
                    onChange={(event) => {
                      const id = sanitizeTalentId(event.target.value);
                      updateSelectedClass({ id });
                      setSelectedClassId(id);
                    }}
                  />
                </label>
                <label className="block text-sm text-white/65">
                  Class Description
                  <textarea className="input mt-1 min-h-24" value={selectedClass.description} onChange={(event) => updateSelectedClass({ description: event.target.value })} />
                </label>
              </div>
            ) : null}
          </section>
          ) : null}

          {iconTarget === "spec" ? (
          <section className="card space-y-4">
            <div className="text-xl font-semibold text-white">Specialization Visuals</div>
            {selectedSpec ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <img src={iconSrc(selectedSpec.icon, selectedSpec.id, selectedSpec.name, dataVersion)} alt="" className="h-[72px] w-[72px] rounded-lg border border-white/10 bg-black/25 object-cover" />
                  <label className="text-sm text-white/65">
                    Spec Icon
                    <input className="input mt-1 font-mono text-xs" value={selectedSpec.icon ?? ""} onChange={(event) => updateSelectedSpec({ icon: event.target.value })} onFocus={() => setIconTarget("spec")} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/65">
                    Spec Name
                    <input className="input mt-1" value={selectedSpec.name} onChange={(event) => updateSelectedSpec({ name: event.target.value })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Role
                    <input className="input mt-1" value={selectedSpec.role} onChange={(event) => updateSelectedSpec({ role: event.target.value })} />
                  </label>
                </div>
                <label className="block text-sm text-white/65">
                  Spec ID
                  <input
                    className="input mt-1 font-mono"
                    value={selectedSpec.id}
                    onChange={(event) => {
                      const id = sanitizeTalentId(event.target.value);
                      updateSelectedSpec({ id });
                      setSelectedSpecId(id);
                    }}
                  />
                </label>
                <label className="block text-sm text-white/65">
                  Spec Description
                  <textarea className="input mt-1 min-h-24" value={selectedSpec.description} onChange={(event) => updateSelectedSpec({ description: event.target.value })} />
                </label>
              </div>
            ) : null}
          </section>
          ) : null}

          {iconTarget === "talent" ? (
          <section className="card space-y-4">
            <div className="text-xl font-semibold text-white">Talent Details</div>
            {selectedTemplate ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[72px_1fr] gap-3">
                  <img src={iconSrc(selectedTemplate.icon, selectedTemplate.id, selectedTemplate.name, dataVersion)} alt="" className="h-[72px] w-[72px] rounded-lg border border-white/10 bg-black/25 object-cover" />
                  <label className="text-sm text-white/65">
                    Talent Icon
                    <input className="input mt-1 font-mono text-xs" value={selectedTemplate.icon ?? ""} onChange={(event) => updateSelectedTemplate({ icon: event.target.value })} onFocus={() => setIconTarget("talent")} />
                  </label>
                </div>
                <label className="block text-sm text-white/65">
                  Name Template
                  <input className="input mt-1" value={selectedTemplate.name} onChange={(event) => updateSelectedTemplate({ name: event.target.value })} />
                </label>
                <label className="block text-sm text-white/65">
                  Template ID
                  <input
                    className="input mt-1 font-mono"
                    value={selectedTemplate.id}
                    onChange={(event) => {
                      const id = sanitizeTalentId(event.target.value);
                      updateSelectedTemplate({ id });
                      setSelectedTemplateId(id);
                    }}
                  />
                </label>
                <label className="block text-sm text-white/65">
                  Description Template
                  <textarea className="input mt-1 min-h-28" value={selectedTemplate.description} onChange={(event) => updateSelectedTemplate({ description: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/65">
                    Row
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.row} onChange={(event) => updateSelectedTemplate({ row: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Column
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.column} onChange={(event) => updateSelectedTemplate({ column: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Max Rank
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.max_rank} onChange={(event) => updateSelectedTemplate({ max_rank: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Tree Points
                    <input className="input mt-1" type="number" min="0" value={selectedTemplate.requires_tree_points} onChange={(event) => updateSelectedTemplate({ requires_tree_points: Number(event.target.value) })} />
                  </label>
                </div>
                <label className="block text-sm text-white/65">
                  Requires Talent
                  <select className="select mt-1 w-full" value={selectedTemplate.requires_talent ?? ""} onChange={(event) => updateSelectedTemplate({ requires_talent: event.target.value })}>
                    <option value="">No talent prerequisite</option>
                    {workspace.talent_templates
                      .filter((template) => template.id !== selectedTemplate.id)
                      .map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} ({template.id})
                        </option>
                      ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                    <span>Require Full Rank</span>
                    <input type="checkbox" checked={!!selectedTemplate.requires_talent_full} onChange={(event) => updateSelectedTemplate({ requires_talent_full: event.target.checked })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Required Rank
                    <input className="input mt-1" type="number" min="1" disabled={!!selectedTemplate.requires_talent_full} value={selectedTemplate.requires_rank ?? 1} onChange={(event) => updateSelectedTemplate({ requires_rank: Number(event.target.value) })} />
                  </label>
                </div>
                <div className={`rounded border px-3 py-2 text-sm ${requirementBadgeClass(selectedTemplate)}`}>{templateRequirementText(workspace, selectedTemplate)}</div>
              </div>
            ) : null}
          </section>
          ) : null}

          <section className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-white">Icon Browser</div>
                <div className="mt-1 text-sm text-white/55">Click an icon to apply it to the selected target.</div>
              </div>
              <div className="flex rounded-lg border border-white/10 bg-black/20 p-1 text-xs">
                {(["talent", "spec", "class"] as IconTarget[]).map((target) => (
                  <button key={target} className={`rounded px-2 py-1 capitalize ${iconTarget === target ? "bg-cyan-300/20 text-cyan-100" : "text-white/55 hover:text-white"}`} onClick={() => setIconTarget(target)}>
                    {target}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
              <input className="input" placeholder="Search icon files..." value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} />
              <select className="select w-full" value={iconCategory} onChange={(event) => setIconCategory(event.target.value)}>
                <option value="">All folders</option>
                {iconCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[28rem] grid grid-cols-4 gap-2 overflow-y-auto pr-1">
              {filteredIcons.map((icon) => (
                <button key={icon.resPath} title={icon.resPath} className="group rounded-lg border border-white/10 bg-black/20 p-2 hover:border-cyan-300/40 hover:bg-cyan-300/10" onClick={() => applyIcon(icon)}>
                  <img src={buildIconSrc(icon.resPath, icon.fileName, icon.fileName, dataVersion)} alt="" className="aspect-square w-full rounded bg-[#07111d] object-cover" />
                  <div className="mt-1 truncate text-[10px] text-white/45 group-hover:text-white/75">{icon.fileName}</div>
                </button>
              ))}
            </div>
            {icons.length && filteredIcons.length === 180 ? <div className="text-xs text-white/45">Showing the first 180 matches. Narrow the search to see more specific icons.</div> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
