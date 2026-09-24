import { getConfig } from '../config.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';

/**
 * `crowsnest watch` streams live supply chain events to the console only.
 * It does not post to Slack — use the @crowsnest/slack-bot package (Bolt
 * Socket Mode bot) for chat alerts, which already subscribes to the same
 * SSE stream and handles severity-based routing.
 */
export async function watchCommand(): Promise<void> {
  const { apiUrl } = getConfig();
  const sseUrl = `${apiUrl}/api/events`;

  console.log();
  console.log(theme.brand('  CROWSNEST WATCH') + theme.muted(' — live event stream'));
  console.log(theme.muted(`  Connecting to ${sseUrl}...`));
  console.log(theme.muted('  Press Ctrl+C to stop'));
  console.log();

  const EventSource = (await import('eventsource')).default;
  const es = new EventSource(sseUrl);

  es.onopen = () => {
    console.log(theme.success(`  ${icons.dot} Connected`) + theme.muted(' — monitoring npm publish firehose'));
    console.log();
  };

  es.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      renderEvent(data);
    } catch {
      // ignore malformed events
    }
  };

  es.onerror = () => {
    console.log(theme.status.warning(`  ⚡ Connection lost, reconnecting...`));
  };

  // Keep process alive
  await new Promise<never>(() => {});
}

function renderEvent(event: Record<string, unknown>): void {
  const ts = new Date().toLocaleTimeString();
  const type = String(event.type || '');

  if (type === 'publish_event') {
    const pkg = String(event.package || '');
    const ver = String(event.version || '');
    // Dim for regular, bright for suspicious
    const isSuspicious = String(event.probability || 0) > '0.5';
    const color = isSuspicious ? theme.status.warning : theme.muted;
    const flag = isSuspicious ? theme.status.warning(` ${icons.warn} suspicious`) : '';
    console.log(color(`  [${ts}] ${icons.pkg} ${pkg}@${ver}${flag}`));
  } else if (type === 'incident_detected') {
    const sev = String(event.severity || 'MEDIUM');
    const pattern = String(event.attack_pattern || '');
    const packages = (event.packages as string[] || []).slice(0, 2).join(', ');
    const color = sev === 'CRITICAL' ? theme.severity.CRITICAL : sev === 'HIGH' ? theme.severity.HIGH : theme.status.warning;
    console.log(color(`  [${ts}] ${icons.critical} INCIDENT: ${sev} — ${pattern} — ${packages}`));
  } else if (type === 'scan_progress') {
    const phase = String(event.phase || '');
    if (phase === 'complete') {
      const incidents = Number(event.incidents_found || 0);
      const tokens = Number(event.token_usage || 0);
      console.log(theme.brand(`  [${ts}] ${icons.ok} Scan complete — ${incidents} incident(s) — ${tokens.toLocaleString()} tokens`));
    }
  }
}
