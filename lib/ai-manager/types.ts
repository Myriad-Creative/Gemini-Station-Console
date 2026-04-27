export type AiJsonValue = null | boolean | number | string | AiJsonValue[] | { [key: string]: AiJsonValue };

export type AiAbilityRef = {
  id: string;
  weight?: number | null;
  cooldownPriority?: string | null;
};

export type AiProfileSummary = {
  totalProfiles: number;
  parseErrors: number;
  profilesWithScripts: number;
  profilesUsedByMobs: number;
  referencedByMobsOnly: string[];
};

export type AiProfile = {
  key: string;
  fileName: string;
  relativePath: string;
  id: string;
  aiType: string;
  script: string | null;
  aggroRange: number | null;
  weaponRange: number | null;
  mainAbilities: AiAbilityRef[];
  secondaryAbilities: AiAbilityRef[];
  behaviorSections: string[];
  movementKeys: string[];
  combatKeys: string[];
  aliases: string[];
  referencedByMobCount: number;
  referencedByMobIds: string[];
  parseError: string | null;
  rawJson: string;
  data: AiJsonValue | null;
};

export type AiProfilesResponse = {
  ok: boolean;
  sourceRoot: string | null;
  aiDirectory: string | null;
  summary: AiProfileSummary;
  profiles: AiProfile[];
  error?: string;
};
