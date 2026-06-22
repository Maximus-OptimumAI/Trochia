/**
 * humanizeFieldError — map a raw Zod/react-hook-form error message to friendly,
 * operator-voice copy for the confirmation form (memory-answerable / T4b).
 *
 * The confirmation card previously rendered the resolver's raw `.message`
 * verbatim ("String must contain at most 3 character(s)", "Expected number,
 * received string", "Required") with an empty prefix — engineer-speak in the
 * founder's face. This maps the common Zod shapes to short, branded copy and,
 * critically, NEVER surfaces a raw Zod string: an unrecognized message falls
 * back to a generic friendly line.
 *
 * Voice (BRAND.md): direct, operator-grade. Short. No "oops", no emoji.
 */

/**
 * @param label  the field's display label (e.g. "Currency", "Founding date").
 * @param raw    the raw resolver message, or undefined when the field is valid.
 * @returns      friendly copy, or undefined when there is no error.
 */
export function humanizeFieldError(label: string, raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.toLowerCase();

  // Missing / required (Zod v4: "received undefined" / "received null" / "required").
  if (m.includes('required') || m.includes('received undefined') || m.includes('received null')) {
    return `${label} is needed to save this field.`;
  }
  // Wrong type — expected a number.
  if (m.includes('expected number') || m.includes('not a number') || m.includes('nan')) {
    return `${label} should be a number.`;
  }
  // Date / datetime fields.
  if (m.includes('datetime') || m.includes('date') || m.includes('iso')) {
    return `${label} should be a date, like 2024-01-15.`;
  }
  // URL / email.
  if (m.includes('url')) return `${label} should be a valid link.`;
  if (m.includes('email')) return `${label} should be a valid email address.`;
  // Length / range — too long.
  if (m.includes('at most') || m.includes('too big') || m.includes('too long') || m.includes('maximum')) {
    return `${label} is too long. Shorten it a little.`;
  }
  // Length / range — too short or empty.
  if (
    m.includes('at least') ||
    m.includes('too small') ||
    m.includes('too short') ||
    m.includes('minimum') ||
    m.includes('empty')
  ) {
    return `${label} is too short.`;
  }

  // Unknown shape — never leak the raw Zod string.
  return `${label} needs a quick fix before saving.`;
}
