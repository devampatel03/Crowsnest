import { describe, expect, it } from 'vitest';
import { canonicalUrl, resolveSiteUrl } from './site';

describe('resolveSiteUrl', () => {
  it('allows localhost for local builds and dev', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('http://localhost:3100');
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });
  it('fails a CI build with no origin or a localhost origin', () => {
    expect(() => resolveSiteUrl({ CI: 'true' })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => resolveSiteUrl({ CI: 'true', NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toThrow(/localhost/);
    expect(() => resolveSiteUrl({ CI: 'true', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000/' })).toThrow(/localhost/);
  });
  it('fails a Vercel production build on localhost and accepts a real origin', () => {
    expect(() => resolveSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' })).toThrow();
    expect(resolveSiteUrl({ CI: 'true', NEXT_PUBLIC_SITE_URL: 'https://example.org/' })).toBe('https://example.org');
  });
  it('fails a Vercel production build that names a vercel.app origin', () => {
    expect(() => resolveSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://crowsnest-ten.vercel.app' })).toThrow(/vercel\.app/);
    expect(resolveSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://crowsnest-ten.vercel.app' })).toBe('https://crowsnest-ten.vercel.app');
    expect(resolveSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://crowsnest.co.in' })).toBe('https://crowsnest.co.in');
  });
  it('canonical urls have no trailing slash except the root', () => {
    expect(canonicalUrl('/docs/', 'https://e.org')).toBe('https://e.org/docs');
    expect(canonicalUrl('/', 'https://e.org')).toBe('https://e.org/');
  });
});
