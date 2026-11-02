/**
 * The public malware list, read without a Crowsnest backend.
 *
 * OSV.dev republishes the OpenSSF malicious-packages feed as `MAL-` advisories. Each exact (package, version) is asked
 * about, never the package name alone, so a clean release of a package that once had a bad one is never flagged. This
 * mirrors packages/core/sources/osv.py.
 */

export type Fetcher = typeof fetch;

export interface PackageVersion {
  name: string;
  version: string;
}

const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const BATCH_SIZE = 500;
const MAX_PAGES = 10;
const MALWARE_PREFIX = 'MAL-';

export const keyOf = (item: PackageVersion): string => `${item.name}@${item.version}`;

interface OsvAnswer {
  vulns?: { id?: string }[];
  next_page_token?: string;
}

/** Malware advisory ids per `name@version`, for the npm packages the list names. A lookup that fails throws. */
export async function malwareFor(items: PackageVersion[], fetcher: Fetcher = fetch): Promise<Map<string, string[]>> {
  const unique = [...new Map(items.map((item) => [keyOf(item), item])).values()];
  const found = new Map<string, Set<string>>();

  for (let start = 0; start < unique.length; start += BATCH_SIZE) {
    let pending: { item: PackageVersion; token?: string }[] = unique.slice(start, start + BATCH_SIZE).map((item) => ({ item }));
    for (let page = 0; page < MAX_PAGES && pending.length > 0; page++) {
      const response = await fetcher(OSV_BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: pending.map(({ item, token }) => ({
            package: { name: item.name, ecosystem: 'npm' },
            version: item.version,
            ...(token ? { page_token: token } : {}),
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`the malware list answered HTTP ${response.status}`);
      const { results } = (await response.json()) as { results?: OsvAnswer[] };
      if (!results || results.length !== pending.length) {
        throw new Error('the malware list returned a different number of answers than questions');
      }
      const next: typeof pending = [];
      pending.forEach(({ item }, index) => {
        const answer = results[index] ?? {};
        for (const vuln of answer.vulns ?? []) {
          if (vuln.id?.startsWith(MALWARE_PREFIX)) {
            const ids = found.get(keyOf(item)) ?? new Set<string>();
            ids.add(vuln.id);
            found.set(keyOf(item), ids);
          }
        }
        if (answer.next_page_token) next.push({ item, token: answer.next_page_token });
      });
      pending = next;
    }
  }
  return new Map([...found].map(([key, ids]) => [key, [...ids].sort()]));
}
