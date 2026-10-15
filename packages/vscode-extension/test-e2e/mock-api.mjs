// A stand-in Crowsnest API for the editor tests. Scores are fixed by package name so expectations are exact.
import http from 'node:http';

const SCORES = {
  'evil-pkg': 0.95, // critical
  'meh-pkg': 0.7, // high
  'lowish-pkg': 0.55, // medium
  evilpy: 0.9, // critical, python
};

/**
 * @returns {Promise<{ url: string, requests: any[], setMode(m: 'ok'|'down'): void, close(): Promise<void> }>}
 */
export async function startMockApi() {
  const requests = [];
  let mode = 'ok';

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = (status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };

      if (req.url === '/__requests') return json(200, requests);
      if (req.url === '/__mode' && req.method === 'POST') {
        mode = JSON.parse(body).mode;
        return json(200, { mode });
      }

      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        // leave empty
      }
      requests.push({ method: req.method, path: req.url, body: parsed });

      if (mode === 'down') return json(503, { detail: 'down' });

      if (req.url === '/api/veto') {
        const p = SCORES[parsed.package] ?? 0.1;
        return json(200, {
          blocked: p >= 0.6,
          package: parsed.package,
          probability: p,
          signals: p > 0.5 ? [`Mock signal for ${parsed.package}`] : [],
        });
      }
      if (req.url === '/api/investigate') {
        return json(200, {
          package: parsed.package,
          risk_score: SCORES[parsed.package] ?? 0.1,
          verdict: 'Mock verdict',
          summary: 'Mock summary',
          query_findings: ['Mock finding'],
        });
      }
      if (req.url === '/api/stats') {
        return json(200, { active_incidents: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 }, packages_scanned: 10 });
      }
      return json(404, { detail: 'not found' });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setMode: (m) => {
      mode = m;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
