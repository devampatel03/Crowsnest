import { describe, it, expect } from 'vitest';
import { extractPackageName, severityOf } from '../src/decorator';
import { consoleUrl } from '../src/commands';

describe('language builtins are not packages', () => {
  const js = (l: string) => extractPackageName(l, 'typescript');
  const py = (l: string) => extractPackageName(l, 'python');

  it.each([
    "import fs from 'fs'",
    "import { readFile } from 'fs/promises'",
    "import path from 'node:path'",
    "const os = require('os')",
    "import('node:child_process')",
  ])('JS/TS skips %s', (line) => {
    expect(js(line)).toBeNull();
  });

  it.each([
    ['import os', null],
    ['import json as j', null],
    ['from collections import OrderedDict', null],
    ['from typing import List', null],
    ['import requests', 'requests'],
    ['from flask import Flask', 'flask'],
    ['import numpy as np', 'numpy'],
  ])('Python %s -> %s', (line, expected) => {
    expect(py(line)).toBe(expected);
  });

  it('still returns real packages that merely contain a builtin name', () => {
    expect(js("import x from 'fs-extra'")).toBe('fs-extra');
    expect(js("import x from 'path-to-regexp'")).toBe('path-to-regexp');
    expect(js("import x from 'events-polyfill'")).toBe('events-polyfill');
  });
});

describe('severityOf matches the documented bands', () => {
  it.each([
    [0.95, 'critical'],
    [0.81, 'critical'],
    [0.8, 'high'],
    [0.7, 'high'],
    [0.6, 'medium'],
    [0.51, 'medium'],
  ])('%s -> %s', (p, s) => {
    expect(severityOf(p)).toBe(s);
  });
});

describe('consoleUrl', () => {
  it('opens /horizon on the configured origin', () => {
    expect(consoleUrl('http://localhost:3000')).toBe('http://localhost:3000/horizon');
    expect(consoleUrl('http://127.0.0.1:3100/ignored/path')).toBe('http://127.0.0.1:3100/horizon');
  });

  it('falls back to the local default for blank, invalid or non-web values', () => {
    for (const bad of [undefined, '', '   ', 'not a url', 'javascript:alert(1)', 'file:///etc/passwd']) {
      expect(consoleUrl(bad)).toBe('http://localhost:3000/horizon');
    }
  });
});
