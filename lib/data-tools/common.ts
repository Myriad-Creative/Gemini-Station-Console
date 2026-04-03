export function createDraftKey(prefix: string) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function parseExtraJsonObject(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export function parseJsonValue<T>(value: string, label: string): T {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be blank.`);
  }
  return JSON.parse(trimmed) as T;
}

export function parseOptionalJsonValue<T>(value: string): T | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as T;
}

export function objectWithoutKeys(value: Record<string, unknown>, keys: string[]) {
  const clone: Record<string, unknown> = { ...value };
  for (const key of keys) delete clone[key];
  return clone;
}

export function toNumberString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? ""));
}

export function createUniqueId(baseId: string, existingIds: string[]) {
  const normalizedBase = baseId.trim() || "new_entry";
  const taken = new Set(existingIds.map((id) => id.trim()).filter(Boolean));
  if (!taken.has(normalizedBase)) return normalizedBase;
  let index = 2;
  while (taken.has(`${normalizedBase}_${index}`)) index += 1;
  return `${normalizedBase}_${index}`;
}

export function copySnippetWithKey(key: string, value: unknown) {
  return JSON.stringify({ [key]: value }, null, 2);
}

export function setAtIndex<T>(items: T[], index: number, nextValue: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
}

export function removeAtIndex<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function insertAfterIndex<T>(items: T[], index: number | null, nextValue: T) {
  if (index === null || index < 0 || index >= items.length) return [...items, nextValue];
  return [...items.slice(0, index + 1), nextValue, ...items.slice(index + 1)];
}

export function duplicateIdMap(items: Array<{ id: string; key: string }>) {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const id = item.id.trim();
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), item.key]);
  }
  const duplicates = new Map<string, string[]>();
  for (const [id, keys] of grouped.entries()) {
    if (keys.length > 1) duplicates.set(id, keys);
  }
  return duplicates;
}
