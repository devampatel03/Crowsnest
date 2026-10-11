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

  it('falls back to the Vercel production domain when NEXT_PUBLIC_SITE_URL is not set', () => {
    const vercel = { CI: 'true', NODE_ENV: 'production', VERCEL_ENV: 'production' };
    expect(resolveSiteUrl({ ...vercel, VERCEL_PROJECT_PRODUCTION_URL: 'crowsnest.vercel.app' })).toBe('https://crowsnest.vercel.app');
    expect(resolveSiteUrl({ ...vercel, VERCEL_PROJECT_PRODUCTION_URL: 'https://crowsnest.dev/' })).toBe('https://crowsnest.dev');
  });

  it('prefers an explicit NEXT_PUBLIC_SITE_URL over the Vercel domain', () => {
    expect(
      resolveSiteUrl({ CI: 'true', NEXT_PUBLIC_SITE_URL: 'https://example.org', VERCEL_PROJECT_PRODUCTION_URL: 'crowsnest.vercel.app' }),
    ).toBe('https://example.org');
  });

  it('still fails a CI build with neither variable set', () => {
    expect(() => resolveSiteUrl({ CI: 'true', VERCEL_PROJECT_PRODUCTION_URL: '' })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
  it('canonical urls have no trailing slash except the root', () => {
    expect(canonicalUrl('/docs/', 'https://e.org')).toBe('https://e.org/docs');
    expect(canonicalUrl('/', 'https://e.org')).toBe('https://e.org/');
  });
});
