/**
 * Server text for a <Text>: strings pass through, numbers and booleans become strings, and anything else (null,
 * objects, arrays) becomes '' or a readable fallback instead of crashing React with "Objects are not valid as a
 * React child". No imports: tested with `node --test`.
 */
export function asText(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : fallback;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    // Common Frappe shapes: {name}, {label}, {role}, {title}.
    const o = v as Record<string, unknown>;
    for (const k of ['label', 'title', 'name', 'role', 'value']) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
  }
  return fallback;
}

/** A list of server values as non-empty display strings (non-arrays become []). */
export function asTextList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => asText(x)).filter(Boolean) : [];
}
