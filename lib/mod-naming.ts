import generatorConfigData from "@lib/mod-auto-generator-config.json";
import namingConfigData from "@lib/mod-naming-schema.json";

export type ModNameThreatSign = "positive" | "negative";
export type ModNameSource = "phrase_override" | "two_word_fallback" | "three_word_fallback";

type NamingConfig = typeof namingConfigData;
type GeneratorConfig = typeof generatorConfigData;
type NamingSlotId = keyof NamingConfig["slot_component_seeds"] & string;
type NamingPrimaryStatId = keyof NamingConfig["primary_stat_naming"] & string;

export interface GenerateModNameInput {
  slotId: string;
  primaryStatId: string;
  rarity: number;
  secondaryStatIds?: string[];
  threatSign?: ModNameThreatSign;
  seed?: number;
  batchIndex?: number;
}

export interface GeneratedModName {
  displayName: string;
  slotId: string;
  primaryStatId: string;
  rarity: number;
  source: ModNameSource;
  threatSign?: ModNameThreatSign;
  phrase?: string;
  descriptor?: string;
  baseTerm?: string;
  component?: string;
  modifier?: string;
}

type NamingProfile = {
  baseTerm: string;
  descriptorSeeds: string[];
};

type ModNameCandidate = GeneratedModName;

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

const SUPPORTED_NAMING_ORDER = new Set([
  "phrase_override_by_slot_and_primary_stat",
  "fallback_two_word_name",
  "optional_three_word_name_for_higher_rarity",
]);

// Inference: the naming schema reserves three-word names for "higher rarity" but
// does not define the numeric threshold, so this implementation treats Rare+
// (the current 0..4 mod scale's top three tiers) as the higher-rarity range.
const HIGHER_RARITY_MIN = 2;

const MOD_NAMING_CONFIG = validateAndFreezeNamingConfig(namingConfigData, generatorConfigData);

function validateAndFreezeNamingConfig(config: NamingConfig, generatorConfig: GeneratorConfig) {
  const errors = validateNamingConfig(config, generatorConfig);
  if (errors.length) {
    throw new Error(`Invalid mod naming config:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

function validateNamingConfig(config: NamingConfig, generatorConfig: GeneratorConfig) {
  const errors: string[] = [];
  const validSlots = new Set(generatorConfig.slot_order);
  const validStats = new Set(generatorConfig.stat_order);

  if (!config.schema_version.trim()) errors.push("schema_version is required.");
  if (!config.config_name.trim()) errors.push("config_name is required.");

  for (const step of config.naming_order) {
    if (!SUPPORTED_NAMING_ORDER.has(step)) {
      errors.push(`naming_order contains unsupported step "${step}".`);
    }
  }

  if (!config.templates.two_word.includes("{descriptor}") || !config.templates.two_word.includes("{component}")) {
    errors.push("templates.two_word must contain {descriptor} and {component}.");
  }
  if (
    !config.templates.three_word.includes("{modifier}") ||
    !config.templates.three_word.includes("{base_term}") ||
    !config.templates.three_word.includes("{component}")
  ) {
    errors.push("templates.three_word must contain {modifier}, {base_term}, and {component}.");
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

function rotateList<T>(values: T[], offset: number) {
  if (!values.length) return [];
  const normalizedOffset = offset % values.length;
  if (!normalizedOffset) return values.slice();
  return [...values.slice(normalizedOffset), ...values.slice(0, normalizedOffset)];
}

function buildSeedKey(input: GenerateModNameInput, salt: string) {
  return [
    salt,
    input.seed ?? "auto",
    input.batchIndex ?? 0,
    input.slotId,
    input.primaryStatId,
    input.rarity,
    input.threatSign ?? "neutral",
    ...(input.secondaryStatIds ?? []),
  ].join("|");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function renderTemplate(template: string, values: Record<string, string | undefined>) {
  return Object.entries(values).reduce((output, [key, value]) => output.replaceAll(`{${key}}`, value ?? ""), template);
}

function isHigherRarity(rarity: number) {
  return rarity >= HIGHER_RARITY_MIN;
}

function resolvePrimaryNamingProfile(statId: string, threatSign?: ModNameThreatSign): NamingProfile {
  const entry = MOD_NAMING_CONFIG.primary_stat_naming[statId as NamingPrimaryStatId];
  if (!entry) {
    throw new Error(`Unknown primary stat "${statId}" for mod naming.`);
  }

  if (isThreatNamingEntry(entry)) {
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

function buildPhraseCandidates(input: GenerateModNameInput) {
  const phrases = resolvePhraseOverrides(input.slotId, input.primaryStatId, input.threatSign);
  return phrases
    .map((phrase) => normalizeDisplayName(phrase))
    .filter(Boolean)
    .map<ModNameCandidate>((phrase) => ({
      displayName: phrase,
      slotId: input.slotId,
      primaryStatId: input.primaryStatId,
      rarity: input.rarity,
      source: "phrase_override",
      threatSign: input.threatSign,
      phrase,
    }));
}

function buildTwoWordCandidates(input: GenerateModNameInput) {
  const namingProfile = resolvePrimaryNamingProfile(input.primaryStatId, input.threatSign);
  const descriptorSeeds = rotateList(
    uniqueStrings(namingProfile.descriptorSeeds),
    hashString(buildSeedKey(input, "two-word-descriptor")) % Math.max(1, namingProfile.descriptorSeeds.length),
  );
  const components = rotateList(
    resolveSlotComponents(input.slotId),
    hashString(buildSeedKey(input, "two-word-component")) % Math.max(1, resolveSlotComponents(input.slotId).length),
  );

  const candidates: ModNameCandidate[] = [];
  for (const descriptor of descriptorSeeds) {
    for (const component of components) {
      const displayName = normalizeDisplayName(renderTemplate(MOD_NAMING_CONFIG.templates.two_word, { descriptor, component }));
      const candidate: ModNameCandidate = {
        displayName,
        slotId: input.slotId,
        primaryStatId: input.primaryStatId,
        rarity: input.rarity,
        source: "two_word_fallback",
        threatSign: input.threatSign,
        descriptor,
        component,
      };
      if (candidatePassesStyleRules(displayName, { descriptor, component })) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function buildThreeWordCandidates(input: GenerateModNameInput) {
  const namingProfile = resolvePrimaryNamingProfile(input.primaryStatId, input.threatSign);
  const components = rotateList(
    resolveSlotComponents(input.slotId),
    hashString(buildSeedKey(input, "three-word-component")) % Math.max(1, resolveSlotComponents(input.slotId).length),
  );

  const modifierSeeds: string[] = [];
  for (const source of MOD_NAMING_CONFIG.generation_preferences.three_word_modifier_source_priority) {
    if (source === "secondary_stat_descriptor") {
      for (const secondaryStatId of input.secondaryStatIds ?? []) {
        const profile = resolvePrimaryNamingProfile(secondaryStatId, secondaryStatId === "threat_generation" ? input.threatSign : undefined);
        modifierSeeds.push(...profile.descriptorSeeds);
      }
    }
    if (source === "primary_stat_descriptor") {
      modifierSeeds.push(...namingProfile.descriptorSeeds);
    }
  }

  const uniqueModifiers = rotateList(
    uniqueStrings(modifierSeeds),
    hashString(buildSeedKey(input, "three-word-modifier")) % Math.max(1, modifierSeeds.length || 1),
  );

  const candidates: ModNameCandidate[] = [];
  for (const modifier of uniqueModifiers) {
    for (const component of components) {
      const displayName = normalizeDisplayName(
        renderTemplate(MOD_NAMING_CONFIG.templates.three_word, {
          modifier,
          base_term: namingProfile.baseTerm,
          component,
        }),
      );

      const candidate: ModNameCandidate = {
        displayName,
        slotId: input.slotId,
        primaryStatId: input.primaryStatId,
        rarity: input.rarity,
        source: "three_word_fallback",
        threatSign: input.threatSign,
        modifier,
        baseTerm: namingProfile.baseTerm,
        component,
      };

      if (candidatePassesStyleRules(displayName, { modifier, baseTerm: namingProfile.baseTerm, component })) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function pickCandidate(candidates: ModNameCandidate[], input: GenerateModNameInput, usedNames: Set<string>, salt: string) {
  if (!candidates.length) return null;

  const rotated = rotateList(candidates, hashString(buildSeedKey(input, salt)) % candidates.length);
  const unused = rotated.find((candidate) => !usedNames.has(candidate.displayName.toLowerCase()));
  return unused ?? rotated[0];
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

  for (const secondaryStatId of input.secondaryStatIds ?? []) {
    if (!MOD_NAMING_CONFIG.primary_stat_naming[secondaryStatId as NamingPrimaryStatId]) {
      throw new Error(`Invalid mod naming secondary stat "${secondaryStatId}".`);
    }
  }

  if ([input.primaryStatId, ...(input.secondaryStatIds ?? [])].includes("threat_generation") && !input.threatSign) {
    throw new Error("Threat sign is required when threat_generation is present in mod naming input.");
  }
}

function generateModNameInternal(input: GenerateModNameInput, usedNames: Set<string>) {
  validateNamingInput(input);

  const phraseCandidates = buildPhraseCandidates(input);
  if (MOD_NAMING_CONFIG.generation_preferences.use_phrase_override_when_available && phraseCandidates.length) {
    const selected = pickCandidate(phraseCandidates, input, usedNames, "phrase-override");
    if (selected) {
      usedNames.add(selected.displayName.toLowerCase());
      return selected;
    }
  }

  const twoWordCandidates = buildTwoWordCandidates(input);
  const canUseThreeWord =
    MOD_NAMING_CONFIG.generation_preferences.three_word_names_reserved_for_higher_rarity &&
    isHigherRarity(input.rarity) &&
    (input.secondaryStatIds?.length ?? 0) > 0;
  const threeWordCandidates = canUseThreeWord ? buildThreeWordCandidates(input) : [];

  const selectedThreeWord = canUseThreeWord ? pickCandidate(threeWordCandidates, input, usedNames, "three-word") : null;
  if (selectedThreeWord) {
    usedNames.add(selectedThreeWord.displayName.toLowerCase());
    return selectedThreeWord;
  }

  const selectedTwoWord = pickCandidate(twoWordCandidates, input, usedNames, "two-word");
  if (selectedTwoWord) {
    usedNames.add(selectedTwoWord.displayName.toLowerCase());
    return selectedTwoWord;
  }

  throw new Error(`No valid mod names could be generated for slot "${input.slotId}" and primary stat "${input.primaryStatId}".`);
}

export function getModNamingConfig() {
  return MOD_NAMING_CONFIG;
}

export function generateModDisplayName(input: GenerateModNameInput, options?: { existingNames?: Iterable<string> }) {
  const usedNames = new Set(
    Array.from(options?.existingNames ?? [])
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  );
  return generateModNameInternal(
    {
      ...input,
      secondaryStatIds: uniqueStrings(input.secondaryStatIds ?? []),
    },
    usedNames,
  );
}

export function generateModDisplayNames(inputs: GenerateModNameInput[], options?: { existingNames?: Iterable<string> }) {
  const usedNames = new Set(
    Array.from(options?.existingNames ?? [])
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  );

  return inputs.map((input, index) =>
    generateModNameInternal(
      {
        ...input,
        batchIndex: input.batchIndex ?? index,
        secondaryStatIds: uniqueStrings(input.secondaryStatIds ?? []),
      },
      usedNames,
    ),
  );
}
