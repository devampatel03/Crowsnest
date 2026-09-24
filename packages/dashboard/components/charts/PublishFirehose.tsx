'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { SecurityEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface FirehoseEntry {
  ts: string;
  package: string;
  version: string;
  suspicious: boolean;
  reason?: string;
}

interface PublishFirehoseProps {
  events: SecurityEvent[];
}

export function PublishFirehose({ events }: PublishFirehoseProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // `entries` is entirely derived from `events` — compute it during render
  // with useMemo instead of useState+useEffect (calling setState synchronously
  // inside an effect causes an extra cascading render for no benefit here).
  const entries = useMemo<FirehoseEntry[]>(() => {
    return events
      .filter((e) => e.type === 'publish_event')
      .slice(-50)
      .map((e) => ({
        ts: new Date(e.timestamp).toLocaleTimeString(),
        package: e.package || '',
        version: e.version || '',
        suspicious: (e.probability || 0) > 0.5,
        reason: e.type === 'incident_detected' ? String(e.attack_pattern || '') : undefined,
      }))
      .filter((e) => e.package);
  }, [events]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="firehose-container font-mono text-xs space-y-0.5 p-2">
      {entries.length === 0 ? (
        <div className="text-text-muted italic">Waiting for npm publish events...</div>
      ) : (
        entries.map((entry, i) => (
          <div
            key={i}
            className={cn('font-mono', entry.suspicious ? 'text-severity-medium' : 'text-text-muted')}
          >
            <span className="text-text-muted">[{entry.ts}]</span>{' '}
            {entry.suspicious ? '⚠' : '✓'}{' '}
            <span className={entry.suspicious ? 'text-accent font-medium' : 'text-text-secondary'}>
              {entry.package}@{entry.version}
            </span>
            {entry.suspicious && entry.reason && (
              <span className="text-severity-medium ml-2">← {entry.reason}</span>
            )}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
