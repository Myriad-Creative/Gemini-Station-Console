export type JsonRecord = Record<string, unknown>;

export type TalentTemplate = JsonRecord & {
  id: string;
  name: string;
  description: string;
  rank_descriptions?: string[];
  row: number;
  column: number;
  max_rank: number;
  requires_tree_points: number;
  requires_talent?: string;
  requires_talent_full?: boolean;
  requires_rank?: number;
  icon?: string;
  source?: "global" | "spec";
  base_template_id?: string;
};

export type TalentTemplateOverride = JsonRecord & Partial<Omit<TalentTemplate, "source" | "base_template_id">>;

export type TalentSpecialization = JsonRecord & {
  id: string;
  name: string;
  role: string;
  description: string;
  icon?: string;
  inherit_global_templates?: boolean;
  talent_templates?: TalentTemplate[];
  talent_overrides?: Record<string, TalentTemplateOverride>;
};

export type TalentClass = JsonRecord & {
  id: string;
  name: string;
  description: string;
  icon?: string;
  specializations: TalentSpecialization[];
};

export type TalentWorkspace = JsonRecord & {
  point_model: string;
  layout_index_base: number;
  tree_columns: number;
  tree_rows: number;
  talent_icon_size: number;
  row_unlock_points: number[];
  talent_templates: TalentTemplate[];
  classes: TalentClass[];
};

export type ExpandedTalent = TalentTemplate & {
  talent_id: string;
  template_id: string;
  class_id: string;
  class_name: string;
  spec_id: string;
  spec_name: string;
  role: string;
  display_row: number;
  display_column: number;
  requires_talent_id: string;
  requires_rank: number;
};

export type TalentIconOption = {
  fileName: string;
  relativePath: string;
  resPath: string;
  category: string;
};

export type TalentValidationIssue = {
  level: "error" | "warning";
  message: string;
};
