import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `conf` persists to a real on-disk config file scoped by projectName. We
// mock it so tests never touch the developer's actual Crowsnest config and
// so `.get(key, default)` behaves like a simple in-memory store that falls
// through to the caller-supplied default (mirroring real `conf` behavior
// when no value has ever been `.set()`).
const store = new Map<string, string>();

vi.mock('conf', () => {
  return {
    default: class MockConf {
      get(key: string, defaultValue: string) {
        return store.has(key) ? store.get(key) : defaultValue;
      }
      set(key: string, value: string) {
        store.set(key, value);
      }
    },
  };
});

describe('config.ts', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    store.clear();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CROWSNEST_API_URL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.NPM_TOKEN;
    delete process.env.SOCKET_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults apiUrl to http://localhost:8000 when CROWSNEST_API_URL is unset', async () => {
    const { getConfig } = await import('./config.js');
    expect(getConfig().apiUrl).toBe('http://localhost:8000');
  });

  it('uses CROWSNEST_API_URL env var when set', async () => {
    process.env.CROWSNEST_API_URL = 'https://crowsnest.example.com';
    const { getConfig } = await import('./config.js');
    expect(getConfig().apiUrl).toBe('https://crowsnest.example.com');
  });

  it('defaults all token/key fields to empty strings when unset', async () => {
    const { getConfig } = await import('./config.js');
    const cfg = getConfig();
    expect(cfg.githubToken).toBe('');
    expect(cfg.npmToken).toBe('');
    expect(cfg.socketApiKey).toBe('');
    expect(cfg.anthropicApiKey).toBe('');
  });

  it('setConfig persists a value that getConfig subsequently returns', async () => {
    const { getConfig, setConfig } = await import('./config.js');
    setConfig('apiUrl', 'https://custom.example.com');
    expect(getConfig().apiUrl).toBe('https://custom.example.com');
  });

  it('getAllConfig returns the same shape as getConfig', async () => {
    const { getConfig, getAllConfig } = await import('./config.js');
    expect(getAllConfig()).toEqual(getConfig());
  });
});
