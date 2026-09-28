/**
 * Stable state hash (seam 5). Two machines agree on a game exactly when they
 * agree on this string.
 *
 * `canonicalJson` sorts object keys, so property insertion order never matters,
 * and refuses anything that could differ between engines or break a JSON round
 * trip: non-integer numbers, NaN, Infinity, undefined values, functions.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new Error(`State may hold only safe integers, found ${value}`);
      }
      return Object.is(value, -0) ? '0' : String(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const item = record[key];
        if (item === undefined) throw new Error(`State field "${key}" is undefined; omit it or use null`);
        parts.push(`${JSON.stringify(key)}:${canonicalJson(item)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error(`State may not hold a ${typeof value}`);
  }
}

/** Two independent 32-bit FNV-1a lanes over UTF-16 code units, as 16 hex chars. */
export function hashString(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x2545f491;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x01000193) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Hash of any JSON-safe value, e.g. a whole State. */
export function hashState(state: unknown): string {
  return hashString(canonicalJson(state));
}
