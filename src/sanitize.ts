const MAX_STRING_LENGTH = 16_384;
const TRUNCATION_MARKER = "\n…[truncated]";

// Strip ASCII control characters (except tab/newline/CR), DEL, and Unicode
// directional markers / BiDi override / isolate ranges that can be used as
// invisible prompt-injection vectors when text flows back to the LLM.
// Covered: U+061C (ALM), U+200E/U+200F (LRM/RLM), U+202A-U+202E
// (LRE/RLE/PDF/LRO/RLO), U+2066-U+2069 (LRI/RLI/FSI/PDI).
const DANGEROUS_CHARS_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F؜‎‏‪-‮⁦-⁩]/gu;

export function sanitizeString(value: string, maxLength: number = MAX_STRING_LENGTH): string {
  const stripped = value.replace(DANGEROUS_CHARS_REGEX, "");
  if (stripped.length <= maxLength) return stripped;
  const keep = Math.max(0, maxLength - TRUNCATION_MARKER.length);
  return stripped.slice(0, keep) + TRUNCATION_MARKER;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Recursively sanitize all string values inside a JSON-serializable value.
// Returns unknown so callers think about the runtime shape they are accepting
// from upstream APIs and apply Zod validation when they need a typed result.
export function sanitizeValue(
  value: unknown,
  maxStringLength: number = MAX_STRING_LENGTH,
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value, maxStringLength);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, maxStringLength));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = sanitizeValue(item, maxStringLength);
    }
    return out;
  }
  return value;
}

export function sanitizeRecord(
  value: Record<string, unknown>,
  maxStringLength: number = MAX_STRING_LENGTH,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = sanitizeValue(item, maxStringLength);
  }
  return out;
}
