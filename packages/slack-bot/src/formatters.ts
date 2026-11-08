/**
 * Converts Crowsnest API data into Slack Block Kit message payloads.
 *
 * Design principles:
 *  - Every public function returns Block[] (array of Slack blocks)
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

const ATTACK_PATTERN_LABEL: Record<AttackPattern, string> = {
  maintainer_takeover: 'Maintainer Takeover',
  worm:                'Token-Theft Worm',
  slopsquat:           'Slopsquatting',
  slsa_poisoning:      'SLSA-Attested Malware',
  sleeper:             'Sleeper Dependency',
  identity_drift:      'Identity Drift',
  typosquat:           'Typosquatting',
  dep_confusion:       'Dependency Confusion',
};

function section(text: string): Block {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

const DIVIDER: Block = { type: 'divider' };

function context(...elements: string[]): Block {
  return {
    type: 'context',
    elements: elements.map((e) => ({ type: 'mrkdwn', text: e })),
  };
}

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
  const pattern = ATTACK_PATTERN_LABEL[inc.attack_pattern] ?? inc.attack_pattern;
  const pkgs = inc.packages.slice(0, 3).join(', ') +
    (inc.packages.length > 3 ? ` +${inc.packages.length - 3} more` : '');
  return `*${inc.severity}* — ${pattern} — \`${pkgs}\``;
}

/** The API sends blast_radius as a count from some endpoints and as a list of affected projects from others. */
function blastRadiusCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return typeof value === 'number' ? value : 0;
}

export function formatScanResult(
  result: ScanResult,
  projectPath: string,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const incidents = result.incidents;
  const total = incidents.length;

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
    ? `Crowsnest Scan Complete — Action Required`
    : `Crowsnest Scan Complete — No Critical Issues`;

  const blocks: Block[] = [
    header(headerText),
    section(
      `*Project:* \`${projectPath}\`\n` +
      `*Packages scanned:* ${result.packages_scanned}\n` +
      `*Total incidents:* ${total}`
    ),
    DIVIDER,
  ];

  const severityLines = (
    Object.entries(bySeverity) as Array<[Severity, number]>
  )
    .filter(([, count]) => count > 0)
    .map(([sev, count]) => `*${sev}:* ${count}`)
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
          `Blast radius: ${blastRadiusCount(inc.blast_radius)} projects` +
          (inc.runtime_confirmation ? ' | Runtime confirmed' : '')
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

/**
 * Format a single incident as a real-time alert (for SSE push notifications).
 */
export function formatIncidentAlert(
  incident: Incident,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const pattern = ATTACK_PATTERN_LABEL[incident.attack_pattern] ?? incident.attack_pattern;
  const pkgList = incident.packages
    .slice(0, 5)
    .map((p) => `\`${p}\``)
    .join(', ') + (incident.packages.length > 5 ? ` +${incident.packages.length - 5} more` : '');

  const firstRemediation = incident.remediation_options[0];

  const blocks: Block[] = [
    header(`${incident.severity} Alert — ${pattern}`),
    section(
      `*Packages:* ${pkgList}\n` +
      `*Confidence:* ${confidenceBar(incident.confidence)}\n` +
      `*Blast radius:* ${blastRadiusCount(incident.blast_radius)} internal project(s)` +
      (incident.runtime_confirmation ? '\n*Runtime:* Confirmed active' : '')
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
          (firstRemediation.pr_ready ? '| PR auto-generation available' : '')
        )
      );
    }
  }

  blocks.push(
    DIVIDER,
    context(
      `Incident ID: \`${incident.id}\` • Detected ${new Date(incident.detected_at).toLocaleString()}`
    ),
    dashboardButton(`${dashboardUrl}/log?incident=${incident.id}`, 'Investigate')
  );

  return blocks;
}

/**
 * Format blast radius analysis results as Slack blocks.
 */
export function formatBlastRadius(
  maintainer: string,
  result: BlastRadiusResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const riskPct = Math.round(result.risk_score * 100);

  const blocks: Block[] = [
    header(`Blast Radius Analysis — @${maintainer}`),
    section(
      `*Risk score:* ${riskPct}%\n` +
      `*Compromised packages (owned by maintainer):* ${result.compromised_packages.length}\n` +
      `*Affected internal projects:* ${result.affected_projects.length}\n` +
      `*Affected transitive dependencies:* ${result.affected_packages.length}\n` +
      `*Runtime exposure:* ${result.runtime_exposed ? 'Yes — this package is loaded at runtime' : 'Not observed at runtime'}`
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

/**
 * Format a package investigation result as Slack blocks.
 */
export function formatInvestigation(
  pkg: string,
  result: InvestigationResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {

  const facts = [
    `• Risk: ${Math.round(result.risk * 100)}%`,
    result.weekly_downloads != null ? `• Weekly downloads: ${result.weekly_downloads.toLocaleString('en-US')}` : null,
    result.age_days != null ? `• Package age: ${result.age_days} days` : null,
    result.maintainers.length > 0 ? `• Maintainers: ${result.maintainers.join(', ')}` : null,
    result.socket_alerts > 0 ? `• Socket.dev alerts: ${result.socket_alerts}` : null,
  ].filter((l): l is string => l !== null);

  const blocks: Block[] = [
    header(`${result.call}: \`${pkg}\``),
    section(result.signals.length > 0 ? `*Why:*\n${result.signals.map((s) => `• ${s}`).join('\n')}` : '*Why:* nothing was raised.'),
    DIVIDER,
    section(`*What Crowsnest knows:*\n${facts.join('\n')}`),
  ];

  if (result.not_checked.length > 0) {
    blocks.push(section(`*Not checked:*\n${result.not_checked.map((n) => `• ${n}`).join('\n')}`));
  }

  blocks.push(
    DIVIDER,
    dashboardButton(`${dashboardUrl}/hold?package=${encodeURIComponent(pkg)}`, 'View in Hold')
  );

  return blocks;
}

/**
 * Format system statistics as a Slack blocks summary.
 */
export function formatStats(
  result: StatsResult,
  dashboardUrl = 'http://localhost:3000'
): Block[] {
  const { active_incidents: ai } = result;
  const totalIncidents = ai.CRITICAL + ai.HIGH + ai.MEDIUM + ai.LOW;

  const blocks: Block[] = [
    header('Crowsnest Status'),
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
      .map(([sev, count]) => `*${sev}:* ${count}`);

    blocks.push(section(lines.join('   ')));
  } else {
    blocks.push(section('_No active incidents. Supply chain looks clean._'));
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

function severityRank(s: Severity): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[s] ?? 99;
}
