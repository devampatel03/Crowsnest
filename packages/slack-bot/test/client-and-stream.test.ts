import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- EventSource fake (alert-stream imports the default export of 'eventsource') ----
const { instances, FakeES } = vi.hoisted(() => {
const instances: any[] = [];
class FakeES {
  readyState = 1;
  listeners = new Map<string, Array<(e: unknown) => void>>();
  closed = false;
  constructor(public url: string) {
    instances.push(this);
  }
  addEventListener(name: string, fn: (e: unknown) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data?: unknown) {
    for (const fn of this.listeners.get(name) ?? []) fn(data);
  }
}
  return { instances, FakeES };
});
vi.mock('eventsource', () => ({ default: FakeES }));

import { AlertStream } from '../src/alert-stream.js';
import { CrowsnestApiClient, CrowsnestApiError } from '../src/crowsnest-client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CrowsnestApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('strips trailing slash from base url', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await new CrowsnestApiClient('http://api:8000/').getStats();
    expect(fetchMock.mock.calls[0][0]).toBe('http://api:8000/api/stats');
  });

  it('maps a network failure to CrowsnestApiError with isNetworkError', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const err = await new CrowsnestApiClient('http://x').getStats().catch((e) => e);
    expect(err).toBeInstanceOf(CrowsnestApiError);
    expect(err.isNetworkError).toBe(true);
  });

  it('maps non-2xx to CrowsnestApiError carrying status and body', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 422 }));
    const err = await new CrowsnestApiClient('http://x').blastRadius('bob').catch((e) => e);
    expect(err).toBeInstanceOf(CrowsnestApiError);
    expect(err.statusCode).toBe(422);
    expect(err.isNetworkError).toBe(false);
    expect(err.message).toContain('nope');
  });

  it('blastRadius maps backend field names', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ maintainer: 'bob', packages_controlled: ['a'], affected_projects: ['/p'], total_affected_deps: 4, runtime_confirmed_count: 1 })
    );
    const r = await new CrowsnestApiClient('http://x').blastRadius('bob');
    expect(r).toMatchObject({ compromised_packages: ['a'], total_affected: 4, runtime_exposed: true, risk_score: 0.8 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ maintainer: 'bob' });
  });

  it('blastRadius with empty backend payload gives zero risk', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ maintainer: 'bob' }));
    const r = await new CrowsnestApiClient('http://x').blastRadius('bob');
    expect(r.risk_score).toBe(0);
    expect(r.compromised_packages).toEqual([]);
  });

  describe('investigate verdicts', () => {
    const call = async (raw: unknown) => {
      fetchMock.mockResolvedValue(jsonResponse(raw));
      return new CrowsnestApiClient('http://x').investigate('pkg');
    };
    it('IOC hit means compromised', async () => {
      const r = await call({ findings: { IOC_MATCH: [{ id: 'z' }] }, npm_metadata: { weekly_downloads: 5e6 } });
      expect(r.verdict).toBe('compromised');
      expect(r.incident?.severity).toBe('CRITICAL');
    });
    it('socket alerts mean suspicious', async () => {
      const r = await call({ socket_alerts: [{}], npm_metadata: { weekly_downloads: 5e6 } });
      expect(r.verdict).toBe('suspicious');
    });
    it('low downloads mean suspicious', async () => {
      expect((await call({ npm_metadata: { weekly_downloads: 10 } })).verdict).toBe('suspicious');
    });
    it('healthy package is clean', async () => {
      expect((await call({ npm_metadata: { weekly_downloads: 5e6 } })).verdict).toBe('clean');
    });
    it('missing metadata (unknown package) is flagged suspicious, age defaults', async () => {
      const r = await call({});
      expect(r.verdict).toBe('suspicious');
      expect(r.analysis.age_days).toBe(365);
    });
    it('computes package age from created_at', async () => {
      const created = new Date(Date.now() - 10 * 86_400_000).toISOString();
      expect((await call({ npm_metadata: { weekly_downloads: 5e6, created_at: created } })).analysis.age_days).toBe(10);
    });
  });

  describe('scan polling', () => {
    it('reports a failed scan as CrowsnestApiError', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 's1', scan_id: 's1' }))
        .mockResolvedValueOnce(jsonResponse({ id: 's1', status: 'failed', error: 'boom' }));
      const p = new CrowsnestApiClient('http://x').scan('/p').catch((e) => e);
      await vi.advanceTimersByTimeAsync(2_100);
      const err = await p;
      expect(err).toBeInstanceOf(CrowsnestApiError);
      expect(err.message).toContain('boom');
    });

    it('times out after 120 s of pending', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith('/api/scan') ? jsonResponse({ id: 's1', scan_id: 's1' }) : jsonResponse({ id: 's1', status: 'running' })
      );
      const p = new CrowsnestApiClient('http://x').scan('/p').catch((e) => e);
      await vi.advanceTimersByTimeAsync(130_000);
      expect((await p).message).toContain('did not complete');
    });

    it('completes and returns incidents', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: 's1', scan_id: 's1' }))
        .mockResolvedValueOnce(jsonResponse({ id: 's1', status: 'complete', incidents: [] }));
      const p = new CrowsnestApiClient('http://x').scan('/p');
      await vi.advanceTimersByTimeAsync(2_100);
      expect((await p).status).toBe('complete');
    });

    // QA-TE-07: real backend returns {"scan_id": ...} (no "id"), so the bot polls /api/scan/undefined/status.
    it('uses the scan_id the real backend returns (QA-TE-07)', async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ scan_id: 'real-id' }))
        .mockResolvedValue(jsonResponse({ status: 'complete', incidents: [] }));
      const p = new CrowsnestApiClient('http://x').scan('/p').catch((e) => e);
      await vi.advanceTimersByTimeAsync(2_100);
      await p;
      expect(fetchMock.mock.calls[1][0]).toBe('http://x/api/scan/real-id/status');
    });
  });
});

describe('AlertStream', () => {
  beforeEach(() => {
    instances.length = 0;
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  const msg = (o: unknown) => ({ data: JSON.stringify(o) });
  const mk = () => {
    const onAlert = vi.fn().mockResolvedValue(undefined);
    const onPublish = vi.fn();
    const s = new AlertStream('http://api/', onAlert, onPublish);
    s.start();
    return { s, onAlert, onPublish, es: instances[0] };
  };
  const incident = (sev: string) => ({ id: 'i', severity: sev, attack_pattern: 'worm', packages: ['p'] });

  it('connects to /api/events without double slash', () => {
    expect(mk().es.url).toBe('http://api/api/events');
  });

  it('alerts on CRITICAL and HIGH, not MEDIUM/LOW', () => {
    const { es, onAlert } = mk();
    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      es.emit('message', msg({ type: 'incident_detected', payload: incident(sev) }));
    }
    expect(onAlert).toHaveBeenCalledTimes(2);
  });

  it('accepts the flattened backend shape (incident fields at top level, no payload)', () => {
    const { es, onAlert } = mk();
    es.emit('message', msg({ type: 'incident_detected', timestamp: 't', ...incident('CRITICAL') }));
    expect(onAlert).toHaveBeenCalledOnce();
  });

  it('ignores non-JSON, null, and malformed incident payloads without throwing', () => {
    const { es, onAlert } = mk();
    expect(() => {
      es.emit('message', { data: 'not json' });
      es.emit('incident_detected', msg({ type: 'incident_detected', payload: {} }));
    }).not.toThrow();
    expect(onAlert).not.toHaveBeenCalled();
  });

  it('a throwing onPublishEvent does not stop alert handling', () => {
    const { es, onAlert, onPublish } = mk();
    onPublish.mockImplementation(() => {
      throw new Error('x');
    });
    es.emit('message', msg({ type: 'incident_detected', payload: incident('HIGH') }));
    expect(onAlert).toHaveBeenCalledOnce();
  });

  it('a rejecting onAlert is swallowed', async () => {
    const { es, onAlert } = mk();
    onAlert.mockRejectedValue(new Error('slack down'));
    es.emit('message', msg({ type: 'incident_detected', payload: incident('HIGH') }));
    await Promise.resolve();
    await Promise.resolve();
  });

  it('reconnects with exponential backoff capped at 60 s', () => {
    const { es } = mk();
    es.readyState = 2;
    es.emit('error', new Event('error'));
    vi.advanceTimersByTime(2_000);
    expect(instances).toHaveLength(2);
    instances[1].readyState = 2;
    instances[1].emit('error', new Event('error'));
    vi.advanceTimersByTime(3_999);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });

  it('stop() closes the source and cancels pending reconnects', () => {
    const { s, es } = mk();
    es.readyState = 2;
    es.emit('error', new Event('error'));
    s.stop();
    vi.advanceTimersByTime(120_000);
    expect(instances).toHaveLength(1);
    expect(es.closed).toBe(true);
  });

  it('ignores errors after stop()', () => {
    const { s, es } = mk();
    s.stop();
    es.readyState = 2;
    es.emit('error', new Event('error'));
    vi.advanceTimersByTime(120_000);
    expect(instances).toHaveLength(1);
  });
});
