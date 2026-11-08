import { describe, expect, it } from 'vitest';
import { StartError } from '../commands/backend.js';
import { chooseInstallMode, chooseMode } from './mode.js';

const up = async () => true;
const down = async () => false;

describe('chooseInstallMode', () => {
  it('uses the full check when Crowsnest answers', async () => {
    expect(await chooseInstallMode({}, up)).toBe('full');
    expect(await chooseInstallMode({ full: true }, up)).toBe('full');
  });

  it('refuses, and says how to start Crowsnest, when it does not answer', async () => {
    await expect(chooseInstallMode({}, down)).rejects.toBeInstanceOf(StartError);
    await expect(chooseInstallMode({}, down)).rejects.toThrow(/crowsnest start/);
    await expect(chooseInstallMode({ full: true }, down)).rejects.toThrow(/crowsnest start/);
  });

  it('--quick is the only way around it, and never asks the backend', async () => {
    let asked = false;
    expect(await chooseInstallMode({ quick: true }, async () => ((asked = true), false))).toBe('quick');
    expect(asked).toBe(false);
  });

  it('asks on every call', async () => {
    let calls = 0;
    const flaky = async () => ++calls > 1;
    await expect(chooseInstallMode({}, flaky)).rejects.toThrow();
    expect(await chooseInstallMode({}, flaky)).toBe('full');
  });

  it('refuses both flags at once', async () => {
    await expect(chooseInstallMode({ quick: true, full: true }, up)).rejects.toThrow(/not both/);
  });
});

describe('chooseMode', () => {
  it('uses the full check when Crowsnest answers, and the quick check when it does not', async () => {
    expect(await chooseMode({}, up)).toBe('full');
    expect(await chooseMode({}, down)).toBe('quick');
  });

  it('--quick never asks the backend', async () => {
    let asked = false;
    expect(await chooseMode({ quick: true }, async () => ((asked = true), true))).toBe('quick');
    expect(asked).toBe(false);
  });

  it('--full refuses to fall back', async () => {
    expect(await chooseMode({ full: true }, up)).toBe('full');
    await expect(chooseMode({ full: true }, down)).rejects.toThrow(/crowsnest start/);
  });

  it('refuses both flags at once', async () => {
    await expect(chooseMode({ quick: true, full: true }, up)).rejects.toThrow(/not both/);
  });
});
