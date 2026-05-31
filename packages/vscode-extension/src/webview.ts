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
      background: #020817;
      color: #e2e8f0;
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
      border-bottom: 1px solid #1e293b;
    }

    .header-logo {
      font-size: 32px;
      line-height: 1;
    }

    .header-title h1 {
      font-size: 22px;
      color: #06b6d4;
      letter-spacing: -0.5px;
    }

    .header-title p {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }

    /* ─── Score card ────────────────────────── */
    .score-card {
      background: #0f172a;
      border: 1px solid #1e293b;
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
      border: 4px solid ${scoreColor};
      color: ${scoreColor};
      flex-shrink: 0;
    }

    .score-details h2 {
      font-size: 16px;
      color: #f1f5f9;
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
      color: #64748b;
    }

    /* ─── Section cards ─────────────────────── */
    .section {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
    }

    .section-header {
      padding: 14px 20px;
      background: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
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
      border-top: 1px solid #1e293b;
    }

    .kv-table td {
      padding: 8px 4px;
      vertical-align: top;
    }

    .kv-table td:first-child {
      color: #64748b;
      font-size: 12px;
      width: 160px;
      padding-right: 16px;
      white-space: nowrap;
    }

    .kv-table td:last-child {
      color: #e2e8f0;
      font-size: 13px;
    }

    /* ─── Alert rows ─────────────────────────── */
    .alert-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #1e293b;
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

    .sev-critical { background: #7f1d1d; color: #fca5a5; }
    .sev-high     { background: #7c2d12; color: #fdba74; }
    .sev-medium   { background: #713f12; color: #fcd34d; }
    .sev-low      { background: #1e3a5f; color: #93c5fd; }

    .alert-body strong {
      display: block;
      font-size: 13px;
      color: #f1f5f9;
      margin-bottom: 2px;
    }

    .alert-body span {
      font-size: 12px;
      color: #94a3b8;
    }

    /* ─── Findings list ─────────────────────── */
    .findings-list {
      list-style: none;
      padding: 0;
    }

    .findings-list li {
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
      font-size: 13px;
      color: #cbd5e1;
      display: flex;
      gap: 10px;
    }

    .findings-list li:last-child { border-bottom: none; }

    .findings-list li::before {
      content: '→';
      color: #06b6d4;
      flex-shrink: 0;
    }

    /* ─── Empty state ───────────────────────── */
    .empty {
      color: #475569;
      font-size: 13px;
      font-style: italic;
    }

    /* ─── Footer ────────────────────────────── */
    .footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #1e293b;
      font-size: 11px;
      color: #334155;
      text-align: center;
    }

    .cyan { color: #06b6d4; }
    .pill {
      display: inline-block;
      background: #1e293b;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
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
      ${result.summary ? `<p style="margin-top:8px;font-size:13px;color:#94a3b8">${esc(result.summary)}</p>` : ''}
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
  if (score > 0.8) { return '#ef4444'; } // red
  if (score > 0.6) { return '#f97316'; } // orange
  if (score > 0.4) { return '#eab308'; } // yellow
  return '#22c55e';                       // green
}

function riskBadge(score: number): { bg: string; fg: string } {
  if (score > 0.8) { return { bg: '#7f1d1d', fg: '#fca5a5' }; }
  if (score > 0.6) { return { bg: '#7c2d12', fg: '#fdba74' }; }
  if (score > 0.4) { return { bg: '#713f12', fg: '#fcd34d' }; }
  return { bg: '#14532d', fg: '#86efac' };
}
