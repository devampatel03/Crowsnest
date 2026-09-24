/**
 * webview.ts — Investigation result webview
 *
 * Renders a rich VS Code WebviewPanel with all findings returned by the
 * Crowsnest /api/investigate endpoint, styled to match the Crowsnest dark theme.
 */

import * as vscode from 'vscode';
import { InvestigationResult, SocketAlert } from './client';

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Creates (or reveals) a WebviewPanel showing all investigation findings for
 * the given package.
 */
export function showInvestigationWebview(
  result: InvestigationResult,
  packageName: string
): void {
  const panel = vscode.window.createWebviewPanel(
    `crowsnest.investigation.${packageName}`,
    `Crowsnest: ${packageName}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false, // no JS needed — static HTML only
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = buildHtml(result);
}

// ─────────────────────────────────────────────
// HTML builder
// ─────────────────────────────────────────────

function buildHtml(result: InvestigationResult): string {
  const scorePercent = Math.round(result.riskScore * 100);
  const scoreColor = riskColor(result.riskScore);
  const badge = riskBadge(result.riskScore);

  const npmSection = result.npmMetadata ? buildNpmSection(result.npmMetadata) : '';
  const alertsSection =
    result.socketAlerts && result.socketAlerts.length > 0
      ? buildAlertsSection(result.socketAlerts)
      : '';
  const findingsSection =
    result.queryFindings && result.queryFindings.length > 0
      ? buildFindingsSection(result.queryFindings)
      : '';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crowsnest: ${esc(result.packageName)}</title>
  <style>
    /* ─── Reset & base ──────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      background: #05070f;
      color: #e7ecf7;
      padding: 24px;
    }

    h1, h2, h3 { font-weight: 600; }

    /* ─── Header ────────────────────────────── */
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid #223049;
    }

    .header-logo {
      font-size: 32px;
      line-height: 1;
    }

    .header-title h1 {
      font-size: 22px;
      color: #35e6d6;
      letter-spacing: -0.5px;
    }

    .header-title p {
      font-size: 12px;
      color: #9aa8c7;
      margin-top: 2px;
    }

    /* ─── Score card ────────────────────────── */
    .score-card {
      background: #0b1120;
      border: 1px solid #223049;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .score-ring {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 700;
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
      border: 4px solid ${scoreColor};
      color: ${scoreColor};
      flex-shrink: 0;
    }

    .score-details h2 {
      font-size: 16px;
      color: #e7ecf7;
      margin-bottom: 4px;
    }

    .verdict-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      background: ${badge.bg};
      color: ${badge.fg};
      margin-bottom: 8px;
    }

    .score-meta {
      font-size: 12px;
      color: #9aa8c7;
    }

    .score-meta strong {
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
    }

    /* ─── Section cards ─────────────────────── */
    .section {
      background: #0b1120;
      border: 1px solid #223049;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
    }

    .section-header {
      padding: 14px 20px;
      background: #131b2e;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 600;
      color: #9aa8c7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .section-body {
      padding: 16px 20px;
    }

    /* ─── Key-value table ───────────────────── */
    .kv-table {
      width: 100%;
      border-collapse: collapse;
    }

    .kv-table tr + tr td {
      border-top: 1px solid #223049;
    }

    .kv-table td {
      padding: 8px 4px;
      vertical-align: top;
    }

    .kv-table td:first-child {
      color: #9aa8c7;
      font-size: 12px;
      width: 160px;
      padding-right: 16px;
      white-space: nowrap;
    }

    .kv-table td:last-child {
      color: #e7ecf7;
      font-size: 13px;
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
    }

    /* ─── Alert rows ─────────────────────────── */
    .alert-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #223049;
    }

    .alert-row:last-child { border-bottom: none; }

    .alert-severity {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .sev-critical { background: rgba(255, 77, 94, .12); color: #ff4d5e; border: 1px solid rgba(255, 77, 94, .45); }
    .sev-high     { background: rgba(255, 138, 61, .12); color: #ff8a3d; border: 1px solid rgba(255, 138, 61, .45); }
    .sev-medium   { background: rgba(255, 176, 32, .12); color: #ffb020; border: 1px solid rgba(255, 176, 32, .45); }
    .sev-low      { background: rgba(53, 230, 214, .12); color: #35e6d6; border: 1px solid rgba(53, 230, 214, .45); }

    .alert-body strong {
      display: block;
      font-size: 13px;
      color: #e7ecf7;
      margin-bottom: 2px;
    }

    .alert-body span {
      font-size: 12px;
      color: #9aa8c7;
    }

    /* ─── Findings list ─────────────────────── */
    .findings-list {
      list-style: none;
      padding: 0;
    }

    .findings-list li {
      padding: 8px 0;
      border-bottom: 1px solid #223049;
      font-size: 13px;
      color: #9aa8c7;
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
      display: flex;
      gap: 10px;
    }

    .findings-list li:last-child { border-bottom: none; }

    .findings-list li::before {
      content: '→';
      color: #35e6d6;
      flex-shrink: 0;
    }

    /* ─── Empty state ───────────────────────── */
    .empty {
      color: #5b6b8c;
      font-size: 13px;
      font-style: italic;
    }

    /* ─── Footer ────────────────────────────── */
    .footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #223049;
      font-size: 11px;
      color: #5b6b8c;
      text-align: center;
    }

    .cyan { color: #35e6d6; }
    .pill {
      display: inline-block;
      background: #131b2e;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
      font-size: 12px;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-logo">⛵</div>
    <div class="header-title">
      <h1>Crowsnest Analysis</h1>
      <p>Supply Chain Sentinel — package: <span class="pill">${esc(result.packageName)}</span></p>
    </div>
  </div>

  <!-- Risk Score Card -->
  <div class="score-card">
    <div class="score-ring">${scorePercent}%</div>
    <div class="score-details">
      <span class="verdict-badge">${esc(result.verdict)}</span>
      <h2>Risk Assessment</h2>
      <div class="score-meta">
        Combined risk score: <strong style="color:${scoreColor}">${scorePercent}%</strong>
        &nbsp;·&nbsp; ai_authored_likelihood × slopsquat_probability
      </div>
      ${result.summary ? `<p style="margin-top:8px;font-size:13px;color:#9aa8c7">${esc(result.summary)}</p>` : ''}
    </div>
  </div>

  ${npmSection}
  ${alertsSection}
  ${findingsSection}

  <div class="footer">
    Crowsnest v0.1.0 &nbsp;·&nbsp; Analysis generated at ${new Date().toISOString()}
  </div>

</body>
</html>`;
}

// ─────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────

function buildNpmSection(
  meta: NonNullable<InvestigationResult['npmMetadata']>
): string {
  const rows: [string, string][] = [];

  if (meta.description) { rows.push(['Description', meta.description]); }
  if (meta.version)     { rows.push(['Latest Version', meta.version]); }
  if (meta.author)      { rows.push(['Author', meta.author]); }
  if (meta.license)     { rows.push(['License', meta.license]); }
  if (meta.weeklyDownloads !== undefined) {
    rows.push(['Weekly Downloads', meta.weeklyDownloads.toLocaleString()]);
  }
  if (meta.firstPublished) { rows.push(['First Published', meta.firstPublished]); }
  if (meta.lastPublished)  { rows.push(['Last Published', meta.lastPublished]); }
  if (meta.maintainers && meta.maintainers.length > 0) {
    rows.push(['Maintainers', meta.maintainers.join(', ')]);
  }

  if (rows.length === 0) {
    return '';
  }

  const tableRows = rows
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('\n');

  return /* html */ `
  <div class="section">
    <div class="section-header">📦 npm Metadata</div>
    <div class="section-body">
      <table class="kv-table">${tableRows}</table>
    </div>
  </div>`;
}

function buildAlertsSection(alerts: SocketAlert[]): string {
  const rows = alerts
    .map((a) => {
      const sevClass = `sev-${a.severity}`;
      return /* html */ `
      <div class="alert-row">
        <span class="alert-severity ${sevClass}">${esc(a.severity)}</span>
        <div class="alert-body">
          <strong>${esc(a.category)}</strong>
          <span>${esc(a.description)}</span>
        </div>
      </div>`;
    })
    .join('');

  return /* html */ `
  <div class="section">
    <div class="section-header">🔌 Socket Security Alerts</div>
    <div class="section-body">${rows}</div>
  </div>`;
}

function buildFindingsSection(findings: string[]): string {
  const items = findings
    .map((f) => `<li>${esc(f)}</li>`)
    .join('');

  return /* html */ `
  <div class="section">
    <div class="section-header">🔍 Investigation Findings</div>
    <div class="section-body">
      <ul class="findings-list">${items}</ul>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Escape HTML special characters to prevent XSS-style injection in webviews. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function riskColor(score: number): string {
  if (score > 0.8) { return '#ff4d5e'; } // critical
  if (score > 0.6) { return '#ff8a3d'; } // high
  if (score > 0.4) { return '#ffb020'; } // medium
  return '#35e6d6';                       // low
}

function riskBadge(score: number): { bg: string; fg: string } {
  if (score > 0.8) { return { bg: 'rgba(255, 77, 94, .12)', fg: '#ff4d5e' }; }
  if (score > 0.6) { return { bg: 'rgba(255, 138, 61, .12)', fg: '#ff8a3d' }; }
  if (score > 0.4) { return { bg: 'rgba(255, 176, 32, .12)', fg: '#ffb020' }; }
  return { bg: 'rgba(53, 230, 214, .12)', fg: '#35e6d6' };
}
