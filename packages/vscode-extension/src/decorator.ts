/**
 * decorator.ts — Import line decoration provider
 *
 * Watches open documents for import/require statements, queries the Crowsnest
 * veto API for each discovered package, and applies coloured gutter icons plus
 * underline decorations to lines that exceed the configured risk threshold.
 *
 * Design decisions:
 *  - Debounce: API calls are deferred 1000 ms after the last document change
 *    to avoid hammering the API on every keystroke.
 *  - Cache: Results are cached per package name for 5 minutes to prevent
 *    redundant calls when re-scanning a document.
 *  - Three severity levels driven by the combined probability score:
 *      CRITICAL (> 0.8): red   — ⛔ gutter icon, red underline
 *      HIGH     (> 0.6): orange — ⚠️ gutter icon, orange underline
 *      MEDIUM   (> threshold): yellow — 🟡 gutter icon, yellow underline
 */

import * as vscode from 'vscode';
import { CrowsnestClient, VetoResult } from './client';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEBOUNCE_MS = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────
// SVG gutter icon generator
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Decoration types
// ─────────────────────────────────────────────

interface SeverityDecoration {
  type: vscode.TextEditorDecorationType;
  label: string;
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

// ─────────────────────────────────────────────
// Package-name extraction  (exported for use in commands.ts)
// ─────────────────────────────────────────────

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

    // For Python, skip stdlib-style dotted paths deeper than one level
    // (e.g. "os.path" → skip; "requests" → keep)
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
      return plainMatch[0];
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// Result cache
// ─────────────────────────────────────────────

interface CacheEntry {
  result: VetoResult;
  expiresAt: number;
}

class PackageCache {
  private readonly store = new Map<string, CacheEntry>();

  get(packageName: string): VetoResult | null {
    const entry = this.store.get(packageName);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(packageName);
      return null;
    }
    return entry.result;
  }

  set(packageName: string, result: VetoResult): void {
    this.store.set(packageName, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  clear(): void {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────
// ImportDecoratorProvider
// ─────────────────────────────────────────────

export class ImportDecoratorProvider {
  private readonly client: CrowsnestClient;
  private readonly decorations: ReturnType<typeof createDecorationTypes>;
  private readonly cache = new PackageCache();
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

  // ─── Scheduling ──────────────────────────────

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

  // ─── Core decoration logic ────────────────────

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
    const lines = doc.getText().split('\n');

    // ── Step 1: collect (lineIndex, packageName) pairs ──
    const linePackages: Array<{ lineIndex: number; packageName: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const pkg = extractPackageName(lines[i], languageId);
      if (pkg) {
        linePackages.push({ lineIndex: i, packageName: pkg });
      }
    }

    // ── Step 2: resolve results (cache-first) ──
    const resolvedMap = new Map<string, VetoResult | null>();

    const uncached = linePackages
      .map((lp) => lp.packageName)
      .filter((pkg, idx, arr) => arr.indexOf(pkg) === idx) // unique
      .filter((pkg) => !this.cache.get(pkg));

    // Fetch all uncached packages in parallel (capped to avoid thundering herd)
    const BATCH_SIZE = 5;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((pkg) => this.client.vetoCheck(pkg))
      );
      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result) {
          this.cache.set(batch[j], result);
        }
        resolvedMap.set(batch[j], result);
      }
    }

    // Also pull cached results into the map
    for (const { packageName } of linePackages) {
      if (!resolvedMap.has(packageName)) {
        resolvedMap.set(packageName, this.cache.get(packageName));
      }
    }

    // ── Step 3: build decoration arrays ──
    const criticalRanges: vscode.DecorationOptions[] = [];
    const highRanges: vscode.DecorationOptions[] = [];
    const mediumRanges: vscode.DecorationOptions[] = [];

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
    }

    // ── Step 4: apply (guard against editor being closed) ──
    // Verify the editor is still open
    const stillActive = vscode.window.visibleTextEditors.includes(editor);
    if (!stillActive) {
      return;
    }

    editor.setDecorations(this.decorations.critical.type, criticalRanges);
    editor.setDecorations(this.decorations.high.type, highRanges);
    editor.setDecorations(this.decorations.medium.type, mediumRanges);
  }

  /** Removes all Crowsnest decorations from an editor. */
  private clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorations.critical.type, []);
    editor.setDecorations(this.decorations.high.type, []);
    editor.setDecorations(this.decorations.medium.type, []);
  }

  // ─── Hover message builder ────────────────────

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

  // ─── Public invalidation ─────────────────────

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
