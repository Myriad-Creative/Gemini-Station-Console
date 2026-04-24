"use client";

import { useEffect, useMemo, useState } from "react";
import { buildIconSrc } from "@lib/icon-src";
import type { TalentClass, TalentIconOption, TalentSpecialization, TalentTemplate, TalentTemplateOverride, TalentValidationIssue, TalentWorkspace } from "@lib/talent-manager/types";
import { expandedTalentsForSpec, sanitizeTalentId, talentTemplatesForSpec, templateRequirementText, validateTalentWorkspace } from "@lib/talent-manager/utils";

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

type GridPosition = {
  row: number;
  column: number;
};

type RequirementLink = {
  key: string;
  requiredId: string;
  dependentId: string;
  requiredRow: number;
  dependentRow: number;
  column: number;
};

function uniqueId(base: string, existingIds: string[]) {
  const root = sanitizeTalentId(base) || "new_entry";
  if (!existingIds.includes(root)) return root;
  let suffix = 2;
  while (existingIds.includes(`${root}_${suffix}`)) suffix += 1;
  return `${root}_${suffix}`;
}

function uniqueLabel(base: string, existingLabels: string[]) {
  const root = base.trim() || "New Entry";
  if (!existingLabels.includes(root)) return root;
  let suffix = 2;
  while (existingLabels.includes(`${root} ${suffix}`)) suffix += 1;
  return `${root} ${suffix}`;
}

function createEmptySpec(id: string, name = "New Spec"): TalentSpecialization {
  return {
    id,
    name,
    role: "Specialization",
    description: "",
    icon: "",
    inherit_global_templates: false,
    talent_templates: [],
    talent_overrides: {},
  };
}

function localTemplateFromResolvedTemplate(template: TalentTemplate): TalentTemplate {
  const { source: _source, base_template_id: _baseTemplateId, ...localTemplate } = template;
  return {
    ...localTemplate,
    id: sanitizeTalentId(localTemplate.id),
    requires_talent: sanitizeTalentId(localTemplate.requires_talent ?? ""),
  };
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

function slotKey(row: number, column: number) {
  return `${row}:${column}`;
}

function formatPointCount(value: number) {
  return `${value} pt${value === 1 ? "" : "s"}`;
}

function templateGridPosition(workspace: TalentWorkspace, template: TalentTemplate): GridPosition {
  const offset = workspace.layout_index_base === 1 ? 1 : 0;
  return {
    row: Math.max(0, Math.round(template.row) - offset),
    column: Math.max(0, Math.round(template.column) - offset),
  };
}

function savedGridPosition(workspace: TalentWorkspace, row: number, column: number): GridPosition {
  const offset = workspace.layout_index_base === 1 ? 1 : 0;
  return {
    row: Math.max(1, row + offset),
    column: Math.max(1, column + offset),
  };
}

function findNearestTemplateAbove(templates: TalentTemplate[], template: TalentTemplate) {
  return templates
    .filter((entry) => entry.id !== template.id && entry.column === template.column && entry.row < template.row)
    .sort((left, right) => right.row - left.row)[0] ?? null;
}

function buildRequirementLinks(workspace: TalentWorkspace, templates: TalentTemplate[]): RequirementLink[] {
  return templates.flatMap((dependent) => {
    if (!dependent.requires_talent) return [];
    const required = templates.find((template) => template.id === dependent.requires_talent);
    if (!required) return [];

    const requiredPosition = templateGridPosition(workspace, required);
    const dependentPosition = templateGridPosition(workspace, dependent);
    if (requiredPosition.column !== dependentPosition.column || requiredPosition.row >= dependentPosition.row) return [];
    if (requiredPosition.column < 0 || requiredPosition.column >= workspace.tree_columns) return [];
    if (requiredPosition.row < 0 || dependentPosition.row >= workspace.tree_rows) return [];

    return [
      {
        key: `${required.id}->${dependent.id}`,
        requiredId: required.id,
        dependentId: dependent.id,
        requiredRow: requiredPosition.row,
        dependentRow: dependentPosition.row,
        column: requiredPosition.column,
      },
    ];
  });
}

function requirementClearingPatches(templates: TalentTemplate[], movedIds: Set<string>) {
  const patches: Record<string, Partial<TalentTemplate>> = {};
  for (const template of templates) {
    if (!template.requires_talent && !movedIds.has(template.id)) continue;
    if (!movedIds.has(template.id) && (!template.requires_talent || !movedIds.has(template.requires_talent))) continue;

    patches[template.id] = {
      requires_talent: "",
      requires_talent_full: false,
      requires_rank: 1,
    };
  }
  return patches;
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
  const [draggedTemplateId, setDraggedTemplateId] = useState("");
  const [dropTargetKey, setDropTargetKey] = useState("");

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
          const initialClass = nextWorkspace.classes[0] ?? null;
          const initialSpec = initialClass?.specializations[0] ?? null;
          const initialTemplate = initialSpec ? talentTemplatesForSpec(nextWorkspace, initialSpec)[0] ?? null : null;
          setWorkspace(nextWorkspace);
          setSourcePath(talentsPayload.sourcePath || "");
          setWarnings(talentsPayload.warnings ?? []);
          setSelectedClassId(initialClass?.id ?? "");
          setSelectedSpecId(initialSpec?.id ?? "");
          setSelectedTemplateId(initialTemplate?.id ?? "");
          setIconTarget(initialTemplate ? "talent" : initialSpec ? "spec" : "class");
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
  const selectedTalentTemplates = useMemo(() => (workspace && selectedSpec ? talentTemplatesForSpec(workspace, selectedSpec) : []), [selectedSpec, workspace]);
  const selectedTemplate = useMemo(() => selectedTalentTemplates.find((entry) => entry.id === selectedTemplateId) ?? selectedTalentTemplates[0] ?? null, [selectedTalentTemplates, selectedTemplateId]);
  const expandedTalents = useMemo(
    () => (workspace && selectedClass && selectedSpec ? expandedTalentsForSpec(workspace, selectedClass, selectedSpec) : []),
    [selectedClass, selectedSpec, workspace],
  );
  const requirementLinks = useMemo(() => (workspace ? buildRequirementLinks(workspace, selectedTalentTemplates) : []), [selectedTalentTemplates, workspace]);
  const linkedMiddleSlots = useMemo(() => {
    const slots = new Map<string, RequirementLink>();
    for (const link of requirementLinks) {
      for (let row = link.requiredRow + 1; row < link.dependentRow; row += 1) {
        slots.set(slotKey(row, link.column), link);
      }
    }
    return slots;
  }, [requirementLinks]);
  const linkedTalentEndpoints = useMemo(() => {
    const endpoints = new Map<string, { requiresAbove?: boolean; requiredByBelow?: boolean }>();
    for (const link of requirementLinks) {
      endpoints.set(link.requiredId, { ...endpoints.get(link.requiredId), requiredByBelow: true });
      endpoints.set(link.dependentId, { ...endpoints.get(link.dependentId), requiresAbove: true });
    }
    return endpoints;
  }, [requirementLinks]);
  const occupiedSlots = useMemo(() => {
    const slots = new Map<string, (typeof expandedTalents)[number]>();
    for (const talent of expandedTalents) {
      if (talent.row >= 0 && talent.column >= 0 && talent.row < (workspace?.tree_rows ?? 0) && talent.column < (workspace?.tree_columns ?? 0)) {
        slots.set(slotKey(talent.row, talent.column), talent);
      }
    }
    return slots;
  }, [expandedTalents, workspace?.tree_columns, workspace?.tree_rows]);
  const rowPointTotals = useMemo(() => {
    const rows = Array.from({ length: workspace?.tree_rows ?? 0 }, () => ({ points: 0, running: 0 }));
    for (const talent of expandedTalents) {
      if (talent.row < 0 || talent.row >= rows.length) continue;
      rows[talent.row].points += Math.max(1, Math.round(Number(talent.max_rank) || 1));
    }
    let running = 0;
    return rows.map((row) => {
      running += row.points;
      return { ...row, running };
    });
  }, [expandedTalents, workspace?.tree_rows]);
  const treePointTotal = rowPointTotals[rowPointTotals.length - 1]?.running ?? 0;
  const requireAboveCandidate = useMemo(() => (selectedTemplate ? findNearestTemplateAbove(selectedTalentTemplates, selectedTemplate) : null), [selectedTalentTemplates, selectedTemplate]);

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

  function mutateSelectedSpec(current: TalentWorkspace, updater: (spec: TalentSpecialization) => TalentSpecialization): TalentWorkspace {
    return {
      ...current,
      classes: current.classes.map((entry) =>
        entry.id === selectedClassId
          ? {
              ...entry,
              specializations: entry.specializations.map((spec) => (spec.id === selectedSpecId ? updater(spec) : spec)),
            }
          : entry,
      ),
    };
  }

  function findCurrentSelectedSpec(current: TalentWorkspace) {
    const talentClass = current.classes.find((entry) => entry.id === selectedClassId) ?? current.classes[0];
    const spec = talentClass?.specializations.find((entry) => entry.id === selectedSpecId) ?? talentClass?.specializations[0];
    return spec ?? null;
  }

  function applyTemplatePatchesToSelectedSpec(current: TalentWorkspace, patches: Record<string, Partial<TalentTemplate>>): TalentWorkspace {
    if (!Object.keys(patches).length) return current;
    return mutateSelectedSpec(current, (spec) => {
      const localTemplates = spec.talent_templates ?? [];
      const overrides: Record<string, TalentTemplateOverride> = { ...(spec.talent_overrides ?? {}) };
      const nextLocalTemplates = localTemplates.map((template) => {
        const patch = patches[template.id];
        return patch ? { ...template, ...patch, id: patch.id ? sanitizeTalentId(patch.id) : template.id } : template;
      });

      for (const [templateId, patch] of Object.entries(patches)) {
        if (localTemplates.some((template) => template.id === templateId)) continue;
        overrides[templateId] = {
          ...(overrides[templateId] ?? {}),
          ...patch,
        };
      }

      return {
        ...spec,
        talent_templates: nextLocalTemplates,
        talent_overrides: overrides,
      };
    });
  }

  function updateSelectedTemplate(patch: Partial<TalentTemplate>) {
    if (!selectedTemplate) return;
    mutateWorkspace((current) => applyTemplatePatchesToSelectedSpec(current, { [selectedTemplate.id]: patch }));
  }

  function updateSelectedTemplatePosition(patch: Pick<Partial<TalentTemplate>, "row" | "column">) {
    if (!selectedTemplate) return;
    mutateWorkspace((current) => {
      const changedIds = new Set<string>([selectedTemplate.id]);
      const spec = findCurrentSelectedSpec(current);
      const templates = spec ? talentTemplatesForSpec(current, spec) : [];
      const clearingPatches = requirementClearingPatches(templates, changedIds);
      return applyTemplatePatchesToSelectedSpec(current, {
        ...clearingPatches,
        [selectedTemplate.id]: {
          ...(clearingPatches[selectedTemplate.id] ?? {}),
          ...patch,
        },
      });
    });
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
          specializations: [createEmptySpec("new_spec")],
        },
      ],
    }));
    setSelectedClassId(id);
    setSelectedSpecId("new_spec");
    setSelectedTemplateId("");
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
              specializations: [...entry.specializations, createEmptySpec(id)],
            }
          : entry,
      ),
    }));
    setSelectedSpecId(id);
    setSelectedTemplateId("");
    setIconTarget("spec");
  }

  function cloneSelectedSpec() {
    if (!selectedClass || !selectedSpec) return;
    const id = uniqueId(`${selectedSpec.id}_copy`, selectedClass.specializations.map((entry) => entry.id));
    const name = uniqueLabel(`${selectedSpec.name || selectedSpec.id} Copy`, selectedClass.specializations.map((entry) => entry.name));
    const clonedTemplates = selectedTalentTemplates.map(localTemplateFromResolvedTemplate);
    const clonedSpec: TalentSpecialization = {
      ...selectedSpec,
      id,
      name,
      inherit_global_templates: false,
      talent_templates: clonedTemplates,
      talent_overrides: {},
    };
    mutateWorkspace((current) => ({
      ...current,
      classes: current.classes.map((entry) =>
        entry.id === selectedClass.id
          ? {
              ...entry,
              specializations: [...entry.specializations, clonedSpec],
            }
          : entry,
      ),
    }));
    setSelectedSpecId(id);
    setSelectedTemplateId(clonedTemplates[0]?.id ?? "");
    setIconTarget(clonedTemplates.length ? "talent" : "spec");
  }

  function wipeSelectedSpec() {
    if (!selectedSpec) return;
    if (!window.confirm(`Wipe all talents from "${selectedSpec.name || selectedSpec.id}"? This keeps the spec but clears its tree when saved.`)) return;
    mutateWorkspace((current) =>
      mutateSelectedSpec(current, (spec) => ({
        ...spec,
        inherit_global_templates: false,
        talent_templates: [],
        talent_overrides: {},
      })),
    );
    setSelectedTemplateId("");
    setIconTarget("spec");
  }

  function deleteSelectedSpec() {
    if (!selectedClass || !selectedSpec) return;
    if (!window.confirm(`Delete specialization "${selectedSpec.name || selectedSpec.id}" from "${selectedClass.name || selectedClass.id}"? This removes the spec and all of its talents when saved.`)) return;
    const remainingSpecs = selectedClass.specializations.filter((spec) => spec.id !== selectedSpec.id);
    const nextSpecId = remainingSpecs[0]?.id ?? "";
    mutateWorkspace((current) => ({
      ...current,
      classes: current.classes.map((entry) =>
        entry.id === selectedClass.id
          ? {
              ...entry,
              specializations: entry.specializations.filter((spec) => spec.id !== selectedSpec.id),
            }
          : entry,
      ),
    }));
    setSelectedSpecId(nextSpecId);
    setSelectedTemplateId("");
    setIconTarget(nextSpecId ? "spec" : "class");
  }

  function addTalentTemplateAt(row: number, column: number) {
    if (!workspace || !selectedSpec) return;
    const id = uniqueId("new_talent", selectedTalentTemplates.map((entry) => entry.id));
    const position = savedGridPosition(workspace, row, column);
    mutateWorkspace((current) => ({
      ...mutateSelectedSpec(current, (spec) => ({
        ...spec,
        talent_templates: [
          ...(spec.talent_templates ?? []),
          {
            id,
            name: "New {spec} Talent",
            description: "",
            row: position.row,
            column: position.column,
            max_rank: 1,
            requires_tree_points: 0,
            requires_talent: "",
            requires_talent_full: false,
            requires_rank: 1,
            icon: "res://assets/mods/mod_utility_circuit_3_common.png",
          },
        ],
      })),
    }));
    setSelectedTemplateId(id);
    setIconTarget("talent");
  }

  function findBestOpenSlot(current: TalentWorkspace): GridPosition | null {
    const spec = findCurrentSelectedSpec(current);
    const templates = spec ? talentTemplatesForSpec(current, spec) : [];
    const occupied = new Set(templates.map((template) => {
      const position = templateGridPosition(current, template);
      return slotKey(position.row, position.column);
    }));
    for (const link of buildRequirementLinks(current, templates)) {
      for (let row = link.requiredRow + 1; row < link.dependentRow; row += 1) {
        occupied.add(slotKey(row, link.column));
      }
    }
    const selected = templates.find((template) => template.id === selectedTemplateId);
    const startIndex = selected ? templateGridPosition(current, selected).row * current.tree_columns + templateGridPosition(current, selected).column + 1 : 0;
    const totalSlots = current.tree_rows * current.tree_columns;

    for (let offset = 0; offset < totalSlots; offset += 1) {
      const index = (startIndex + offset) % totalSlots;
      const row = Math.floor(index / current.tree_columns);
      const column = index % current.tree_columns;
      if (!occupied.has(slotKey(row, column))) return { row, column };
    }

    return null;
  }

  function addTalentTemplate() {
    if (!workspace || !selectedSpec) return;
    const position = findBestOpenSlot(workspace);
    if (!position) {
      setStatus({ tone: "neutral", message: "No empty talent slots are available in the current tree." });
      return;
    }
    addTalentTemplateAt(position.row, position.column);
  }

  function moveTalentTemplateTo(templateId: string, row: number, column: number) {
    if (!workspace) return;
    const movingTemplate = selectedTalentTemplates.find((template) => template.id === templateId);
    if (!movingTemplate) return;
    const movingPosition = templateGridPosition(workspace, movingTemplate);
    if (movingPosition.row === row && movingPosition.column === column) return;
    const targetPosition = savedGridPosition(workspace, row, column);

    mutateWorkspace((current) => {
      const spec = findCurrentSelectedSpec(current);
      const templates = spec ? talentTemplatesForSpec(current, spec) : [];
      const moving = templates.find((template) => template.id === templateId);
      if (!moving) return current;
      const occupant = templates.find((template) => {
        if (template.id === templateId) return false;
        const position = templateGridPosition(current, template);
        return position.row === row && position.column === column;
      });
      const changedIds = new Set<string>([templateId]);
      if (occupant) changedIds.add(occupant.id);
      const patches: Record<string, Partial<TalentTemplate>> = requirementClearingPatches(templates, changedIds);
      patches[templateId] = {
        ...(patches[templateId] ?? {}),
        row: targetPosition.row,
        column: targetPosition.column,
      };
      if (occupant) patches[occupant.id] = { ...(patches[occupant.id] ?? {}), row: moving.row, column: moving.column };

      return applyTemplatePatchesToSelectedSpec(current, patches);
    });

    setSelectedTemplateId(templateId);
    setIconTarget("talent");
  }

  function setRequireAbove(enabled: boolean) {
    if (!selectedTemplate) return;
    if (!enabled) {
      if (selectedTemplate.requires_talent === requireAboveCandidate?.id) {
        updateSelectedTemplate({ requires_talent: "", requires_talent_full: false, requires_rank: 1 });
      }
      return;
    }

    if (!requireAboveCandidate) {
      setStatus({ tone: "neutral", message: "There is no talent above this slot in the same column." });
      return;
    }

    updateSelectedTemplate({
      requires_talent: requireAboveCandidate.id,
      requires_talent_full: true,
      requires_rank: Math.max(1, Math.round(requireAboveCandidate.max_rank)),
    });
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
      const localTalentCount = Number(payload.savedSpecTalentTemplates ?? 0);
      setStatus({
        tone: "success",
        message: `Saved ${payload.savedClasses ?? workspace.classes.length} classes, ${payload.savedTalentTemplates ?? workspace.talent_templates.length} global talent templates, and ${localTalentCount} spec-local talent templates to TalentTrees.json.`,
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
            Edit the visual class and talent data consumed by TalentService. Specs can inherit the global template set or use their own local talent tree, and text can use {"{class}"}, {"{spec}"}, and {"{role}"} tokens.
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
                const firstSpec = talentClass.specializations[0] ?? null;
                const firstTemplate = firstSpec ? talentTemplatesForSpec(workspace, firstSpec)[0] ?? null : null;
                setSelectedClassId(talentClass.id);
                setSelectedSpecId(firstSpec?.id ?? "");
                setSelectedTemplateId(firstTemplate?.id ?? "");
                setIconTarget(firstTemplate ? "talent" : firstSpec ? "spec" : "class");
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
          <div className="space-y-3 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Specs</div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5" onClick={addSpec}>
                  Add Empty Spec
                </button>
                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={!selectedSpec} onClick={cloneSelectedSpec}>
                  Clone Spec
                </button>
                <button className="rounded border border-yellow-300/25 px-3 py-2 text-sm text-yellow-100 hover:bg-yellow-300/10 disabled:cursor-default disabled:opacity-40" disabled={!selectedSpec} onClick={wipeSelectedSpec}>
                  Wipe Spec
                </button>
                <button className="rounded border border-red-400/25 px-3 py-2 text-sm text-red-100 hover:bg-red-400/10 disabled:cursor-default disabled:opacity-40" disabled={!selectedSpec} onClick={deleteSelectedSpec}>
                  Delete Spec
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedClass.specializations.map((spec) => (
                <button
                  key={spec.id}
                  className={`rounded border px-3 py-2 text-sm ${selectedSpec?.id === spec.id ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                  onClick={() => {
                    const firstTemplate = talentTemplatesForSpec(workspace, spec)[0] ?? null;
                    setSelectedSpecId(spec.id);
                    setSelectedTemplateId(firstTemplate?.id ?? "");
                    setIconTarget(firstTemplate ? "talent" : "spec");
                  }}
                >
                  {spec.name}
                  <span className="ml-2 text-white/45">{spec.role || "Specialization"}</span>
                  {spec.inherit_global_templates === false ? <span className="ml-2 text-white/35">{spec.talent_templates?.length ?? 0} local</span> : null}
                </button>
              ))}
            </div>
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                  Tree Total <span className="font-semibold">{formatPointCount(treePointTotal)}</span>
                </div>
                <button className="rounded border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5 disabled:cursor-default disabled:opacity-40" disabled={!selectedSpec} onClick={addTalentTemplate}>
                  Add Talent
                </button>
              </div>
            </div>

            <div className="overflow-auto rounded-lg border border-white/10 bg-black/20 p-4">
              <div
                className="grid min-w-[620px] gap-3"
                style={{
                  gridTemplateColumns: `4.75rem repeat(${workspace.tree_columns}, minmax(128px, 1fr))`,
                  gridTemplateRows: `repeat(${workspace.tree_rows}, minmax(104px, auto))`,
                }}
              >
                {Array.from({ length: workspace.tree_rows }).flatMap((_, row) => [
                  <div key={`row-points-${row}`} className="sticky left-0 z-10 flex min-h-24 items-center justify-end">
                    <div className="w-[4.25rem] rounded-lg border border-cyan-300/20 bg-[#07111d]/95 px-2 py-2 text-right shadow-lg">
                      <div className="text-[10px] font-semibold uppercase text-white/45">Row {row + (workspace.layout_index_base === 1 ? 1 : 0)}</div>
                      <div className="mt-1 text-sm font-semibold text-cyan-100">{formatPointCount(rowPointTotals[row]?.points ?? 0)}</div>
                      <div className="mt-0.5 text-[10px] text-white/45">{formatPointCount(rowPointTotals[row]?.running ?? 0)} total</div>
                    </div>
                  </div>,
                  ...Array.from({ length: workspace.tree_columns }).map((__, column) => {
                    const key = slotKey(row, column);
                    const talent = occupiedSlots.get(key);
                    const requirementPath = linkedMiddleSlots.get(key);
                    const isDropTarget = dropTargetKey === key;
                    if (!talent) {
                      if (requirementPath) {
                        return (
                          <div key={`link-${requirementPath.key}-${row}-${column}`} className="relative min-h-24" aria-hidden="true">
                            <div className="absolute inset-y-[-12px] left-1/2 w-1 -translate-x-1/2 rounded-full bg-cyan-300/60 shadow-[0_0_16px_rgba(103,232,249,0.45)]" />
                            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/55 bg-cyan-300/65 shadow-[0_0_14px_rgba(103,232,249,0.55)]" />
                          </div>
                        );
                      }
                      return (
                        <button
                          key={`empty-${row}-${column}`}
                          type="button"
                          aria-label={`Add talent at row ${row + 1}, column ${column + 1}`}
                          className={`group min-h-24 rounded-lg border border-dashed p-3 text-left transition ${
                            isDropTarget ? "border-cyan-300/55 bg-cyan-300/12" : "border-white/10 bg-white/[0.02] hover:border-cyan-300/30 hover:bg-white/[0.04]"
                          }`}
                          onClick={() => addTalentTemplateAt(row, column)}
                          onDragEnter={(event) => {
                            if (!draggedTemplateId) return;
                            event.preventDefault();
                            setDropTargetKey(key);
                          }}
                          onDragOver={(event) => {
                            if (!draggedTemplateId) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDropTargetKey(key);
                          }}
                          onDragLeave={() => {
                            if (dropTargetKey === key) setDropTargetKey("");
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const templateId = event.dataTransfer.getData("text/plain") || draggedTemplateId;
                            if (templateId) moveTalentTemplateTo(templateId, row, column);
                            setDraggedTemplateId("");
                            setDropTargetKey("");
                          }}
                        >
                          <div className="flex h-full min-h-16 items-center justify-center rounded border border-transparent text-2xl text-white/20 transition group-hover:text-cyan-100/70">+</div>
                        </button>
                      );
                    }
                    const isSelected = selectedTemplate?.id === talent.template_id;
                    const isDragging = draggedTemplateId === talent.template_id;
                    const linkedEndpoint = linkedTalentEndpoints.get(talent.template_id);
                    return (
                      <button
                        key={talent.talent_id}
                        type="button"
                        draggable
                        className={`relative min-h-24 overflow-visible rounded-lg border p-3 text-left transition ${
                          isSelected
                            ? "border-cyan-300/55 bg-cyan-300/12"
                            : isDropTarget
                              ? "border-cyan-300/40 bg-cyan-300/10"
                              : "border-white/10 bg-white/[0.04] hover:border-cyan-300/30 hover:bg-white/[0.06]"
                        } ${isDragging ? "opacity-45" : ""}`}
                        onClick={() => {
                          setSelectedTemplateId(talent.template_id);
                          setIconTarget("talent");
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", talent.template_id);
                          setDraggedTemplateId(talent.template_id);
                          setSelectedTemplateId(talent.template_id);
                          setIconTarget("talent");
                        }}
                        onDragEnter={(event) => {
                          if (!draggedTemplateId || draggedTemplateId === talent.template_id) return;
                          event.preventDefault();
                          setDropTargetKey(key);
                        }}
                        onDragOver={(event) => {
                          if (!draggedTemplateId || draggedTemplateId === talent.template_id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDropTargetKey(key);
                        }}
                        onDragLeave={() => {
                          if (dropTargetKey === key) setDropTargetKey("");
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const templateId = event.dataTransfer.getData("text/plain") || draggedTemplateId;
                          if (templateId && templateId !== talent.template_id) moveTalentTemplateTo(templateId, row, column);
                          setDraggedTemplateId("");
                          setDropTargetKey("");
                        }}
                        onDragEnd={() => {
                          setDraggedTemplateId("");
                          setDropTargetKey("");
                        }}
                      >
                        {linkedEndpoint?.requiresAbove ? <span className="pointer-events-none absolute left-1/2 top-[-13px] h-3.5 w-1 -translate-x-1/2 rounded-full bg-cyan-300/70 shadow-[0_0_14px_rgba(103,232,249,0.45)]" /> : null}
                        {linkedEndpoint?.requiredByBelow ? <span className="pointer-events-none absolute bottom-[-13px] left-1/2 h-3.5 w-1 -translate-x-1/2 rounded-full bg-cyan-300/70 shadow-[0_0_14px_rgba(103,232,249,0.45)]" /> : null}
                        <div className="flex items-start gap-3">
                          <img src={iconSrc(talent.icon, talent.talent_id, talent.name, dataVersion)} alt="" className="h-12 w-12 rounded border border-white/10 bg-black/30 object-cover" />
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-semibold text-white">{talent.name}</div>
                            <div className="mt-1 text-xs text-white/45">Max {formatPointCount(Math.max(1, Math.round(Number(talent.max_rank) || 1)))} · Row {talent.display_row}, Col {talent.display_column}</div>
                          </div>
                        </div>
                        <div className={`mt-3 rounded border px-2 py-1 text-[11px] ${requirementBadgeClass(talent)}`}>{templateRequirementText(workspace, talent, selectedTalentTemplates)}</div>
                      </button>
                    );
                  }),
                ])}
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
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
                  <span>
                    <span className="block">Inherit Global Talents</span>
                    <span className="mt-0.5 block text-xs text-white/45">Turn this off for a local-only spec tree.</span>
                  </span>
                  <input type="checkbox" checked={selectedSpec.inherit_global_templates !== false} onChange={(event) => updateSelectedSpec({ inherit_global_templates: event.target.checked })} />
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
                    disabled={selectedTemplate.source !== "spec"}
                    onChange={(event) => {
                      const id = sanitizeTalentId(event.target.value);
                      updateSelectedTemplate({ id });
                      setSelectedTemplateId(id);
                    }}
                  />
                  {selectedTemplate.source !== "spec" ? <span className="mt-1 block text-xs text-white/40">Inherited template IDs stay shared; visual edits are saved as this spec's override.</span> : null}
                </label>
                <label className="block text-sm text-white/65">
                  Description Template
                  <textarea className="input mt-1 min-h-28" value={selectedTemplate.description} onChange={(event) => updateSelectedTemplate({ description: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/65">
                    Row
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.row} onChange={(event) => updateSelectedTemplatePosition({ row: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Column
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.column} onChange={(event) => updateSelectedTemplatePosition({ column: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Max Rank / Points
                    <input className="input mt-1" type="number" min="1" value={selectedTemplate.max_rank} onChange={(event) => updateSelectedTemplate({ max_rank: Number(event.target.value) })} />
                  </label>
                  <label className="text-sm text-white/65">
                    Tree Points Required
                    <input className="input mt-1" type="number" min="0" value={selectedTemplate.requires_tree_points} onChange={(event) => updateSelectedTemplate({ requires_tree_points: Number(event.target.value) })} />
                  </label>
                </div>
                <label className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${requireAboveCandidate ? "border-white/10 bg-black/20 text-white/80" : "border-white/10 bg-black/10 text-white/35"}`}>
                  <span>
                    <span className="block">Require Above</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {requireAboveCandidate ? `${requireAboveCandidate.name} (${requireAboveCandidate.id})` : "No talent above in this column"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    disabled={!requireAboveCandidate}
                    checked={!!requireAboveCandidate && selectedTemplate.requires_talent === requireAboveCandidate.id}
                    onChange={(event) => setRequireAbove(event.target.checked)}
                  />
                </label>
                <label className="block text-sm text-white/65">
                  Requires Talent
                  <select className="select mt-1 w-full" value={selectedTemplate.requires_talent ?? ""} onChange={(event) => updateSelectedTemplate({ requires_talent: event.target.value })}>
                    <option value="">No talent prerequisite</option>
                    {selectedTalentTemplates
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
                    Prereq Rank
                    <input className="input mt-1" type="number" min="1" disabled={!!selectedTemplate.requires_talent_full} value={selectedTemplate.requires_rank ?? 1} onChange={(event) => updateSelectedTemplate({ requires_rank: Number(event.target.value) })} />
                  </label>
                </div>
                <div className={`rounded border px-3 py-2 text-sm ${requirementBadgeClass(selectedTemplate)}`}>{templateRequirementText(workspace, selectedTemplate, selectedTalentTemplates)}</div>
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
