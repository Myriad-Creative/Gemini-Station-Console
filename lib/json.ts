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

export function parseLooseJson<T = unknown>(input: string): T {
  const cleaned = input.replace(/^\uFEFF/, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch (strictError) {
    const relaxed = stripTrailingCommas(cleaned);
    if (relaxed === cleaned) throw strictError;
    return JSON.parse(relaxed) as T;
  }
}
