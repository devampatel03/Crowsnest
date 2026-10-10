const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

/**
 * Serialise a JSON-LD object for an inline script element. Escapes the less-than
 * character as < so a closing script tag or an HTML comment opener inside a
 * string cannot break out of the element (Next.js JSON-LD guidance). The line
 * and paragraph separators (code points 0x2028, 0x2029) are escaped too.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .split(LS)
    .join('\\u2028')
    .split(PS)
    .join('\\u2029');
}
