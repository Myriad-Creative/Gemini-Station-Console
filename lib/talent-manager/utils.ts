import type { ExpandedTalent, JsonRecord, TalentClass, TalentSpecialization, TalentTemplate, TalentValidationIssue, TalentWorkspace } from "./types";

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

export function sanitizeTalentId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTemplate(entry: unknown, index: number): TalentTemplate {
  const template = asRecord(entry);
  return {
    ...template,
    id: sanitizeTalentId(stringValue(template.id, `talent_${index + 1}`)) || `talent_${index + 1}`,
    name: stringValue(template.name, `Talent ${index + 1}`),
    description: stringValue(template.description, ""),
    row: Math.max(1, Math.round(numberValue(template.row, index + 1))),
    column: Math.max(1, Math.round(numberValue(template.column, 1))),
    max_rank: Math.max(1, Math.round(numberValue(template.max_rank, 1))),
    requires_tree_points: Math.max(0, Math.round(numberValue(template.requires_tree_points, 0))),
    requires_talent: sanitizeTalentId(stringValue(template.requires_talent, "")),
    requires_talent_full: boolValue(template.requires_talent_full, false),
    requires_rank: Math.max(0, Math.round(numberValue(template.requires_rank, 1))),
    icon: stringValue(template.icon, ""),
  };
}

function normalizeSpec(entry: unknown, index: number): TalentSpecialization {
  const spec = asRecord(entry);
  return {
    ...spec,
    id: sanitizeTalentId(stringValue(spec.id, `spec_${index + 1}`)) || `spec_${index + 1}`,
    name: stringValue(spec.name, `Spec ${index + 1}`),
    role: stringValue(spec.role, "Specialization"),
    description: stringValue(spec.description, ""),
    icon: stringValue(spec.icon, ""),
  };
}

function normalizeClass(entry: unknown, index: number): TalentClass {
  const talentClass = asRecord(entry);
  const id = sanitizeTalentId(stringValue(talentClass.id, `class_${index + 1}`)) || `class_${index + 1}`;
  return {
    ...talentClass,
    id,
    name: stringValue(talentClass.name, `Class ${index + 1}`),
    description: stringValue(talentClass.description, ""),
    icon: stringValue(talentClass.icon, ""),
    specializations: asArray(talentClass.specializations).map(normalizeSpec),
  };
}

export function normalizeTalentWorkspace(rootValue: unknown): TalentWorkspace {
  const root = asRecord(rootValue);
  const treeRows = Math.max(1, Math.round(numberValue(root.tree_rows, 10)));
  const rowUnlockPoints = asArray(root.row_unlock_points)
    .slice(0, treeRows)
    .map((value, index) => Math.max(0, Math.round(numberValue(value, index * 5))));

  while (rowUnlockPoints.length < treeRows) {
    rowUnlockPoints.push(rowUnlockPoints.length * 5);
  }

  return {
    ...root,
    point_model: stringValue(root.point_model, "one_point_per_level_with_debug_override"),
    layout_index_base: Math.round(numberValue(root.layout_index_base, 1)) === 0 ? 0 : 1,
    tree_columns: Math.max(1, Math.round(numberValue(root.tree_columns, 4))),
    tree_rows: treeRows,
    talent_icon_size: Math.max(48, Math.round(numberValue(root.talent_icon_size, 82))),
    row_unlock_points: rowUnlockPoints,
    talent_templates: asArray(root.talent_templates).map(normalizeTemplate),
    classes: asArray(root.classes).map(normalizeClass),
  };
}

export function formatTemplateText(template: TalentTemplate, talentClass: TalentClass, spec: TalentSpecialization, value: string) {
  const replacements: Record<string, string> = {
    class: talentClass.name || talentClass.id,
    spec: spec.name || spec.id,
    role: spec.role || "Specialization",
  };
  return value.replace(/\{(class|spec|role)\}/g, (_match, key: string) => replacements[key] ?? "");
}

export function expandTalentTemplate(workspace: TalentWorkspace, talentClass: TalentClass, spec: TalentSpecialization, template: TalentTemplate): ExpandedTalent {
  const rowOffset = workspace.layout_index_base === 1 ? 1 : 0;
  const row = Math.max(0, Math.round(numberValue(template.row, 1)) - rowOffset);
  const column = Math.max(0, Math.round(numberValue(template.column, 1)) - rowOffset);
  const requiredTemplateId = sanitizeTalentId(stringValue(template.requires_talent, ""));
  const requiredTemplate = workspace.talent_templates.find((entry) => entry.id === requiredTemplateId);
  const requiresRank = template.requires_talent_full && requiredTemplate ? Math.max(1, Math.round(numberValue(requiredTemplate.max_rank, 1))) : Math.max(0, Math.round(numberValue(template.requires_rank, 1)));

  return {
    ...template,
    id: `${talentClass.id}/${spec.id}/${template.id}`,
    talent_id: `${talentClass.id}/${spec.id}/${template.id}`,
    template_id: template.id,
    class_id: talentClass.id,
    class_name: talentClass.name,
    spec_id: spec.id,
    spec_name: spec.name,
    role: spec.role,
    name: formatTemplateText(template, talentClass, spec, template.name),
    description: formatTemplateText(template, talentClass, spec, template.description),
    row,
    column,
    display_row: Math.round(numberValue(template.row, row + rowOffset)),
    display_column: Math.round(numberValue(template.column, column + rowOffset)),
    requires_talent_id: requiredTemplateId ? `${talentClass.id}/${spec.id}/${requiredTemplateId}` : "",
    requires_rank: requiredTemplateId ? requiresRank : 0,
  };
}

export function expandedTalentsForSpec(workspace: TalentWorkspace, talentClass: TalentClass, spec: TalentSpecialization) {
  return workspace.talent_templates
    .map((template) => expandTalentTemplate(workspace, talentClass, spec, template))
    .sort((left, right) => {
      if (left.row !== right.row) return left.row - right.row;
      return left.column - right.column;
    });
}

export function templateRequirementText(workspace: TalentWorkspace, template: TalentTemplate) {
  const parts: string[] = [];
  const requiredPoints = Math.max(0, Math.round(numberValue(template.requires_tree_points, 0)));
  if (requiredPoints > 0) parts.push(`${requiredPoints} tree points`);
  const requiredId = sanitizeTalentId(stringValue(template.requires_talent, ""));
  if (requiredId) {
    const requiredTemplate = workspace.talent_templates.find((entry) => entry.id === requiredId);
    const requiredName = requiredTemplate?.name || requiredId;
    const rank = template.requires_talent_full && requiredTemplate ? Math.max(1, Math.round(numberValue(requiredTemplate.max_rank, 1))) : Math.max(1, Math.round(numberValue(template.requires_rank, 1)));
    parts.push(`${rank} rank${rank === 1 ? "" : "s"} in ${requiredName}`);
  }
  return parts.length ? `Requires ${parts.join(" and ")}` : "Available at the start of the tree";
}

export function validateTalentWorkspace(workspace: TalentWorkspace): TalentValidationIssue[] {
  const issues: TalentValidationIssue[] = [];
  if (workspace.tree_columns < 1) issues.push({ level: "error", message: "Tree columns must be at least 1." });
  if (workspace.tree_rows < 1) issues.push({ level: "error", message: "Tree rows must be at least 1." });
  if (!workspace.talent_templates.length) issues.push({ level: "error", message: "At least one talent template is required." });
  if (!workspace.classes.length) issues.push({ level: "error", message: "At least one class is required." });

  const templateIds = new Set<string>();
  for (const template of workspace.talent_templates) {
    if (!template.id.trim()) issues.push({ level: "error", message: "A talent template has no ID." });
    if (templateIds.has(template.id)) issues.push({ level: "error", message: `Duplicate talent template ID "${template.id}".` });
    templateIds.add(template.id);
    if (!template.name.trim()) issues.push({ level: "error", message: `Talent template "${template.id}" needs a name.` });
    if (template.row < 1 || template.row > workspace.tree_rows) issues.push({ level: "warning", message: `Talent "${template.id}" is outside the configured row range.` });
    if (template.column < 1 || template.column > workspace.tree_columns) issues.push({ level: "warning", message: `Talent "${template.id}" is outside the configured column range.` });
    if (template.max_rank < 1) issues.push({ level: "error", message: `Talent "${template.id}" max rank must be at least 1.` });
    if (template.requires_talent) {
      if (template.requires_talent === template.id) issues.push({ level: "error", message: `Talent "${template.id}" cannot require itself.` });
      if (!templateIds.has(template.requires_talent) && !workspace.talent_templates.some((entry) => entry.id === template.requires_talent)) {
        issues.push({ level: "error", message: `Talent "${template.id}" requires missing template "${template.requires_talent}".` });
      }
    }
  }

  const classIds = new Set<string>();
  for (const talentClass of workspace.classes) {
    if (!talentClass.id.trim()) issues.push({ level: "error", message: "A class has no ID." });
    if (classIds.has(talentClass.id)) issues.push({ level: "error", message: `Duplicate class ID "${talentClass.id}".` });
    classIds.add(talentClass.id);
    if (!talentClass.name.trim()) issues.push({ level: "error", message: `Class "${talentClass.id}" needs a name.` });
    if (!talentClass.specializations.length) issues.push({ level: "warning", message: `Class "${talentClass.name || talentClass.id}" has no specializations.` });

    const specIds = new Set<string>();
    for (const spec of talentClass.specializations) {
      if (!spec.id.trim()) issues.push({ level: "error", message: `A specialization in "${talentClass.name || talentClass.id}" has no ID.` });
      if (specIds.has(spec.id)) issues.push({ level: "error", message: `Duplicate specialization ID "${spec.id}" in "${talentClass.name || talentClass.id}".` });
      specIds.add(spec.id);
      if (!spec.name.trim()) issues.push({ level: "error", message: `Specialization "${spec.id}" needs a name.` });
    }
  }

  return issues;
}

export function stringifyTalentWorkspace(workspace: TalentWorkspace) {
  const cleaned: TalentWorkspace = {
    ...workspace,
    talent_templates: workspace.talent_templates.map((template) => {
      const next: TalentTemplate = { ...template };
      if (!stringValue(next.icon, "").trim()) delete next.icon;
      if (!stringValue(next.requires_talent, "").trim()) {
        delete next.requires_talent;
        delete next.requires_talent_full;
        delete next.requires_rank;
      } else {
        if (next.requires_talent_full !== true) delete next.requires_talent_full;
        if (next.requires_talent_full === true || numberValue(next.requires_rank, 1) <= 1) delete next.requires_rank;
      }
      return next;
    }),
    classes: workspace.classes.map((talentClass) => {
      const nextClass: TalentClass = {
        ...talentClass,
        specializations: talentClass.specializations.map((spec) => {
          const nextSpec: TalentSpecialization = { ...spec };
          if (!stringValue(nextSpec.icon, "").trim()) delete nextSpec.icon;
          return nextSpec;
        }),
      };
      if (!stringValue(nextClass.icon, "").trim()) delete nextClass.icon;
      return nextClass;
    }),
  };
  return `${JSON.stringify(cleaned, null, "\t")}\n`;
}
