import JSON5 from "json5";
import type { MissionParseStrategy } from "@lib/mission-lab/types";

export interface MissionParseResult {
  value: unknown | null;
  strictJsonValid: boolean;
  parseStrategy: MissionParseStrategy;
  warnings: string[];
  errors: string[];
}

function stripTrailingCommas(input: string) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }

    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < input.length && /\s/.test(input[lookahead])) lookahead += 1;
      const next = input[lookahead];
      if (next === "}" || next === "]") continue;
    }

    output += char;
  }

  return output;
}

function stripBom(input: string) {
  return input.replace(/^\uFEFF/, "");
}

function stripInvalidControlCharacters(input: string) {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u2028\u2029]/g, " ");
}

function escapeLineBreaksInsideStrings(input: string) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (!inString) {
      output += char;
      if (char === "\"") inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      output += char;
      inString = false;
      continue;
    }

    if (char === "\r") {
      if (input[index + 1] === "\n") index += 1;
      output += "\\n";
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }

    output += char;
  }

  return output;
}

function formatParseError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function parseMissionJsonText(input: string): MissionParseResult {
  const warnings: string[] = [];
  const normalizedInput = stripBom(input);
  if (normalizedInput !== input) warnings.push("Removed UTF-8 BOM.");

  try {
    return {
      value: JSON.parse(normalizedInput),
      strictJsonValid: true,
      parseStrategy: "strict",
      warnings,
      errors: [],
    };
  } catch (strictError) {
    warnings.push(`Strict JSON parse failed: ${formatParseError(strictError)}`);
  }

  try {
    return {
      value: JSON5.parse(normalizedInput),
      strictJsonValid: false,
      parseStrategy: "json5",
      warnings,
      errors: [],
    };
  } catch {}

  const withoutControlCharacters = stripInvalidControlCharacters(normalizedInput);
  if (withoutControlCharacters !== normalizedInput) {
    warnings.push("Removed invalid control characters before tolerant parse.");
  }

  const repairedLineBreaks = escapeLineBreaksInsideStrings(withoutControlCharacters);
  if (repairedLineBreaks !== withoutControlCharacters) {
    warnings.push("Escaped raw line breaks inside quoted strings before tolerant parse.");
  }

  const withoutTrailingCommas = stripTrailingCommas(repairedLineBreaks);
  if (withoutTrailingCommas !== repairedLineBreaks) {
    warnings.push("Removed trailing commas before tolerant parse.");
  }

  try {
    return {
      value: JSON5.parse(withoutTrailingCommas),
      strictJsonValid: false,
      parseStrategy: "repaired",
      warnings,
      errors: [],
    };
  } catch (repairError) {
    return {
      value: null,
      strictJsonValid: false,
      parseStrategy: "failed",
      warnings,
      errors: [`Tolerant parse failed: ${formatParseError(repairError)}`],
    };
  }
}
