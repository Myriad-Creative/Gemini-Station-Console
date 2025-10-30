export function parseTresFields(source: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let valRaw = m[2];
    valRaw = valRaw.replace(/#.*$/, "").trim();
    if (valRaw.startsWith('"') && valRaw.endsWith('"')) {
      out[key] = valRaw.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(valRaw)) {
      out[key] = Number(valRaw);
    } else if (valRaw === "true" || valRaw === "false") {
      out[key] = valRaw === "true";
    }
  }
  return out;
}
