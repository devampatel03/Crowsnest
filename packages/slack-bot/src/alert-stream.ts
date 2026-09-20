/**
 * src/alert-stream.ts
 *
 * Subscribes to the Crowsnest API's Server-Sent Events stream at GET /api/events.
 * Fires the onAlert callback for every CRITICAL or HIGH incident_detected event.
 * Auto-reconnects with exponential backoff if the connection drops.
 */

import EventSource from 'eventsource';
import type { Incident, PublishEvent, IncidentEvent } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Initial reconnect delay — doubles on each failure, caps at MAX_BACKOFF_MS */
const BASE_BACKOFF_MS    = 2_000;
const MAX_BACKOFF_MS     = 60_000;

/** Only alert on these severities via SSE */
const ALERT_SEVERITIES   = new Set(['CRITICAL', 'HIGH']);

// ---------------------------------------------------------------------------
// AlertStream
// ---------------------------------------------------------------------------

export class AlertStream {
  private es: EventSource | null = null;
  private backoffMs               = BASE_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped                 = false;

  constructor(
    private readonly apiUrl: string,
    private readonly onAlert: (incident: Incident) => Promise<void>,
    private readonly onPublishEvent: (event: PublishEvent) => void
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Connect to the SSE stream and start listening.
   * Safe to call multiple times — cleans up any existing connection first.
   */
  start(): void {
    this.stopped = false;
    this.connect();
  }

  /**
   * Permanently stop the stream and cancel any pending reconnect.
   */
  stop(): void {
    this.stopped = true;
    this.cancelReconnect();
    this.closeEventSource();
    console.log('[alert-stream] Stopped.');
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;

    const url = `${this.apiUrl.replace(/\/$/, '')}/api/events`;
    console.log(`[alert-stream] Connecting to ${url}…`);

    this.closeEventSource();

    try {
      this.es = new EventSource(url);
    } catch (err) {
      console.error('[alert-stream] Failed to create EventSource:', err);
      this.scheduleReconnect();
      return;
    }

    // ----- Connection opened -----
    this.es.addEventListener('open', () => {
      console.log('[alert-stream] ✅ Connected to Crowsnest event stream.');
      this.backoffMs = BASE_BACKOFF_MS; // Reset backoff on successful connection
    });

    // ----- Default message handler (event type: 'message') -----
    this.es.addEventListener('message', (ev: MessageEvent) => {
      this.handleRawEvent(ev.data as string);
    });

    // ----- Named event: incident_detected -----
    this.es.addEventListener('incident_detected', (ev: MessageEvent) => {
      this.handleRawEvent(ev.data as string, 'incident_detected');
    });

    // ----- Named event: scan_started -----
    this.es.addEventListener('scan_started', (ev: MessageEvent) => {
      this.handleRawEvent(ev.data as string, 'scan_started');
    });

    // ----- Named event: scan_complete -----
    this.es.addEventListener('scan_complete', (ev: MessageEvent) => {
      this.handleRawEvent(ev.data as string, 'scan_complete');
    });

    // ----- Named event: heartbeat -----
    this.es.addEventListener('heartbeat', () => {
      // Just a keep-alive ping — reset backoff to show the link is alive
      this.backoffMs = BASE_BACKOFF_MS;
    });

    // ----- Error / disconnection -----
    this.es.addEventListener('error', (err: Event) => {
      if (this.stopped) return;

      // EventSource's readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
      const state = this.es?.readyState ?? -1;
      if (state === 2 /* CLOSED */ || state === -1) {
        console.warn(
          `[alert-stream] Connection lost. Reconnecting in ${this.backoffMs / 1000}s…`,
          err
        );
        this.scheduleReconnect();
      }
      // If readyState is CONNECTING, the EventSource is already trying to reconnect.
      // We let it do its thing — but we'll also manage our own backoff for the case
      // where the server itself is down.
    });
  }

  // -------------------------------------------------------------------------
  // Event processing
  // -------------------------------------------------------------------------

  /**
   * Parse a raw SSE data string as JSON and route it to the appropriate handler.
   */
  private handleRawEvent(
    data: string,
    forcedType?: PublishEvent['type']
  ): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Some heartbeats are plain strings — ignore silently
      return;
    }

    // Normalise: if the payload already has a `type` field, use it.
    // Otherwise, use the named event type we were called with.
    const event = parsed as PublishEvent;
    const eventType: PublishEvent['type'] =
      (event.type as PublishEvent['type']) ?? forcedType ?? 'heartbeat';

    const raw = parsed as Record<string, unknown>;
    const publishEvent: PublishEvent = {
      type:      eventType,
      payload:   raw.payload ?? parsed,
      timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
    };

    // Notify the generic subscriber
    try {
      this.onPublishEvent(publishEvent);
    } catch (err) {
      console.error('[alert-stream] onPublishEvent threw:', err);
    }

    // Handle incident alerts
    if (eventType === 'incident_detected') {
      this.handleIncident(publishEvent as IncidentEvent);
    }
  }

  private handleIncident(event: IncidentEvent): void {
    const incident = event.payload as Incident;

    if (!incident || !incident.severity) {
      console.warn('[alert-stream] Received malformed incident payload:', event.payload);
      return;
    }

    if (!ALERT_SEVERITIES.has(incident.severity)) {
      // MEDIUM / LOW — log but don't alert
      console.log(
        `[alert-stream] Incident ${incident.id} severity=${incident.severity} — skipping alert.`
      );
      return;
    }

    console.log(
      `[alert-stream] 🚨 ${incident.severity} incident detected: ` +
        `${incident.attack_pattern} — ${incident.packages.join(', ')}`
    );

    // Fire the alert asynchronously; don't let errors bring down the stream
    this.onAlert(incident).catch((err) => {
      console.error('[alert-stream] onAlert threw:', err);
    });
  }

  // -------------------------------------------------------------------------
  // Reconnect logic
  // -------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.cancelReconnect();

    console.log(`[alert-stream] Will reconnect in ${this.backoffMs / 1000}s…`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
      // Exponential backoff, capped
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }, this.backoffMs);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeEventSource(): void {
    if (this.es) {
      try {
        this.es.close();
      } catch {
        // Ignore errors on close
      }
      this.es = null;
    }
  }
}
