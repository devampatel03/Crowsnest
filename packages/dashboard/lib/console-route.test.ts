import { describe, expect, it } from 'vitest';
import { routeFor } from './console-route';
import { pageFor } from '@/components/console/Rail';
import { CHORD_TARGETS } from './console/hotkeys';

describe('dashboard app routes', () => {
  it('serves Horizon at / without changing the URL', () => {
    expect(routeFor('console', '/', true)).toEqual({ kind: 'rewrite', to: '/horizon' });
  });

  it('sends /horizon to /', () => {
    expect(routeFor('console', '/horizon', true)).toEqual({ kind: 'redirect', to: '/' });
  });

  it('keeps Lookout, Installed and Log where they are', () => {
    for (const p of ['/lookout', '/hold', '/log']) expect(routeFor('console', p, true)).toEqual({ kind: 'next' });
  });

  it('answers 404 for website pages, which live on the website port', () => {
    for (const p of ['/docs', '/docs/cli', '/blog', '/glossary/typosquatting', '/about', '/privacy', '/nope']) {
      expect(routeFor('console', p, true), p).toEqual({ kind: 'notfound' });
    }
  });

  it('still serves its own icons', () => {
    for (const p of ['/icon', '/apple-icon']) expect(routeFor('console', p, true)).toEqual({ kind: 'next' });
  });

  it('answers 404 everywhere when the request is not allowed', () => {
    for (const p of ['/', '/horizon', '/lookout', '/hold', '/log']) {
      expect(routeFor('console', p, false), p).toEqual({ kind: 'notfound' });
    }
  });
});

describe('website app routes', () => {
  it('serves every website page', () => {
    for (const p of ['/', '/docs', '/docs/dashboard', '/blog', '/glossary', '/about']) {
      expect(routeFor('site', p, false), p).toEqual({ kind: 'next' });
    }
  });

  it('never serves the dashboard', () => {
    for (const p of ['/horizon', '/lookout', '/hold', '/log', '/log/x']) {
      expect(routeFor('site', p, false), p).toEqual({ kind: 'notfound' });
    }
  });

  it('serves the dashboard paths only when the override allows them', () => {
    expect(routeFor('site', '/lookout', true)).toEqual({ kind: 'next' });
  });
});

describe('dashboard navigation', () => {
  it('treats / and /horizon as Horizon and keeps the other pages apart', () => {
    expect(pageFor('/')?.name).toBe('Horizon');
    expect(pageFor('/horizon')?.name).toBe('Horizon');
    expect(pageFor('/lookout')?.name).toBe('Lookout');
    expect(pageFor('/hold')?.name).toBe('Installed');
    expect(pageFor('/log')?.name).toBe('Log');
    expect(pageFor('/docs')).toBeUndefined();
  });

  it('has no link that goes to /horizon', () => {
    expect(CHORD_TARGETS.h.href).toBe('/');
  });
});

describe('dashboard help links', () => {
  it('go to the public website, because the dashboard port serves no docs', async () => {
    const { docsUrl } = await import('./console/docs-url');
    expect(docsUrl()).toMatch(/^https:\/\/[^/]+\/docs$/);
    expect(docsUrl('/docs/troubleshooting')).toMatch(/^https:\/\/[^/]+\/docs\/troubleshooting$/);
  });

  it('no dashboard component links to a website path on its own origin', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dirs = [join(__dirname, '..', 'components', 'console'), join(__dirname, '..', 'app', '(dashboard)')];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
      }
    };
    dirs.forEach(walk);
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/(href=["'{`]+|push\(['"`])\/(docs|blog|glossary|about|privacy|horizon)\b/);
    }
  });
});
