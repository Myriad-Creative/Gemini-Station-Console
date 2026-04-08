import generatorConfigData from "@lib/mod-auto-generator-config.json";
import namingConfigData from "@lib/mod-naming-schema.json";

export type ModNameThreatSign = "positive" | "negative";
export type ModNameSource = "phrase_override" | "two_word_fallback" | "prefixed_phrase_override" | "prefixed_fallback";

type NamingConfig = typeof namingConfigData;
type GeneratorConfig = typeof generatorConfigData;
type NamingSlotId = keyof NamingConfig["slot_component_seeds"] & string;
type NamingPrimaryStatId = keyof NamingConfig["primary_stat_naming"] & string;
type ThreatNamingProfile = {
  signed?: boolean;
  positive: {
    base_term: string;
    descriptor_seeds: string[];
  };
  negative: {
    base_term: string;
    descriptor_seeds: string[];
  };
};
type ThreatStringList = {
  positive: string[];
  negative: string[];
};

const RARITY_KEYS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
type NamingRarityKey = (typeof RARITY_KEYS)[number];

const SUPPORTED_NAMING_ORDER = new Set([
  "select_core_phrase_from_phrase_override_or_two_word_fallback",
  "check_uniqueness_within_batch_and_level_band",
  "reroll_unused_core_phrase_when_available",
  "apply_primary_stat_prefix_for_collision_or_rarity",
  "reroll_prefix_until_unique_or_pool_exhausted",
  "fallback_to_constructed_prefixed_name_if_needed",
]);

interface NamingProfile {
  baseTerm: string;
  descriptorSeeds: string[];
}

interface CoreCandidate {
  source: "phrase_override" | "two_word_fallback";
  corePhrase: string;
  descriptor?: string;
  baseTerm?: string;
  component?: string;
}

export interface GenerateModNameInput {
  slotId: string;
  primaryStatId: string;
  rarity: number;
  level: number;
  secondaryStatIds?: string[];
  threatSign?: ModNameThreatSign;
  seed?: number;
  batchIndex?: number;
}

export interface ModNamingExistingEntry {
  name: string;
  level: number;
  corePhrase?: string;
  selectedPrefix?: string;
}

export interface GeneratedModName {
  displayName: string;
  slotId: string;
  primaryStatId: string;
  rarity: number;
  level: number;
  source: ModNameSource;
  threatSign?: ModNameThreatSign;
  corePhrase: string;
  selectedPrefix?: string;
  descriptor?: string;
  baseTerm?: string;
  component?: string;
  modifier?: string;
  collisionResolved: boolean;
}

export interface GenerateModNameOptions {
  scope?: ModNamingScope;
  existingEntries?: Iterable<ModNamingExistingEntry>;
  existingNames?: Iterable<string>;
  batchNames?: Iterable<string>;
}

function validateAndFreezeNamingConfig(config: NamingConfig, generatorConfig: GeneratorConfig) {
  const errors = validateNamingConfig(config, generatorConfig);
  if (errors.length) {
    throw new Error(`Invalid mod naming config:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

const MOD_NAMING_CONFIG = validateAndFreezeNamingConfig(namingConfigData, generatorConfigData);

function validateNamingConfig(config: NamingConfig, generatorConfig: GeneratorConfig) {
  const errors: string[] = [];
  const validSlots = new Set(generatorConfig.slot_order);
  const validStats = new Set(generatorConfig.stat_order);

  if (!config.schema_version.trim()) errors.push("schema_version is required.");
  if (!config.config_name.trim()) errors.push("config_name is required.");
  if (config.normal_procedural_style.manufacturer_prefixes_enabled) {
    errors.push("manufacturer_prefixes_enabled must remain false.");
  }
  if (config.normal_procedural_style.program_names_enabled) {
    errors.push("program_names_enabled must remain false.");
  }

  for (const step of config.naming_order) {
    if (!SUPPORTED_NAMING_ORDER.has(step)) {
      errors.push(`naming_order contains unsupported step "${step}".`);
    }
  }

  if (!config.templates.two_word.includes("{descriptor}") || !config.templates.two_word.includes("{component}")) {
    errors.push("templates.two_word must contain {descriptor} and {component}.");
  }
  if (!config.templates.prefixed_phrase.includes("{prefix}") || !config.templates.prefixed_phrase.includes("{core_phrase}")) {
    errors.push("templates.prefixed_phrase must contain {prefix} and {core_phrase}.");
  }
  if (
    !config.templates.prefixed_two_word.includes("{prefix}") ||
    !config.templates.prefixed_two_word.includes("{descriptor}") ||
    !config.templates.prefixed_two_word.includes("{component}")
  ) {
    errors.push("templates.prefixed_two_word must contain {prefix}, {descriptor}, and {component}.");
  }
  if (
    !config.templates.prefixed_base_term.includes("{prefix}") ||
    !config.templates.prefixed_base_term.includes("{base_term}") ||
    !config.templates.prefixed_base_term.includes("{component}")
  ) {
    errors.push("templates.prefixed_base_term must contain {prefix}, {base_term}, and {component}.");
  }

  if (config.generation_preferences.prefix_source !== "primary_stat") {
    errors.push('generation_preferences.prefix_source must be "primary_stat".');
  }

  if (config.uniqueness_rules.scope !== "level_band_and_batch") {
    errors.push('uniqueness_rules.scope must be "level_band_and_batch".');
  }
  if (!Number.isFinite(config.uniqueness_rules.level_band_size) || config.uniqueness_rules.level_band_size <= 0) {
    errors.push("uniqueness_rules.level_band_size must be a positive number.");
  }

  for (const rarityKey of RARITY_KEYS) {
    const entry = config.prefix_usage_rules[rarityKey];
    if (!entry) {
      errors.push(`prefix_usage_rules is missing "${rarityKey}".`);
      continue;
    }
    if (!Number.isFinite(entry.use_prefix_if_unique_chance) || entry.use_prefix_if_unique_chance < 0 || entry.use_prefix_if_unique_chance > 1) {
      errors.push(`prefix_usage_rules["${rarityKey}"].use_prefix_if_unique_chance must be between 0 and 1.`);
    }
    if (!Number.isFinite(entry.use_prefix_on_collision) || entry.use_prefix_on_collision < 0 || entry.use_prefix_on_collision > 1) {
      errors.push(`prefix_usage_rules["${rarityKey}"].use_prefix_on_collision must be between 0 and 1.`);
    }
  }

  for (const [slotId, slotConfig] of Object.entries(config.slot_component_seeds)) {
    if (!validSlots.has(slotId)) {
      errors.push(`slot_component_seeds references unknown slot "${slotId}".`);
      continue;
    }
    if (!Array.isArray(slotConfig.terms) || !slotConfig.terms.length) {
      errors.push(`slot_component_seeds["${slotId}"] must define at least one term.`);
    }
    if ("preferred_mod_terms" in slotConfig && Array.isArray(slotConfig.preferred_mod_terms)) {
      for (const term of slotConfig.preferred_mod_terms) {
        if (!slotConfig.terms.includes(term)) {
          errors.push(`slot_component_seeds["${slotId}"].preferred_mod_terms contains "${term}" which is not in terms.`);
        }
      }
    }
  }

  for (const [statId, entry] of Object.entries(config.primary_stat_naming)) {
    if (!validStats.has(statId)) {
      errors.push(`primary_stat_naming references unknown stat "${statId}".`);
      continue;
    }
    if (isThreatNamingEntry(entry)) {
      if (!entry.positive.base_term.trim() || !entry.negative.base_term.trim()) {
        errors.push(`primary_stat_naming["${statId}"] must define positive and negative base_term values.`);
      }
      if (!entry.positive.descriptor_seeds.length || !entry.negative.descriptor_seeds.length) {
        errors.push(`primary_stat_naming["${statId}"] must define positive and negative descriptor seeds.`);
      }
    } else {
      if (!entry.base_term.trim()) errors.push(`primary_stat_naming["${statId}"].base_term is required.`);
      if (!entry.descriptor_seeds.length) errors.push(`primary_stat_naming["${statId}"] must define descriptor seeds.`);
    }
  }

  for (const [statId, entry] of Object.entries(config.leading_prefix_seeds)) {
    if (!validStats.has(statId)) {
      errors.push(`leading_prefix_seeds references unknown stat "${statId}".`);
      continue;
    }
    if (isThreatStringList(entry)) {
      if (!entry.positive.length || !entry.negative.length) {
        errors.push(`leading_prefix_seeds["${statId}"] must define positive and negative prefix seeds.`);
      }
    } else if (!Array.isArray(entry) || !entry.length) {
      errors.push(`leading_prefix_seeds["${statId}"] must define at least one prefix seed.`);
    }
  }

  for (const [slotId, entry] of Object.entries(config.phrase_overrides)) {
    if (!validSlots.has(slotId)) {
      errors.push(`phrase_overrides references unknown slot "${slotId}".`);
      continue;
    }

    for (const [statId, names] of Object.entries(entry)) {
      if (!validStats.has(statId)) {
        errors.push(`phrase_overrides["${slotId}"] references unknown stat "${statId}".`);
        continue;
      }

      if (Array.isArray(names)) {
        if (!names.length) errors.push(`phrase_overrides["${slotId}"]["${statId}"] must contain at least one phrase.`);
        continue;
      }

      if (typeof names === "object" && names) {
        const positive = (names as Record<string, unknown>).positive;
        const negative = (names as Record<string, unknown>).negative;
        if (positive !== undefined && (!Array.isArray(positive) || !positive.length)) {
          errors.push(`phrase_overrides["${slotId}"]["${statId}"].positive must contain at least one phrase.`);
        }
        if (negative !== undefined && (!Array.isArray(negative) || !negative.length)) {
          errors.push(`phrase_overrides["${slotId}"]["${statId}"].negative must contain at least one phrase.`);
        }
        if (positive === undefined && negative === undefined) {
          errors.push(`phrase_overrides["${slotId}"]["${statId}"] must define positive and/or negative phrase lists.`);
        }
        continue;
      }

      errors.push(`phrase_overrides["${slotId}"]["${statId}"] must be an array or signed branch object.`);
    }
  }

  return errors;
}

function isThreatNamingEntry(value: unknown): value is ThreatNamingProfile {
  return !!value && typeof value === "object" && "positive" in (value as Record<string, unknown>) && "negative" in (value as Record<string, unknown>);
}

function isThreatStringList(value: unknown): value is ThreatStringList {
  return !!value && typeof value === "object" && "positive" in (value as Record<string, unknown>) && "negative" in (value as Record<string, unknown>);
}

function normalizeDisplayName(value: string) {
  if (!MOD_NAMING_CONFIG.generation_preferences.title_case_output) {
    return value.replace(/\s+/g, " ").trim();
  }

  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => {
      if (!/^[a-z0-9-]+$/i.test(token)) return token;
      if (/[A-Z]/.test(token.slice(1))) return token;
      return token
        .split("-")
        .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part))
        .join("-");
    })
    .join(" ");
}

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeTokenRoot(token: string) {
  let value = normalizeToken(token);
  if (!value) return value;
  if (value.endsWith("ies") && value.length > 3) value = `${value.slice(0, -3)}y`;
  else if (value.endsWith("ing") && value.length > 4) value = value.slice(0, -3);
  else if (value.endsWith("ive") && value.length > 4) value = value.slice(0, -3);
  else if (value.endsWith("ed") && value.length > 3) value = value.slice(0, -2);
  else if (value.endsWith("es") && value.length > 3) value = value.slice(0, -2);
  else if (value.endsWith("s") && value.length > 2) value = value.slice(0, -1);
  return value;
}

function tokenize(value: string) {
  return value
    .split(/\s+/)
    .flatMap((token) => token.split("-"))
    .map((token) => token.trim())
    .filter(Boolean);
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableRoll(value: string) {
  return hashString(value) / 4294967295;
}

function rotateList<T>(values: T[], offset: number) {
  if (!values.length) return [];
  const normalizedOffset = offset % values.length;
  if (!normalizedOffset) return values.slice();
  return [...values.slice(normalizedOffset), ...values.slice(0, normalizedOffset)];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function renderTemplate(template: string, values: Record<string, string | undefined>) {
  return Object.entries(values).reduce((output, [key, value]) => output.replaceAll(`{${key}}`, value ?? ""), template);
}

function buildSeedKey(input: GenerateModNameInput, salt: string, extra: Array<string | number | undefined> = []) {
  return [
    salt,
    input.seed ?? "auto",
    input.batchIndex ?? 0,
    input.slotId,
    input.primaryStatId,
    input.rarity,
    input.level,
    input.threatSign ?? "neutral",
    ...(input.secondaryStatIds ?? []),
    ...extra,
  ].join("|");
}

function candidatePassesStyleRules(candidate: string, parts: { descriptor?: string; baseTerm?: string; component?: string; modifier?: string }) {
  const styleRules = MOD_NAMING_CONFIG.style_rules;
  if (styleRules.disallow_of_construction && /\bof\b/i.test(candidate)) {
    return false;
  }

  const tokens = tokenize(candidate);
  const normalizedTokens = tokens.map(normalizeToken).filter(Boolean);
  const rootTokens = tokens.map(normalizeTokenRoot).filter(Boolean);

  if (styleRules.disallow_duplicate_full_tokens && hasDuplicates(normalizedTokens)) {
    return false;
  }

  if (styleRules.disallow_duplicate_roots && hasDuplicates(rootTokens)) {
    return false;
  }

  const descriptorRoots = tokenize(parts.descriptor ?? "").map(normalizeTokenRoot).filter(Boolean);
  const modifierRoots = tokenize(parts.modifier ?? "").map(normalizeTokenRoot).filter(Boolean);
  const baseTermRoots = tokenize(parts.baseTerm ?? "").map(normalizeTokenRoot).filter(Boolean);
  const componentRoots = tokenize(parts.component ?? "").map(normalizeTokenRoot).filter(Boolean);
  const nonComponentRoots = [...descriptorRoots, ...modifierRoots, ...baseTermRoots];

  if (styleRules.disallow_component_repetition && componentRoots.some((root) => nonComponentRoots.includes(root))) {
    return false;
  }

  if (styleRules.avoid_descriptor_component_echo && [...descriptorRoots, ...modifierRoots].some((root) => componentRoots.includes(root))) {
    return false;
  }

  return true;
}

function resolveRarityKey(rarity: number): NamingRarityKey {
  if (!Number.isFinite(rarity) || rarity < 0 || rarity >= RARITY_KEYS.length) {
    throw new Error(`Invalid mod naming rarity "${rarity}".`);
  }
  return RARITY_KEYS[Math.floor(rarity)];
}

export function getModNamingLevelBand(level: number) {
  const bandSize = MOD_NAMING_CONFIG.uniqueness_rules.level_band_size;
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const start = Math.floor((normalizedLevel - 1) / bandSize) * bandSize + 1;
  const end = start + bandSize - 1;
  return `${start}-${end}`;
}

function resolvePrimaryNamingProfile(statId: string, threatSign?: ModNameThreatSign): NamingProfile {
  const entry = MOD_NAMING_CONFIG.primary_stat_naming[statId as NamingPrimaryStatId];
  if (!entry) {
    throw new Error(`Unknown primary stat "${statId}" for mod naming.`);
  }

  if (isThreatNamingEntry(entry)) {
    if (!threatSign) {
      throw new Error(`Threat sign is required for primary stat "${statId}".`);
    }
    const branch = threatSign === "negative" ? entry.negative : entry.positive;
    return {
      baseTerm: branch.base_term,
      descriptorSeeds: branch.descriptor_seeds,
    };
  }

  return {
    baseTerm: entry.base_term,
    descriptorSeeds: entry.descriptor_seeds,
  };
}

function resolvePhraseOverrides(slotId: string, primaryStatId: string, threatSign?: ModNameThreatSign) {
  const slotOverrides = MOD_NAMING_CONFIG.phrase_overrides[slotId as keyof typeof MOD_NAMING_CONFIG.phrase_overrides];
  if (!slotOverrides) return [];
  const entry = slotOverrides[primaryStatId as keyof typeof slotOverrides];
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  if (typeof entry === "object" && entry) {
    const branch = threatSign === "negative" ? (entry as Record<string, string[]>).negative : (entry as Record<string, string[]>).positive;
    return Array.isArray(branch) ? branch : [];
  }
  return [];
}

function resolveLeadingPrefixSeeds(primaryStatId: string, threatSign?: ModNameThreatSign) {
  const entry = MOD_NAMING_CONFIG.leading_prefix_seeds[primaryStatId as keyof typeof MOD_NAMING_CONFIG.leading_prefix_seeds];
  if (!entry) {
    throw new Error(`Unknown primary stat "${primaryStatId}" for leading prefixes.`);
  }
  if (isThreatStringList(entry)) {
    if (!threatSign) {
      throw new Error(`Threat sign is required for primary stat "${primaryStatId}".`);
    }
    return threatSign === "negative" ? entry.negative : entry.positive;
  }
  return entry;
}

function resolveSlotComponents(slotId: string) {
  const slotEntry = MOD_NAMING_CONFIG.slot_component_seeds[slotId as NamingSlotId];
  if (!slotEntry) {
    throw new Error(`Unknown slot "${slotId}" for mod naming.`);
  }

  const stylePreferred = slotId === "weapons" ? MOD_NAMING_CONFIG.style_rules.weapon_mod_component_preference : [];
  const preferred =
    "preferred_mod_terms" in slotEntry && Array.isArray(slotEntry.preferred_mod_terms)
      ? slotEntry.preferred_mod_terms
      : [];

  return uniqueStrings([...stylePreferred, ...preferred, ...slotEntry.terms]);
}

function buildPhraseCandidates(input: GenerateModNameInput) {
  const phrases = rotateList(
    uniqueStrings(resolvePhraseOverrides(input.slotId, input.primaryStatId, input.threatSign)),
    hashString(buildSeedKey(input, "phrase-override")) % Math.max(1, resolvePhraseOverrides(input.slotId, input.primaryStatId, input.threatSign).length || 1),
  );

  return phrases
    .map((phrase) => normalizeDisplayName(phrase))
    .filter(Boolean)
    .map<CoreCandidate>((corePhrase) => ({
      source: "phrase_override",
      corePhrase,
    }));
}

function buildTwoWordCandidates(input: GenerateModNameInput) {
  const namingProfile = resolvePrimaryNamingProfile(input.primaryStatId, input.threatSign);
  const descriptorSeeds = uniqueStrings(namingProfile.descriptorSeeds);
  const componentSeeds = resolveSlotComponents(input.slotId);
  const descriptors = rotateList(
    descriptorSeeds,
    hashString(buildSeedKey(input, "two-word-descriptor")) % Math.max(1, descriptorSeeds.length),
  );
  const components = rotateList(
    componentSeeds,
    hashString(buildSeedKey(input, "two-word-component")) % Math.max(1, componentSeeds.length),
  );

  const candidates: CoreCandidate[] = [];
  for (const descriptor of descriptors) {
    for (const component of components) {
      const corePhrase = normalizeDisplayName(renderTemplate(MOD_NAMING_CONFIG.templates.two_word, { descriptor, component }));
      if (!candidatePassesStyleRules(corePhrase, { descriptor, component })) {
        continue;
      }
      candidates.push({
        source: "two_word_fallback",
        corePhrase,
        descriptor,
        component,
        baseTerm: namingProfile.baseTerm,
      });
    }
  }

  return candidates;
}

function buildCoreCandidates(input: GenerateModNameInput) {
  const phraseCandidates = buildPhraseCandidates(input);
  if (phraseCandidates.length && MOD_NAMING_CONFIG.generation_preferences.use_phrase_override_when_available) {
    if (!MOD_NAMING_CONFIG.generation_preferences.allow_fallback_when_override_exists) {
      return phraseCandidates;
    }
    return [...phraseCandidates, ...buildTwoWordCandidates(input)];
  }
  return [...phraseCandidates, ...buildTwoWordCandidates(input)];
}

function buildPrefixedCandidates(input: GenerateModNameInput, coreCandidate: CoreCandidate) {
  const prefixes = uniqueStrings(resolveLeadingPrefixSeeds(input.primaryStatId, input.threatSign));
  const rotatedPrefixes = rotateList(
    prefixes,
    hashString(buildSeedKey(input, "prefix", [coreCandidate.corePhrase])) % Math.max(1, prefixes.length),
  );

  const candidates: GeneratedModName[] = [];
  for (const prefix of rotatedPrefixes) {
    if (coreCandidate.source === "phrase_override") {
      const displayName = normalizeDisplayName(
        renderTemplate(MOD_NAMING_CONFIG.templates.prefixed_phrase, {
          prefix,
          core_phrase: coreCandidate.corePhrase,
        }),
      );
      if (!candidatePassesStyleRules(displayName, { modifier: prefix })) {
        continue;
      }
      candidates.push({
        displayName,
        slotId: input.slotId,
        primaryStatId: input.primaryStatId,
        rarity: input.rarity,
        level: input.level,
        source: "prefixed_phrase_override",
        threatSign: input.threatSign,
        corePhrase: coreCandidate.corePhrase,
        selectedPrefix: prefix,
        collisionResolved: false,
      });
      continue;
    }

    if (coreCandidate.descriptor && coreCandidate.component) {
      const displayName = normalizeDisplayName(
        renderTemplate(MOD_NAMING_CONFIG.templates.prefixed_two_word, {
          prefix,
          descriptor: coreCandidate.descriptor,
          component: coreCandidate.component,
        }),
      );
      if (candidatePassesStyleRules(displayName, { modifier: prefix, descriptor: coreCandidate.descriptor, component: coreCandidate.component })) {
        candidates.push({
          displayName,
          slotId: input.slotId,
          primaryStatId: input.primaryStatId,
          rarity: input.rarity,
          level: input.level,
          source: "prefixed_fallback",
          threatSign: input.threatSign,
          corePhrase: coreCandidate.corePhrase,
          selectedPrefix: prefix,
          descriptor: coreCandidate.descriptor,
          component: coreCandidate.component,
          baseTerm: coreCandidate.baseTerm,
          collisionResolved: false,
        });
      }
    }

    if (coreCandidate.baseTerm && coreCandidate.component) {
      const displayName = normalizeDisplayName(
        renderTemplate(MOD_NAMING_CONFIG.templates.prefixed_base_term, {
          prefix,
          base_term: coreCandidate.baseTerm,
          component: coreCandidate.component,
        }),
      );
      if (
        candidatePassesStyleRules(displayName, {
          modifier: prefix,
          baseTerm: coreCandidate.baseTerm,
          component: coreCandidate.component,
        }) &&
        !candidates.some((candidate) => candidate.displayName === displayName)
      ) {
        candidates.push({
          displayName,
          slotId: input.slotId,
          primaryStatId: input.primaryStatId,
          rarity: input.rarity,
          level: input.level,
          source: "prefixed_fallback",
          threatSign: input.threatSign,
          corePhrase: coreCandidate.corePhrase,
          selectedPrefix: prefix,
          baseTerm: coreCandidate.baseTerm,
          component: coreCandidate.component,
          collisionResolved: false,
        });
      }
    }
  }

  return candidates;
}

function buildUnprefixedCandidate(input: GenerateModNameInput, coreCandidate: CoreCandidate): GeneratedModName {
  return {
    displayName: coreCandidate.corePhrase,
    slotId: input.slotId,
    primaryStatId: input.primaryStatId,
    rarity: input.rarity,
    level: input.level,
    source: coreCandidate.source,
    threatSign: input.threatSign,
    corePhrase: coreCandidate.corePhrase,
    descriptor: coreCandidate.descriptor,
    baseTerm: coreCandidate.baseTerm,
    component: coreCandidate.component,
    collisionResolved: false,
  };
}

function prioritizeByRule<T>(values: T[], isPreferred: (value: T) => boolean) {
  const preferred: T[] = [];
  const others: T[] = [];
  for (const value of values) {
    if (isPreferred(value)) preferred.push(value);
    else others.push(value);
  }
  return [...preferred, ...others];
}

export class ModNamingScope {
  private readonly bandNames = new Map<string, Set<string>>();
  private readonly bandCorePhrases = new Map<string, Set<string>>();
  private readonly bandPrefixedCorePairs = new Map<string, Set<string>>();
  private readonly batchNames = new Set<string>();
  private readonly lastUsed = new Map<string, number>();
  private usageIndex = 0;

  constructor(options?: { existingEntries?: Iterable<ModNamingExistingEntry>; batchNames?: Iterable<string> }) {
    for (const entry of options?.existingEntries ?? []) {
      this.registerExisting(entry);
    }
    for (const name of options?.batchNames ?? []) {
      const normalizedName = normalizeToken(name);
      if (normalizedName) this.batchNames.add(normalizedName);
    }
  }

  private registerExisting(entry: ModNamingExistingEntry) {
    const name = normalizeDisplayName(entry.name);
    const normalizedName = normalizeToken(name);
    if (!normalizedName) return;
    const bandKey = getModNamingLevelBand(entry.level);
    if (!this.bandNames.has(bandKey)) this.bandNames.set(bandKey, new Set());
    this.bandNames.get(bandKey)?.add(normalizedName);

    const normalizedCore = normalizeToken(entry.corePhrase ?? "");
    if (normalizedCore) {
      if (!this.bandCorePhrases.has(bandKey)) this.bandCorePhrases.set(bandKey, new Set());
      this.bandCorePhrases.get(bandKey)?.add(normalizedCore);
    }

    const normalizedPrefix = normalizeToken(entry.selectedPrefix ?? "");
    if (normalizedCore && normalizedPrefix) {
      if (!this.bandPrefixedCorePairs.has(bandKey)) this.bandPrefixedCorePairs.set(bandKey, new Set());
      this.bandPrefixedCorePairs.get(bandKey)?.add(`${normalizedPrefix}|${normalizedCore}`);
    }

    this.lastUsed.set(normalizedName, this.usageIndex);
    this.usageIndex += 1;
  }

  hasBatchName(name: string) {
    return this.batchNames.has(normalizeToken(name));
  }

  hasNameCollision(name: string, level: number) {
    const bandKey = getModNamingLevelBand(level);
    const normalizedName = normalizeToken(name);
    if (!normalizedName) return false;
    return this.batchNames.has(normalizedName) || this.bandNames.get(bandKey)?.has(normalizedName) || false;
  }

  isCorePhraseUsedInBand(corePhrase: string, level: number) {
    const bandKey = getModNamingLevelBand(level);
    const normalizedCore = normalizeToken(corePhrase);
    if (!normalizedCore) return false;
    return this.bandCorePhrases.get(bandKey)?.has(normalizedCore) || false;
  }

  isPrefixedCorePairUsedInBand(prefix: string, corePhrase: string, level: number) {
    const bandKey = getModNamingLevelBand(level);
    const normalizedPrefix = normalizeToken(prefix);
    const normalizedCore = normalizeToken(corePhrase);
    if (!normalizedPrefix || !normalizedCore) return false;
    return this.bandPrefixedCorePairs.get(bandKey)?.has(`${normalizedPrefix}|${normalizedCore}`) || false;
  }

  getLastUsedOrder(name: string) {
    const normalizedName = normalizeToken(name);
    return this.lastUsed.get(normalizedName) ?? Number.NEGATIVE_INFINITY;
  }

  record(candidate: GeneratedModName) {
    const bandKey = getModNamingLevelBand(candidate.level);
    const normalizedName = normalizeToken(candidate.displayName);
    if (!normalizedName) return;

    if (!this.bandNames.has(bandKey)) this.bandNames.set(bandKey, new Set());
    this.bandNames.get(bandKey)?.add(normalizedName);
    this.batchNames.add(normalizedName);

    const normalizedCore = normalizeToken(candidate.corePhrase);
    if (normalizedCore) {
      if (!this.bandCorePhrases.has(bandKey)) this.bandCorePhrases.set(bandKey, new Set());
      this.bandCorePhrases.get(bandKey)?.add(normalizedCore);
    }

    const normalizedPrefix = normalizeToken(candidate.selectedPrefix ?? "");
    if (normalizedCore && normalizedPrefix) {
      if (!this.bandPrefixedCorePairs.has(bandKey)) this.bandPrefixedCorePairs.set(bandKey, new Set());
      this.bandPrefixedCorePairs.get(bandKey)?.add(`${normalizedPrefix}|${normalizedCore}`);
    }

    this.lastUsed.set(normalizedName, this.usageIndex);
    this.usageIndex += 1;
  }
}

export function createModNamingScope(options?: { existingEntries?: Iterable<ModNamingExistingEntry>; batchNames?: Iterable<string> }) {
  return new ModNamingScope(options);
}

function createScopeFromOptions(options?: GenerateModNameOptions) {
  return (
    options?.scope ??
    createModNamingScope({
      existingEntries: options?.existingEntries,
      batchNames: [...Array.from(options?.existingNames ?? []), ...Array.from(options?.batchNames ?? [])],
    })
  );
}

function chooseCoreCandidates(input: GenerateModNameInput, scope: ModNamingScope) {
  const candidates = buildCoreCandidates(input);
  const deduped = candidates.filter(
    (candidate, index) =>
      candidates.findIndex(
        (entry) =>
          entry.source === candidate.source &&
          entry.corePhrase === candidate.corePhrase &&
          (entry.descriptor ?? "") === (candidate.descriptor ?? "") &&
          (entry.baseTerm ?? "") === (candidate.baseTerm ?? "") &&
          (entry.component ?? "") === (candidate.component ?? ""),
      ) === index,
  );

  if (!MOD_NAMING_CONFIG.uniqueness_rules.avoid_same_core_phrase_within_band_when_alternatives_exist) {
    return deduped;
  }

  return prioritizeByRule(deduped, (candidate) => !scope.isCorePhraseUsedInBand(candidate.corePhrase, input.level));
}

function choosePrefixedCandidates(input: GenerateModNameInput, scope: ModNamingScope, coreCandidate: CoreCandidate) {
  const candidates = buildPrefixedCandidates(input, coreCandidate);
  if (!MOD_NAMING_CONFIG.uniqueness_rules.avoid_same_prefix_with_same_core_phrase_within_band_when_alternatives_exist) {
    return candidates;
  }

  return prioritizeByRule(
    candidates,
    (candidate) => !candidate.selectedPrefix || !scope.isPrefixedCorePairUsedInBand(candidate.selectedPrefix, candidate.corePhrase, input.level),
  );
}

function shouldUsePrefixWhenUnique(input: GenerateModNameInput) {
  const rarityKey = resolveRarityKey(input.rarity);
  const chance = MOD_NAMING_CONFIG.prefix_usage_rules[rarityKey].use_prefix_if_unique_chance;
  return stableRoll(buildSeedKey(input, "prefix-if-unique")) < chance;
}

function shouldUsePrefixOnCollision(input: GenerateModNameInput) {
  const rarityKey = resolveRarityKey(input.rarity);
  const chance = MOD_NAMING_CONFIG.prefix_usage_rules[rarityKey].use_prefix_on_collision;
  return stableRoll(buildSeedKey(input, "prefix-on-collision")) < chance;
}

function chooseLeastRecentlyUsedCandidate(candidates: GeneratedModName[], input: GenerateModNameInput, scope: ModNamingScope) {
  const available = candidates.filter((candidate) => !scope.hasBatchName(candidate.displayName));
  if (!available.length) return null;
  const rotated = rotateList(
    available,
    hashString(buildSeedKey(input, "least-recently-used")) % Math.max(1, available.length),
  );
  return rotated.reduce((best, candidate) => {
    if (!best) return candidate;
    return scope.getLastUsedOrder(candidate.displayName) < scope.getLastUsedOrder(best.displayName) ? candidate : best;
  }, null as GeneratedModName | null);
}

function validateNamingInput(input: GenerateModNameInput) {
  if (!MOD_NAMING_CONFIG.slot_component_seeds[input.slotId as NamingSlotId]) {
    throw new Error(`Invalid mod naming slot "${input.slotId}".`);
  }
  if (!MOD_NAMING_CONFIG.primary_stat_naming[input.primaryStatId as NamingPrimaryStatId]) {
    throw new Error(`Invalid mod naming primary stat "${input.primaryStatId}".`);
  }
  if (!Number.isFinite(input.rarity)) {
    throw new Error("Mod naming rarity must be numeric.");
  }
  if (!Number.isFinite(input.level) || input.level <= 0) {
    throw new Error("Mod naming level must be a positive number.");
  }
  for (const secondaryStatId of input.secondaryStatIds ?? []) {
    if (!MOD_NAMING_CONFIG.primary_stat_naming[secondaryStatId as NamingPrimaryStatId]) {
      throw new Error(`Invalid mod naming secondary stat "${secondaryStatId}".`);
    }
  }
  if ([input.primaryStatId, ...(input.secondaryStatIds ?? [])].includes("threat_generation") && !input.threatSign) {
    throw new Error("Threat sign is required when threat_generation is present in mod naming input.");
  }
}

function generateModNameInternal(input: GenerateModNameInput, scope: ModNamingScope) {
  validateNamingInput(input);

  const coreCandidates = chooseCoreCandidates(input, scope);
  if (!coreCandidates.length) {
    throw new Error(`No valid core phrases could be generated for slot "${input.slotId}" and primary stat "${input.primaryStatId}".`);
  }

  const prefixRequiredByRarity =
    MOD_NAMING_CONFIG.generation_preferences.prefix_can_be_used_even_if_unique_based_on_rarity &&
    shouldUsePrefixWhenUnique(input);

  let collisionResolved = false;

  if (!prefixRequiredByRarity) {
    for (const coreCandidate of coreCandidates) {
      const candidate = buildUnprefixedCandidate(input, coreCandidate);
      if (!scope.hasNameCollision(candidate.displayName, input.level)) {
        scope.record(candidate);
        return candidate;
      }
      collisionResolved = true;
    }
  }

  const prefixedCandidates: GeneratedModName[] = [];
  const canPrefix =
    prefixRequiredByRarity ||
    (MOD_NAMING_CONFIG.generation_preferences.prefix_on_collision_before_allowing_reuse && shouldUsePrefixOnCollision(input));

  if (canPrefix) {
    for (const coreCandidate of coreCandidates) {
      for (const candidate of choosePrefixedCandidates(input, scope, coreCandidate)) {
        prefixedCandidates.push(candidate);
        if (!scope.hasNameCollision(candidate.displayName, input.level)) {
          const resolved = {
            ...candidate,
            collisionResolved,
          };
          scope.record(resolved);
          return resolved;
        }
        collisionResolved = true;
      }
    }
  }

  const reusePool = [
    ...(!prefixRequiredByRarity ? coreCandidates.map((candidate) => buildUnprefixedCandidate(input, candidate)) : []),
    ...prefixedCandidates,
  ];

  const leastRecentlyUsed = chooseLeastRecentlyUsedCandidate(reusePool, input, scope);
  if (leastRecentlyUsed) {
    const resolved = {
      ...leastRecentlyUsed,
      collisionResolved: true,
    };
    scope.record(resolved);
    return resolved;
  }

  throw new Error(`No valid mod names could be generated for slot "${input.slotId}" and primary stat "${input.primaryStatId}".`);
}

export function getModNamingConfig() {
  return MOD_NAMING_CONFIG;
}

export function generateModDisplayName(input: GenerateModNameInput, options?: GenerateModNameOptions) {
  return generateModNameInternal(
    {
      ...input,
      secondaryStatIds: uniqueStrings(input.secondaryStatIds ?? []),
    },
    createScopeFromOptions(options),
  );
}

export function generateModDisplayNames(inputs: GenerateModNameInput[], options?: GenerateModNameOptions) {
  const scope = createScopeFromOptions(options);
  return inputs.map((input, index) =>
    generateModNameInternal(
      {
        ...input,
        batchIndex: input.batchIndex ?? index,
        secondaryStatIds: uniqueStrings(input.secondaryStatIds ?? []),
      },
      scope,
    ),
  );
}
