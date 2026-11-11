import { describe, expect, it } from 'vitest';
import { appMode } from './app-mode';
import {
  consoleAllowed,
  consoleAllowedByEnv,
  hostnameOf,
  isConsolePath,
  isForwardedFromElsewhere,
} from './console-access';

const DASHBOARD = { CROWSNEST_APP: 'console' };

describe('app mode', () => {
  it('is the dashboard only when CROWSNEST_APP=console', () => {
    expect(appMode({ CROWSNEST_APP: 'console' })).toBe('console');
    expect(appMode({ CROWSNEST_APP: ' Console ' })).toBe('console');
    expect(appMode({})).toBe('site');
    expect(appMode({ CROWSNEST_APP: 'site' })).toBe('site');
    expect(appMode({ CROWSNEST_APP: 'anything else' })).toBe('site');
  });
});

describe('console access', () => {
  it('opens the dashboard for loopback hosts on a plain local run', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST']) {
      expect(consoleAllowed(DASHBOARD, host)).toBe(true);
    }
  });

  it('stays closed for any public host', () => {
    for (const host of ['crowsnest.vercel.app', 'crowsnest.dev', 'localhost.evil.com', '10.0.0.5:3000', null]) {
      expect(consoleAllowed(DASHBOARD, host)).toBe(false);
    }
  });

  it('is closed in the website app even for a loopback Host header', () => {
    expect(consoleAllowed({}, 'localhost:3001')).toBe(false);
    expect(consoleAllowedByEnv({})).toBe(false);
    expect(consoleAllowedByEnv(DASHBOARD)).toBe(true);
  });

  it('is closed on Vercel even for a loopback Host header', () => {
    expect(consoleAllowed({ ...DASHBOARD, VERCEL: '1' }, 'localhost:3000')).toBe(false);
    expect(consoleAllowedByEnv({ ...DASHBOARD, VERCEL: '1' })).toBe(false);
  });

  it('treats a proxied request as non-local', () => {
    expect(consoleAllowed(DASHBOARD, 'localhost:3000', true)).toBe(false);
  });

  it('tells Next.js own forwarding headers from a real reverse proxy', () => {
    expect(isForwardedFromElsewhere('::1', 'localhost:3000')).toBe(false);
    expect(isForwardedFromElsewhere('127.0.0.1', null)).toBe(false);
    expect(isForwardedFromElsewhere('::ffff:127.0.0.1', null)).toBe(false);
    expect(isForwardedFromElsewhere(null, null)).toBe(false);
    expect(isForwardedFromElsewhere('203.0.113.9', 'localhost:3000')).toBe(true);
    expect(isForwardedFromElsewhere('::1, 203.0.113.9', null)).toBe(true);
    expect(isForwardedFromElsewhere('::1', 'crowsnest.example.org')).toBe(true);
  });

  it('honours the CROWSNEST_CONSOLE override both ways', () => {
    expect(consoleAllowed({ CROWSNEST_CONSOLE: 'on', VERCEL: '1' }, 'example.org', true)).toBe(true);
    expect(consoleAllowed({ CROWSNEST_CONSOLE: 'on' }, '172.17.0.1:3000', true)).toBe(true);
    expect(consoleAllowed({ ...DASHBOARD, CROWSNEST_CONSOLE: 'off' }, 'localhost:3000')).toBe(false);
  });

  it('parses hosts and matches console paths only', () => {
    expect(hostnameOf('[::1]:3000')).toBe('[::1]');
    expect(hostnameOf('Example.org:443')).toBe('example.org');
    expect(isConsolePath('/horizon')).toBe(true);
    expect(isConsolePath('/log/x')).toBe(true);
    expect(isConsolePath('/login')).toBe(false);
    expect(isConsolePath('/docs')).toBe(false);
  });
});
