import type { ExpandedTalent, JsonRecord, TalentClass, TalentSpecialization, TalentTemplate, TalentTemplateOverride, TalentValidationIssue, TalentWorkspace } from "./types";

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

function stringArrayValue(value: unknown) {
  return asArray(value).map((entry) => stringValue(entry, ""));
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

function hasOwn(record: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
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
    rank_descriptions: stringArrayValue(template.rank_descriptions),
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

function normalizeTemplateOverride(entry: unknown): TalentTemplateOverride {
  const raw = asRecord(entry);
  const out: TalentTemplateOverride = { ...raw };
  delete out.source;
  delete out.base_template_id;
  if (hasOwn(raw, "id")) out.id = sanitizeTalentId(stringValue(raw.id, ""));
  if (hasOwn(raw, "name")) out.name = stringValue(raw.name, "");
  if (hasOwn(raw, "description")) out.description = stringValue(raw.description, "");
  if (hasOwn(raw, "rank_descriptions")) out.rank_descriptions = stringArrayValue(raw.rank_descriptions);
  if (hasOwn(raw, "row")) out.row = Math.max(1, Math.round(numberValue(raw.row, 1)));
  if (hasOwn(raw, "column")) out.column = Math.max(1, Math.round(numberValue(raw.column, 1)));
  if (hasOwn(raw, "max_rank")) out.max_rank = Math.max(1, Math.round(numberValue(raw.max_rank, 1)));
  if (hasOwn(raw, "requires_tree_points")) out.requires_tree_points = Math.max(0, Math.round(numberValue(raw.requires_tree_points, 0)));
  if (hasOwn(raw, "requires_talent")) out.requires_talent = sanitizeTalentId(stringValue(raw.requires_talent, ""));
  if (hasOwn(raw, "requires_talent_full")) out.requires_talent_full = boolValue(raw.requires_talent_full, false);
  if (hasOwn(raw, "requires_rank")) out.requires_rank = Math.max(0, Math.round(numberValue(raw.requires_rank, 1)));
  if (hasOwn(raw, "icon")) out.icon = stringValue(raw.icon, "");
  return out;
}

function normalizeTemplateOverrideMap(value: unknown) {
  const raw = asRecord(value);
  const out: Record<string, TalentTemplateOverride> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const id = sanitizeTalentId(key);
    if (!id) continue;
    out[id] = normalizeTemplateOverride(entry);
  }
  return out;
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
    inherit_global_templates: hasOwn(spec, "inherit_global_templates") ? boolValue(spec.inherit_global_templates, true) : true,
    talent_templates: asArray(spec.talent_templates).map(normalizeTemplate),
    talent_overrides: normalizeTemplateOverrideMap(spec.talent_overrides),
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

  return normalizeTalentRowRequirements({
    ...root,
    point_model: stringValue(root.point_model, "one_point_per_level_with_debug_override"),
    layout_index_base: Math.round(numberValue(root.layout_index_base, 1)) === 0 ? 0 : 1,
    tree_columns: Math.max(1, Math.round(numberValue(root.tree_columns, 4))),
    tree_rows: treeRows,
    talent_icon_size: Math.max(48, Math.round(numberValue(root.talent_icon_size, 82))),
    row_unlock_points: rowUnlockPoints,
    talent_templates: asArray(root.talent_templates).map(normalizeTemplate),
    classes: asArray(root.classes).map(normalizeClass),
  });
}

export function formatTemplateText(template: TalentTemplate, talentClass: TalentClass, spec: TalentSpecialization, value: string) {
  const replacements: Record<string, string> = {
    class: talentClass.name || talentClass.id,
    spec: spec.name || spec.id,
    role: spec.role || "Specialization",
  };
  return value.replace(/\{(class|spec|role)\}/g, (_match, key: string) => replacements[key] ?? "");
}

export function talentTemplatesForSpec(workspace: TalentWorkspace, spec: TalentSpecialization) {
  const overrides = spec.talent_overrides ?? {};
  const inheritedTemplates =
    spec.inherit_global_templates === false
      ? []
      : workspace.talent_templates.map((template) => {
          const override = overrides[template.id] ?? {};
          return {
            ...template,
            ...override,
            id: template.id,
            source: "global" as const,
            base_template_id: template.id,
          };
        });
  const localTemplates = (spec.talent_templates ?? []).map((template) => ({
    ...template,
    source: "spec" as const,
    base_template_id: template.id,
  }));
  return [...inheritedTemplates, ...localTemplates];
}

export function treePointsRequiredForGridRow(workspace: Pick<TalentWorkspace, "row_unlock_points">, row: number) {
  const normalizedRow = Math.max(0, Math.round(numberValue(row, 0)));
  return Math.max(0, Math.round(numberValue(workspace.row_unlock_points[normalizedRow], normalizedRow * 5)));
}

function templateGridRow(workspace: Pick<TalentWorkspace, "layout_index_base">, template: Pick<TalentTemplate, "row">) {
  const offset = workspace.layout_index_base === 1 ? 1 : 0;
  return Math.max(0, Math.round(numberValue(template.row, 1)) - offset);
}

function templateWithImplicitRowRequirement(workspace: TalentWorkspace, template: TalentTemplate) {
  return {
    ...template,
    requires_tree_points: treePointsRequiredForGridRow(workspace, templateGridRow(workspace, template)),
  };
}

export function normalizeTalentRowRequirements(workspace: TalentWorkspace): TalentWorkspace {
  const talentTemplates = workspace.talent_templates.map((template) => templateWithImplicitRowRequirement(workspace, template));
  const globalTemplatesById = new Map(talentTemplates.map((template) => [template.id, template]));

  return {
    ...workspace,
    talent_templates: talentTemplates,
    classes: workspace.classes.map((talentClass) => ({
      ...talentClass,
      specializations: talentClass.specializations.map((spec) => {
        const nextSpec: TalentSpecialization = {
          ...spec,
          talent_templates: (spec.talent_templates ?? []).map((template) => templateWithImplicitRowRequirement(workspace, template)),
        };
        const nextOverrides: Record<string, TalentTemplateOverride> = {};
        for (const [templateId, override] of Object.entries(spec.talent_overrides ?? {})) {
          const baseTemplate = globalTemplatesById.get(templateId);
          if (!baseTemplate || (!hasOwn(override, "row") && !hasOwn(override, "requires_tree_points"))) {
            nextOverrides[templateId] = override;
            continue;
          }
          const mergedTemplate: TalentTemplate = { ...baseTemplate, ...override, id: templateId };
          nextOverrides[templateId] = {
            ...override,
            requires_tree_points: treePointsRequiredForGridRow(workspace, templateGridRow(workspace, mergedTemplate)),
          };
        }
        nextSpec.talent_overrides = nextOverrides;
        return nextSpec;
      }),
    })),
  };
}

export function expandTalentTemplate(workspace: TalentWorkspace, talentClass: TalentClass, spec: TalentSpecialization, template: TalentTemplate): ExpandedTalent {
  const rowOffset = workspace.layout_index_base === 1 ? 1 : 0;
  const row = Math.max(0, Math.round(numberValue(template.row, 1)) - rowOffset);
  const column = Math.max(0, Math.round(numberValue(template.column, 1)) - rowOffset);
  const requiredTemplateId = sanitizeTalentId(stringValue(template.requires_talent, ""));
  const specTemplates = talentTemplatesForSpec(workspace, spec);
  const requiredTemplate = specTemplates.find((entry) => entry.id === requiredTemplateId);
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
    rank_descriptions: stringArrayValue(template.rank_descriptions).map((description) => formatTemplateText(template, talentClass, spec, description)),
    row,
    column,
    display_row: Math.round(numberValue(template.row, row + rowOffset)),
    display_column: Math.round(numberValue(template.column, column + rowOffset)),
    requires_talent_id: requiredTemplateId ? `${talentClass.id}/${spec.id}/${requiredTemplateId}` : "",
    requires_rank: requiredTemplateId ? requiresRank : 0,
  };
}

export function expandedTalentsForSpec(workspace: TalentWorkspace, talentClass: TalentClass, spec: TalentSpecialization) {
  return talentTemplatesForSpec(workspace, spec)
    .map((template) => expandTalentTemplate(workspace, talentClass, spec, template))
    .sort((left, right) => {
      if (left.row !== right.row) return left.row - right.row;
      return left.column - right.column;
    });
}

export function templateRequirementText(workspace: TalentWorkspace, template: TalentTemplate, availableTemplates = workspace.talent_templates) {
  const requiredId = sanitizeTalentId(stringValue(template.requires_talent, ""));
  if (!requiredId) return "";
  const requiredTemplate = availableTemplates.find((entry) => entry.id === requiredId);
  const requiredName = requiredTemplate?.name || requiredId;
  const points = template.requires_talent_full && requiredTemplate ? Math.max(1, Math.round(numberValue(requiredTemplate.max_rank, 1))) : Math.max(1, Math.round(numberValue(template.requires_rank, 1)));
  return `Requires ${points} point${points === 1 ? "" : "s"} in ${requiredName}`;
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
    if (template.max_rank < 1) issues.push({ level: "error", message: `Talent "${template.id}" max points must be at least 1.` });
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

      for (const overrideId of Object.keys(spec.talent_overrides ?? {})) {
        if (!templateIds.has(overrideId)) {
          issues.push({ level: "warning", message: `Specialization "${talentClass.id}/${spec.id}" has an override for missing global talent "${overrideId}".` });
        }
      }

      const mergedTemplates = talentTemplatesForSpec(workspace, spec);
      const mergedIds = new Set<string>();
      for (const template of mergedTemplates) {
        const label = `${talentClass.id}/${spec.id}/${template.id}`;
        if (!template.id.trim()) issues.push({ level: "error", message: `Talent in "${talentClass.id}/${spec.id}" has no ID.` });
        if (mergedIds.has(template.id)) issues.push({ level: "error", message: `Duplicate talent ID "${template.id}" in "${talentClass.id}/${spec.id}".` });
        mergedIds.add(template.id);
        if (!template.name.trim()) issues.push({ level: "error", message: `Talent "${label}" needs a name.` });
        if (template.row < 1 || template.row > workspace.tree_rows) issues.push({ level: "warning", message: `Talent "${label}" is outside the configured row range.` });
        if (template.column < 1 || template.column > workspace.tree_columns) issues.push({ level: "warning", message: `Talent "${label}" is outside the configured column range.` });
        if (template.max_rank < 1) issues.push({ level: "error", message: `Talent "${label}" max points must be at least 1.` });
      }

      for (const template of mergedTemplates) {
        const label = `${talentClass.id}/${spec.id}/${template.id}`;
        if (template.requires_talent) {
          if (template.requires_talent === template.id) issues.push({ level: "error", message: `Talent "${label}" cannot require itself.` });
          if (!mergedIds.has(template.requires_talent)) {
            issues.push({ level: "error", message: `Talent "${label}" requires missing talent "${template.requires_talent}" in the same spec.` });
          }
        }
      }
    }
  }

  return issues;
}

export function stringifyTalentWorkspace(workspace: TalentWorkspace) {
  const normalizedWorkspace = normalizeTalentRowRequirements(workspace);

  function cleanTalentTemplate(template: TalentTemplate, preserveEmptyRequirement = false) {
    const next: TalentTemplateOverride = { ...template };
    delete next.source;
    delete next.base_template_id;
    const rankDescriptions = stringArrayValue(next.rank_descriptions).slice(0, Math.max(1, Math.round(numberValue(next.max_rank, 1))));
    while (rankDescriptions.length && !rankDescriptions[rankDescriptions.length - 1].trim()) {
      rankDescriptions.pop();
    }
    if (rankDescriptions.length) {
      next.rank_descriptions = rankDescriptions;
    } else {
      delete next.rank_descriptions;
    }
    if (!stringValue(next.icon, "").trim()) delete next.icon;
    if (hasOwn(next, "requires_talent")) {
      if (!stringValue(next.requires_talent, "").trim()) {
        if (preserveEmptyRequirement) {
          next.requires_talent = "";
        } else {
          delete next.requires_talent;
        }
        delete next.requires_talent_full;
        delete next.requires_rank;
      } else {
        if (next.requires_talent_full !== true) delete next.requires_talent_full;
        if (next.requires_talent_full === true || numberValue(next.requires_rank, 1) <= 1) delete next.requires_rank;
      }
    } else {
      delete next.requires_talent_full;
      delete next.requires_rank;
    }
    return next;
  }

  function cleanTalentOverrides(overrides: Record<string, TalentTemplateOverride> | undefined) {
    const out: Record<string, TalentTemplateOverride> = {};
    for (const [id, override] of Object.entries(overrides ?? {})) {
      const cleaned = cleanTalentTemplate(override as TalentTemplate, true);
      delete cleaned.id;
      if (Object.keys(cleaned).length) out[id] = cleaned;
    }
    return out;
  }

  const cleaned: TalentWorkspace = {
    ...normalizedWorkspace,
    talent_templates: normalizedWorkspace.talent_templates.map((template) => cleanTalentTemplate(template) as TalentTemplate),
    classes: normalizedWorkspace.classes.map((talentClass) => {
      const nextClass: TalentClass = {
        ...talentClass,
        specializations: talentClass.specializations.map((spec) => {
          const nextSpec: TalentSpecialization = { ...spec };
          if (!stringValue(nextSpec.icon, "").trim()) delete nextSpec.icon;
          if (nextSpec.inherit_global_templates !== false) delete nextSpec.inherit_global_templates;
          nextSpec.talent_templates = (nextSpec.talent_templates ?? []).map((template) => cleanTalentTemplate(template) as TalentTemplate);
          if (!nextSpec.talent_templates.length) delete nextSpec.talent_templates;
          nextSpec.talent_overrides = nextSpec.inherit_global_templates === false ? {} : cleanTalentOverrides(nextSpec.talent_overrides);
          if (!Object.keys(nextSpec.talent_overrides).length) delete nextSpec.talent_overrides;
          return nextSpec;
        }),
      };
      if (!stringValue(nextClass.icon, "").trim()) delete nextClass.icon;
      return nextClass;
    }),
  };
  return `${JSON.stringify(cleaned, null, "\t")}\n`;
}
