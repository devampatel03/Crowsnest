/**
 * src/formatters.ts
 *
 * Converts Crowsnest API data into Slack Block Kit message payloads.
 *
 * Design principles:
 *  - Every public function returns Block[] (array of Slack blocks)
 *  - Emoji convey severity / attack pattern at a glance
 *  - Blocks stay concise — Slack caps at 50 blocks per message
 *  - Dashboard deep-link button is included in every result
 */

import type {
  Block,
  Incident,
  ScanResult,
  BlastRadiusResult,
  InvestigationResult,
  StatsResult,
  Severity,
  AttackPattern,
} from './types.js';

// ---------------------------------------------------------------------------
// Emoji mappings
// ---------------------------------------------------------------------------

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: '🚨',
  HIGH:     '⛔',
  MEDIUM:   '⚠️',
  LOW:      'ℹ️',
};

const ATTACK_PATTERN_LABEL: Record<AttackPattern, string> = {
  maintainer_takeover: '👤 Maintainer Takeover',
  worm:                '🐛 Token-Theft Worm',
  slopsquat:           '🤖 Slopsquatting',
  slsa_poisoning:      '🔒 SLSA-Attested Malware',
  sleeper:             '😴 Sleeper Dependency',
  identity_drift:      '🎭 Identity Drift',
  typosquat:           '🔤 Typosquatting',
  dep_confusion:       '🔀 Dependency Confusion',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a simple text section block */
function section(text: string): Block {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

/** Divider line */
const DIVIDER: Block = { type: 'divider' };

/** Context block with smaller muted text */
function context(...elements: string[]): Block {
  return {
    type: 'context',
    elements: elements.map((e) => ({ type: 'mrkdwn', text: e })),
  };
}

/** Header block (bold, larger text) */
function header(text: string): Block {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

/**
 * Dashboard button block.
 * url must be an absolute https or http URL.
 */
function dashboardButton(dashboardUrl: string, label = 'Open Dashboard'): Block {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: label, emoji: true },
        url: dashboardUrl,
        style: 'primary',
      },
    ],
  };
}

/** Confidence bar (e.g. ▓▓▓░░ 62%) */
function confidenceBar(confidence: number): string {
  const pct = Math.round(confidence * 100);
  const filled = Math.round(confidence * 5);
  const bar = '▓'.repeat(filled) + '░'.repeat(5 - filled);
  return `${bar} ${pct}%`;
}

/** Format a single incident as a short summary line (for scan result lists) */
function incidentSummaryLine(inc: Incident): string {
  const emoji = SEVERITY_EMOJI[inc.severity] ?? '❓';
  const pattern = ATTACK_PATTERN_LABEL[inc.attack_pattern] ?? inc.attack_pattern;
  const pkgs = inc.packages.slice(0, 3).join(', ') +
    (inc.packages.length > 3 ? ` +${inc.packages.length - 3} more` : '');
  return `${emoji} *${inc.severity}* — ${pattern} — \`${pkgs}\``;
}

// ---------------------------------------------------------------------------
// Public formatters
// ---------------------------------------------------------------------------

/**
 * Format a completed scan result as Slack Block Kit blocks.
 */
export function formatScanResult(
  result: ScanResult,
  projectPath: string,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const incidents = result.incidents;
  const total = incidents.length;

  // Count by severity
  const bySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH:     0,
    MEDIUM:   0,
    LOW:      0,
  };
  for (const inc of incidents) {
    bySeverity[inc.severity] = (bySeverity[inc.severity] ?? 0) + 1;
  }

  const hasCritical = bySeverity.CRITICAL > 0 || bySeverity.HIGH > 0;
  const headerText = hasCritical
    ? `🚨 Crowsnest Scan Complete — Action Required`
    : `✅ Crowsnest Scan Complete — No Critical Issues`;

  const blocks: Block[] = [
    header(headerText),
    section(
      `*Project:* \`${projectPath}\`\n` +
      `*Packages scanned:* ${result.packages_scanned}\n` +
      `*Total incidents:* ${total}`
    ),
    DIVIDER,
  ];

  // Severity breakdown
  const severityLines = (
    Object.entries(bySeverity) as Array<[Severity, number]>
  )
    .filter(([, count]) => count > 0)
    .map(([sev, count]) => `${SEVERITY_EMOJI[sev]} *${sev}:* ${count}`)
    .join('   ');

  if (severityLines) {
    blocks.push(section(`*Severity breakdown:*\n${severityLines}`));
  }

  // Top 3 incidents
  if (incidents.length > 0) {
    const top3 = incidents
      // Sort: CRITICAL first, then HIGH, MEDIUM, LOW
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 3);

    blocks.push(
      DIVIDER,
      section(`*Top incidents:*`),
      ...top3.map((inc) =>
        section(
          `${incidentSummaryLine(inc)}\n` +
          `  Confidence: ${confidenceBar(inc.confidence)} | ` +
          `Blast radius: ${inc.blast_radius} projects` +
          (inc.runtime_confirmation ? ' | ✅ Runtime confirmed' : '')
        )
      )
    );

    if (incidents.length > 3) {
      blocks.push(
        context(`_…and ${incidents.length - 3} more incident(s). Open the dashboard for the full report._`)
      );
    }
  } else {
    blocks.push(section('_No supply chain incidents detected in this scan._'));
  }

  blocks.push(
    DIVIDER,
    context(`Scan ID: \`${result.scan_id}\` • Completed ${new Date(result.scanned_at).toLocaleString()}`),
    dashboardButton(dashboardUrl)
  );

  return blocks;
}

// ---------------------------------------------------------------------------

/**
 * Format a single incident as a real-time alert (for SSE push notifications).
 */
export function formatIncidentAlert(
  incident: Incident,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const emoji = SEVERITY_EMOJI[incident.severity] ?? '❓';
  const pattern = ATTACK_PATTERN_LABEL[incident.attack_pattern] ?? incident.attack_pattern;
  const pkgList = incident.packages
    .slice(0, 5)
    .map((p) => `\`${p}\``)
    .join(', ') + (incident.packages.length > 5 ? ` +${incident.packages.length - 5} more` : '');

  const firstRemediation = incident.remediation_options[0];

  const blocks: Block[] = [
    header(`${emoji} ${incident.severity} Alert — ${pattern}`),
    section(
      `*Packages:* ${pkgList}\n` +
      `*Confidence:* ${confidenceBar(incident.confidence)}\n` +
      `*Blast radius:* ${incident.blast_radius} internal project(s)` +
      (incident.runtime_confirmation ? '\n*Runtime:* ✅ Confirmed active' : '')
    ),
  ];

  if (incident.description) {
    blocks.push(section(`*Details:* ${incident.description}`));
  }

  if (firstRemediation) {
    if (typeof firstRemediation === 'string') {
      // API returns plain string remediations
      const allSteps = incident.remediation_options
        .filter((r): r is string => typeof r === 'string')
        .slice(0, 3);
      blocks.push(
        DIVIDER,
        section(
          `*Recommended actions:*\n` +
          allSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
        )
      );
    } else {
      // Legacy object format
      blocks.push(
        DIVIDER,
        section(
          `*Recommended action:* ${firstRemediation.action}\n` +
          `${firstRemediation.description}\n` +
          `_Reversibility: ${firstRemediation.reversibility}_ ` +
          (firstRemediation.pr_ready ? '| 🤖 PR auto-generation available' : '')
        )
      );
    }
  }

  blocks.push(
    DIVIDER,
    context(
      `Incident ID: \`${incident.id}\` • Detected ${new Date(incident.detected_at).toLocaleString()}`
    ),
    dashboardButton(`${dashboardUrl}/log?incident=${incident.id}`, '🔍 Investigate')
  );

  return blocks;
}

// ---------------------------------------------------------------------------

/**
 * Format blast radius analysis results as Slack blocks.
 */
export function formatBlastRadius(
  maintainer: string,
  result: BlastRadiusResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const riskPct = Math.round(result.risk_score * 100);
  const riskEmoji = result.risk_score >= 0.7 ? '🚨' : result.risk_score >= 0.4 ? '⚠️' : '✅';

  const blocks: Block[] = [
    header(`${riskEmoji} Blast Radius Analysis — @${maintainer}`),
    section(
      `*Risk score:* ${riskPct}%\n` +
      `*Compromised packages (owned by maintainer):* ${result.compromised_packages.length}\n` +
      `*Affected internal projects:* ${result.affected_projects.length}\n` +
      `*Affected transitive dependencies:* ${result.affected_packages.length}\n` +
      `*Runtime exposure:* ${result.runtime_exposed ? '⚠️ Yes — this package is loaded at runtime' : '✅ Not observed at runtime'}`
    ),
    DIVIDER,
  ];

  // List compromised packages (up to 10)
  if (result.compromised_packages.length > 0) {
    const shown = result.compromised_packages.slice(0, 10);
    const rest = result.compromised_packages.length - shown.length;
    blocks.push(
      section(
        `*Packages owned by @${maintainer}:*\n` +
        shown.map((p) => `• \`${p}\``).join('\n') +
        (rest > 0 ? `\n_…and ${rest} more_` : '')
      )
    );
  }

  // Affected projects (up to 5)
  if (result.affected_projects.length > 0) {
    const shown = result.affected_projects.slice(0, 5);
    const rest = result.affected_projects.length - shown.length;
    blocks.push(
      section(
        `*Your affected projects:*\n` +
        shown.map((p) => `• ${p}`).join('\n') +
        (rest > 0 ? `\n_…and ${rest} more_` : '')
      )
    );
  }

  blocks.push(
    DIVIDER,
    context(
      `If @${maintainer}'s npm/GitHub account were compromised today, ` +
      `${result.total_affected} packages/projects would be directly exposed.`
    ),
    dashboardButton(`${dashboardUrl}/lookout?maintainer=${encodeURIComponent(maintainer)}`, 'View in Lookout')
  );

  return blocks;
}

// ---------------------------------------------------------------------------

/**
 * Format a package investigation result as Slack blocks.
 */
export function formatInvestigation(
  pkg: string,
  result: InvestigationResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const verdictEmoji =
    result.verdict === 'compromised' ? '🚨' :
    result.verdict === 'suspicious'  ? '⚠️' : '✅';

  const blocks: Block[] = [
    header(`${verdictEmoji} Investigation: \`${pkg}\``),
    section(
      `*Verdict:* ${verdictEmoji} ${result.verdict.toUpperCase()}\n` +
      `*Summary:* ${result.summary}`
    ),
    DIVIDER,
    section(
      `*Analysis signals:*\n` +
      `• Maintainer changes (recent): ${result.analysis.maintainer_changes}\n` +
      (result.analysis.days_since_maintainer_change != null
        ? `• Days since last maintainer change: ${result.analysis.days_since_maintainer_change}\n`
        : '') +
      `• Commit pattern anomaly: ${result.analysis.commit_pattern_anomaly ? '⚠️ Yes' : '✅ No'}\n` +
      `• SLSA attestation present: ${result.analysis.slsa_attestation ? '✅ Yes' : '❌ No'}\n` +
      (result.analysis.slsa_attestation
        ? `• SLSA pipeline risk: ${result.analysis.slsa_pipeline_risk ? '⚠️ Risky pipeline' : '✅ Pipeline looks clean'}\n`
        : '') +
      `• Socket.dev alerts: ${result.analysis.socket_alerts}\n` +
      `• Weekly downloads: ${result.analysis.weekly_downloads.toLocaleString()}\n` +
      `• Package age: ${result.analysis.age_days} days`
    ),
  ];

  // If there's an active incident, show it
  if (result.incident) {
    const inc = result.incident;
    const pattern = ATTACK_PATTERN_LABEL[inc.attack_pattern] ?? inc.attack_pattern;
    blocks.push(
      DIVIDER,
      section(
        `*Active incident:* ${SEVERITY_EMOJI[inc.severity]} ${inc.severity} — ${pattern}\n` +
        `Confidence: ${confidenceBar(inc.confidence)} | ` +
        `Blast radius: ${inc.blast_radius} projects\n` +
        (inc.remediation_options[0]
          ? `*Fix:* ${typeof inc.remediation_options[0] === 'string'
              ? inc.remediation_options[0]
              : `${inc.remediation_options[0].action} — ${inc.remediation_options[0].description}`}`
          : '')
      )
    );
  }

  blocks.push(
    DIVIDER,
    dashboardButton(`${dashboardUrl}/hold?package=${encodeURIComponent(pkg)}`, 'View in Hold')
  );

  return blocks;
}

// ---------------------------------------------------------------------------

/**
 * Format system statistics as a Slack blocks summary.
 */
export function formatStats(
  result: StatsResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const { active_incidents: ai } = result;
  const totalIncidents = ai.CRITICAL + ai.HIGH + ai.MEDIUM + ai.LOW;
  const statusEmoji = ai.CRITICAL > 0 ? '🚨' : ai.HIGH > 0 ? '⛔' : '✅';

  const blocks: Block[] = [
    header(`${statusEmoji} Crowsnest Status`),
    section(
      `*Packages in graph:* ${result.total_packages.toLocaleString()}\n` +
      `*Maintainers tracked:* ${result.total_maintainers.toLocaleString()}\n` +
      `*Active incidents:* ${totalIncidents}`
    ),
  ];

  if (totalIncidents > 0) {
    const lines = (
      [
        ['CRITICAL', ai.CRITICAL] as const,
        ['HIGH',     ai.HIGH]     as const,
        ['MEDIUM',   ai.MEDIUM]   as const,
        ['LOW',      ai.LOW]      as const,
      ] as const
    )
      .filter(([, count]) => count > 0)
      .map(([sev, count]) => `${SEVERITY_EMOJI[sev as Severity]} *${sev}:* ${count}`);

    blocks.push(section(lines.join('   ')));
  } else {
    blocks.push(section('_No active incidents. Supply chain looks clean._ 🎉'));
  }

  blocks.push(
    DIVIDER,
    context(
      result.last_scan_at
        ? `Last scan: ${new Date(result.last_scan_at).toLocaleString()} on \`${result.last_scan_project ?? 'unknown'}\``
        : '_No scans have been run yet._'
    ),
    dashboardButton(dashboardUrl)
  );

  return blocks;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function severityRank(s: Severity): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[s] ?? 99;
}
