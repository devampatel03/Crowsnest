import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { icons } from './icons.js';
import { iconFor } from '../commands/install.js';

// Anything that draws as a colour picture by default (Emoji_Presentation), or an emoji joined to a variation selector.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

describe('no emoji in what the command line prints', () => {
  it('every marker is plain text', () => {
    for (const [name, mark] of Object.entries(icons)) expect(mark, name).not.toMatch(EMOJI);
  });

  it('every signal gets a plain marker', () => {
    for (const signal of ['ACTIVE IOC: x', 'hijacked', 'Matches known AI hallucination pattern', 'Only 15 weekly downloads', 'No GitHub repository linked', 'Typosquat of express']) {
      expect(iconFor(signal), signal).not.toMatch(EMOJI);
    }
  });

  it('no source file of the command line has an emoji in it', () => {
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && EMOJI.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(root, file));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
