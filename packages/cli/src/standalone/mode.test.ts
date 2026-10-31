import { describe, expect, it } from 'vitest';
import { chooseMode } from './mode.js';

const up = async () => true;
const down = async () => false;

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
