/**
 * Import line decoration provider
 *
 * Watches open documents for import/require statements, asks the Crowsnest veto API about each package, and marks
 * lines above the configured risk threshold with a gutter dot and a wavy underline.
 *
 *  - Updates are debounced by 1000 ms after the last edit.
 *  - Results are cached per ecosystem and package for 5 minutes; a failed lookup is cached for 30 seconds.
 *  - The colour follows the score: critical above 0.8 (red), high above 0.6 (orange), otherwise medium (yellow).
 */

import * as vscode from 'vscode';
import { CrowsnestClient, VetoResult } from './client';
import { isNodeBuiltin, isPythonStdlib } from './builtins';

const DEBOUNCE_MS = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** A failed lookup (API down, timeout) is remembered briefly so typing does not retry it every second. */
const MISS_TTL_MS = 30 * 1000;

/**
 * Returns a `data:` URI containing a tiny SVG circle of the given colour.
 * VS Code accepts these as gutterIconPath values.
 */
function svgCircleDataUri(color: string): vscode.Uri {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="6" fill="${color}" />
</svg>`;
  const encoded = Buffer.from(svg).toString('base64');
  return vscode.Uri.parse(`data:image/svg+xml;base64,${encoded}`);
}

interface SeverityDecoration {
  type: vscode.TextEditorDecorationType;
  label: string;
}

export type Severity = 'critical' | 'high' | 'medium';

export interface AppliedFlag {
  /** Zero-based line of the import. */
  line: number;
  packageName: string;
  probability: number;
  severity: Severity;
}

/** The three bands from the header comment: above 0.8, above 0.6, otherwise (already above the threshold). */
export function severityOf(probability: number): Severity {
  return probability > 0.8 ? 'critical' : probability > 0.6 ? 'high' : 'medium';
}

/** The registry a language's imports resolve against. */
function ecosystemOf(languageId: string): 'npm' | 'pypi' {
  return languageId === 'python' ? 'pypi' : 'npm';
}

function createDecorationTypes(): {
  critical: SeverityDecoration;
  high: SeverityDecoration;
  medium: SeverityDecoration;
} {
  return {
    critical: {
      label: 'CRITICAL',
      type: vscode.window.createTextEditorDecorationType({
        gutterIconPath: svgCircleDataUri('#ef4444'),
        gutterIconSize: 'contain',
        textDecoration: 'underline wavy #ef4444',
        overviewRulerColor: '#ef4444',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { textDecoration: 'underline wavy #dc2626' },
      }),
    },
    high: {
      label: 'HIGH',
      type: vscode.window.createTextEditorDecorationType({
        gutterIconPath: svgCircleDataUri('#f97316'),
        gutterIconSize: 'contain',
        textDecoration: 'underline wavy #f97316',
        overviewRulerColor: '#f97316',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { textDecoration: 'underline wavy #ea580c' },
      }),
    },
    medium: {
      label: 'MEDIUM',
      type: vscode.window.createTextEditorDecorationType({
        gutterIconPath: svgCircleDataUri('#eab308'),
        gutterIconSize: 'contain',
        textDecoration: 'underline wavy #eab308',
        overviewRulerColor: '#eab308',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { textDecoration: 'underline wavy #ca8a04' },
      }),
    },
  };
}

/**
 * Regex patterns used to extract package names from a single source line.
 *
 * Handles:
 *   import X from 'pkg'
 *   import { X } from 'pkg'
 *   import * as X from 'pkg'
 *   import type { X } from 'pkg'
 *   import('pkg')
 *   require('pkg')
 *   from pkg import X  (Python)
 *   import pkg         (Python — only bare names)
 */
const JS_TS_PATTERNS: RegExp[] = [
  // import ... from 'pkg' / "pkg"
  /\bfrom\s+['"]([^'"]+)['"]/,
  // require('pkg')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/,
  // import('pkg')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/,
];

const PYTHON_PATTERNS: RegExp[] = [
  // from pkg import X  — must not start with .
  /^\s*from\s+([\w][\w.]*)\s+import\b/,
  // import pkg  — only bare identifier (no dots, no from)
  /^\s*import\s+([\w][\w.]*)\s*(?:as\s+\w+\s*)?(?:#.*)?$/,
];

const SCOPED_PACKAGE_RE = /^@[\w-]+\/[\w.-]+/;
const PLAIN_PACKAGE_RE = /^[\w][\w.-]*/;

/**
 * Extracts the package name from a single source code line.
 * Returns `null` for relative imports (starting with . or /) and for lines
 * that don't contain a recognisable import pattern.
 *
 * @param line       - Raw text of the source line
 * @param languageId - VS Code language identifier
 */
export function extractPackageName(line: string, languageId: string): string | null {
  const isPython = languageId === 'python';
  const patterns = isPython ? PYTHON_PATTERNS : JS_TS_PATTERNS;

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) {
      continue;
    }

    const raw = match[1].trim();

    // Skip relative imports
    if (raw.startsWith('.') || raw.startsWith('/')) {
      continue;
    }

    // Python: a dotted name (os.path) is a submodule path, not a distribution name
    
    if (isPython && raw.includes('.')) {
      continue;
    }

    // Extract the package specifier from potentially longer paths like
    // 'lodash/merge' → 'lodash'   or   '@scope/pkg/sub' → '@scope/pkg'
    if (raw.startsWith('@')) {
      const scopedMatch = raw.match(SCOPED_PACKAGE_RE);
      if (scopedMatch) {
        return scopedMatch[0];
      }
      continue;
    }

    const plainMatch = raw.match(PLAIN_PACKAGE_RE);
    if (plainMatch) {
      // fs, node:fs, os, json ...: part of the language, never fetched from a registry.
      if (isPython ? isPythonStdlib(plainMatch[0]) : isNodeBuiltin(raw.startsWith('node:') ? raw : plainMatch[0])) {
        continue;
      }
      return plainMatch[0];
    }
  }

  return null;
}

interface CacheEntry {
  /** null records a failed lookup. */
  result: VetoResult | null;
  expiresAt: number;
}

class PackageCache {
  private readonly store = new Map<string, CacheEntry>();

  /** undefined = never looked up (or expired); null = looked up and failed recently. */
  get(key: string): VetoResult | null | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(key: string, result: VetoResult | null): void {
    this.store.set(key, {
      result,
      expiresAt: Date.now() + (result ? CACHE_TTL_MS : MISS_TTL_MS),
    });
  }

  clear(): void {
    this.store.clear();
  }
}

export class ImportDecoratorProvider {
  private readonly client: CrowsnestClient;
  private readonly decorations: ReturnType<typeof createDecorationTypes>;
  private readonly cache = new PackageCache();
  private readonly applied = new Map<string, AppliedFlag[]>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(client: CrowsnestClient, context: vscode.ExtensionContext) {
    this.client = client;
    this.decorations = createDecorationTypes();

    // Register decoration types for disposal
    context.subscriptions.push(
      this.decorations.critical.type,
      this.decorations.high.type,
      this.decorations.medium.type
    );

    // Watch for editor / document changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.scheduleUpdate(editor);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          this.scheduleUpdate(editor);
        }
      }),
      vscode.workspace.onDidOpenTextDocument(() => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          this.scheduleUpdate(editor);
        }
      })
    );

    context.subscriptions.push(...this.disposables);

    // Decorate the currently active editor immediately on activation
    if (vscode.window.activeTextEditor) {
      this.scheduleUpdate(vscode.window.activeTextEditor);
    }
  }

  /** Debounces the decoration update for the given editor by DEBOUNCE_MS. */
  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (!this.isEligibleDocument(editor.document)) {
      return;
    }

    const key = editor.document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.updateDecorations(editor);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
  }

  /** Returns true for JS/TS and Python documents. */
  private isEligibleDocument(doc: vscode.TextDocument): boolean {
    const eligible = new Set([
      'javascript',
      'typescript',
      'javascriptreact',
      'typescriptreact',
      'python',
    ]);
    return eligible.has(doc.languageId);
  }

  /** Scans the document and applies decorations for risky packages. */
  private async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('crowsnest');
    if (!cfg.get<boolean>('enabled', true)) {
      this.clearDecorations(editor);
      return;
    }

    const threshold = cfg.get<number>('riskThreshold', 0.5);
    const doc = editor.document;
    const languageId = doc.languageId;
    const versionAtStart = doc.version;
    const lines = doc.getText().split('\n');

    const linePackages: Array<{ lineIndex: number; packageName: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const pkg = extractPackageName(lines[i], languageId);
      if (pkg) {
        linePackages.push({ lineIndex: i, packageName: pkg });
      }
    }

    const ecosystem = ecosystemOf(languageId);
    const keyOf = (pkg: string): string => `${ecosystem}:${pkg}`;
    const uncached = linePackages
      .map((lp) => lp.packageName)
      .filter((pkg, idx, arr) => arr.indexOf(pkg) === idx)
      .filter((pkg) => this.cache.get(keyOf(pkg)) === undefined);

    // Fetch all uncached packages in parallel (capped to avoid thundering herd)
    const BATCH_SIZE = 5;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((pkg) => this.client.vetoCheck(pkg, undefined, ecosystem))
      );
      for (let j = 0; j < batch.length; j++) {
        this.cache.set(keyOf(batch[j]), results[j]);
      }
    }

    const resolvedMap = new Map<string, VetoResult | null>();
    for (const { packageName } of linePackages) {
      resolvedMap.set(packageName, this.cache.get(keyOf(packageName)) ?? null);
    }

    // The user kept typing while we waited: a newer update is already scheduled, so drop this stale one.
    if (doc.version !== versionAtStart) {
      return;
    }

    const criticalRanges: vscode.DecorationOptions[] = [];
    const highRanges: vscode.DecorationOptions[] = [];
    const mediumRanges: vscode.DecorationOptions[] = [];

    const flagged: AppliedFlag[] = [];

    for (const { lineIndex, packageName } of linePackages) {
      const result = resolvedMap.get(packageName);
      if (!result) {
        continue;
      }

      if (result.probability <= threshold) {
        continue;
      }

      const range = doc.lineAt(lineIndex).range;
      const decoration = this.buildDecoration(range, result, threshold);

      if (result.probability > 0.8) {
        criticalRanges.push(decoration);
      } else if (result.probability > 0.6) {
        highRanges.push(decoration);
      } else {
        mediumRanges.push(decoration);
      }
      flagged.push({
        line: lineIndex,
        packageName,
        probability: result.probability,
        severity: severityOf(result.probability),
      });
    }

    // Verify the editor is still open
    const stillActive = vscode.window.visibleTextEditors.includes(editor);
    if (!stillActive) {
      return;
    }

    editor.setDecorations(this.decorations.critical.type, criticalRanges);
    editor.setDecorations(this.decorations.high.type, highRanges);
    editor.setDecorations(this.decorations.medium.type, mediumRanges);
    this.applied.set(doc.uri.toString(), flagged);
  }

  /** Removes all Crowsnest decorations from an editor. */
  private clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorations.critical.type, []);
    editor.setDecorations(this.decorations.high.type, []);
    editor.setDecorations(this.decorations.medium.type, []);
    this.applied.delete(editor.document.uri.toString());
  }

  /** What is currently flagged in a document. VS Code cannot read decorations back, so tests use this. */
  getAppliedFlags(uri: string): readonly AppliedFlag[] {
    return this.applied.get(uri) ?? [];
  }

  /** Re-scan every visible editor now, after a settings change (the cache is cleared first). */
  refresh(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.scheduleUpdate(editor);
    }
  }

  private buildDecoration(
    range: vscode.Range,
    result: VetoResult,
    threshold: number
  ): vscode.DecorationOptions {
    const pct = Math.round(result.probability * 100);
    const severity =
      result.probability > 0.8
        ? '⛔ CRITICAL'
        : result.probability > 0.6
        ? '⚠️ HIGH'
        : '🟡 MEDIUM';

    const signalLines =
      result.signals.length > 0
        ? result.signals.map((s) => `- ${s}`).join('\n')
        : '- No individual signals reported';

    // Build the hover markdown string
    const md = new vscode.MarkdownString(
      [
        `**${severity} — Crowsnest: Supply Chain Risk**`,
        '',
        `Package: \`${result.packageName}\``,
        `Risk score: **${pct}%**  _(threshold: ${Math.round(threshold * 100)}%)_`,
        '',
        '**Signals:**',
        signalLines,
        '',
        '---',
        `[Investigate →](command:crowsnest.investigatePackage)`,
      ].join('\n')
    );

    // Allow the command link in the hover card
    md.isTrusted = true;

    return { range, hoverMessage: md };
  }

  /** Clears the cache (e.g. after user updates config). */
  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
