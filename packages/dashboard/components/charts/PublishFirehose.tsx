'use client';

import { useEffect, useRef, useState } from 'react';
import type { SecurityEvent } from '@/lib/types';

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
  const [entries, setEntries] = useState<FirehoseEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const publishEvents = events
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

    setEntries(publishEvents);
  }, [events]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="firehose-container font-mono text-xs space-y-0.5 p-2">
      {entries.length === 0 ? (
        <div className="text-slate-600 italic">Waiting for npm publish events...</div>
      ) : (
        entries.map((entry, i) => (
          <div
            key={i}
            className={entry.suspicious ? 'text-amber-400' : 'text-slate-500'}
          >
            <span className="text-slate-600">[{entry.ts}]</span>{' '}
            {entry.suspicious ? '⚠' : '✓'}{' '}
            <span className={entry.suspicious ? 'text-amber-300 font-medium' : 'text-slate-400'}>
              {entry.package}@{entry.version}
            </span>
            {entry.suspicious && entry.reason && (
              <span className="text-amber-600 ml-2">← {entry.reason}</span>
            )}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
