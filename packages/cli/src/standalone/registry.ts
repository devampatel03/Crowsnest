/**
 * What the npm registry says about a package, read without a Crowsnest backend.
 */

import type { Fetcher } from './osv.js';

const REGISTRY = 'https://registry.npmjs.org';

export interface VersionDoc {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  _npmUser?: { name?: string };
  dist?: { unpackedSize?: number; attestations?: { url?: string } };
}

export interface Packument {
  name: string;
  versions: Record<string, VersionDoc>;
  time: Record<string, string>;
  repository?: string | { url?: string };
}

/** The registry's full document for a package, or null when the registry has no such package. */
export async function fetchPackument(name: string, fetcher: Fetcher = fetch): Promise<Packument | null> {
  const response = await fetcher(`${REGISTRY}/${name.replace('/', '%2F')}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`the npm registry answered HTTP ${response.status} for ${name}`);
  const body = (await response.json()) as Partial<Packument>;
  return { name, versions: body.versions ?? {}, time: body.time ?? {}, repository: body.repository };
}

/** The repository a release's signed build record names (SLSA provenance), from npm's attestations document. */
export function provenanceRepo(attestations: unknown): string | null {
  const entries = (attestations as { attestations?: unknown[] } | null)?.attestations ?? [];
  for (const entry of entries as {
    predicateType?: string;
    bundle?: { dsseEnvelope?: { payload?: string } };
  }[]) {
    if (!String(entry.predicateType ?? '').includes('slsa.dev/provenance')) continue;
    try {
      const payload = JSON.parse(Buffer.from(entry.bundle?.dsseEnvelope?.payload ?? '', 'base64').toString('utf8')) as {
        predicate?: { buildDefinition?: { externalParameters?: { workflow?: { repository?: string }; sourceRepository?: string } } };
      };
      const params = payload.predicate?.buildDefinition?.externalParameters;
      const repo = params?.workflow?.repository || params?.sourceRepository;
      if (typeof repo === 'string' && repo) return repo;
    } catch {
      continue;
    }
  }
  return null;
}

/** Fetch an attestations document and read the repository from it. Null when it cannot be read. */
export async function fetchProvenanceRepo(url: string, fetcher: Fetcher = fetch): Promise<string | null> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) });
    return response.ok ? provenanceRepo(await response.json()) : null;
  } catch {
    return null;
  }
}

/** "owner/repo" however a registry or CI writes the address (https, ssh, git+, .git, subpaths); '' when unknown. */
export function repoSlug(url: string | null | undefined): string {
  const match = /(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/:]+\/[^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(url ?? '');
  return (match?.[1] ?? '').toLowerCase();
}

export function declaredRepo(packument: Packument): string {
  const repo = packument.repository;
  return typeof repo === 'string' ? repo : (repo?.url ?? '');
}
