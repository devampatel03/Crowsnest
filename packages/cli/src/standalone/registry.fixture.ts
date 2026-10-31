/** Fakes for the quick-check tests: a registry and a malware list that answer from tables, never the network. */

import type { Fetcher } from './osv.js';
import type { Packument, VersionDoc } from './registry.js';

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

export interface FakeFetch extends Fetcher {
  calls: string[];
}

/** Answers each request with the handler whose key is the longest prefix of its address; anything else is a 404. */
export function fakeFetch(handlers: Record<string, Handler>): FakeFetch {
  const calls: string[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(handlers)
      .filter((prefix) => url.startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0];
    return key ? (handlers[key] as Handler)(url, init) : json({ error: 'not found' }, 404);
  }) as FakeFetch;
  fake.calls = calls;
  return fake;
}

export const OSV = 'https://api.osv.dev/v1/querybatch';

/** An OSV handler that answers each question from `{ 'name@version': ['MAL-1'] }`, and the GHSA noise OSV also returns. */
export function osvAnswers(table: Record<string, string[]>, extra: Record<string, unknown> = {}): Handler {
  return async (_url, init) => {
    const { queries } = JSON.parse(String(init?.body)) as { queries: { package: { name: string }; version: string }[] };
    return json({
      results: queries.map((q) => ({
        vulns: [...(table[`${q.package.name}@${q.version}`] ?? []).map((id) => ({ id })), ...(table[`${q.package.name}@${q.version}`] ? [{ id: 'GHSA-xxxx-xxxx-xxxx' }] : [])],
        ...extra,
      })),
    });
  };
}

export interface VersionSpec extends VersionDoc {
  /** ISO time the version was published. */
  at: string;
}

export function packument(
  name: string,
  versions: Record<string, VersionSpec>,
  repository?: Packument['repository'],
): Packument {
  const docs: Record<string, VersionDoc> = {};
  const time: Record<string, string> = {};
  for (const [version, { at, ...doc }] of Object.entries(versions)) {
    docs[version] = doc;
    time[version] = at;
  }
  return { name, versions: docs, time, repository };
}

/** An npm attestations document whose SLSA statement names `repository` as the repository that built the release. */
export function attestations(repository: string): unknown {
  const statement = { predicate: { buildDefinition: { externalParameters: { workflow: { repository } } } } };
  return {
    attestations: [
      { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1' },
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
      },
    ],
  };
}

/** The registry's JSON for a packument, as the network would send it. */
export const registryBody = (p: Packument): unknown => ({ name: p.name, versions: p.versions, time: p.time, repository: p.repository });
