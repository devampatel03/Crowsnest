// Extracts raw JSON-LD script bodies from an HTML string. Regex-based on
// purpose: no HTML parser dependency, and it matches what crawlers read.
const RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

export function extractJsonLd(html: string): string[] {
  return Array.from(html.matchAll(RE), (m) => m[1]);
}

/** Parse every block (JSON.parse decodes the < escape). Throws on malformed JSON. */
export function parseJsonLd(html: string): Record<string, unknown>[] {
  return extractJsonLd(html).map((b) => JSON.parse(b) as Record<string, unknown>);
}
