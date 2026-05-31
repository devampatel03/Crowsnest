'use client';

import { useEffect, useRef, useState } from 'react';
import type { SecurityEvent } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useSSEStream(onEvent: (event: SecurityEvent) => void): {
  connected: boolean;
  reconnect: () => void;
} {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef(1000);
  const onEventRef = useRef(onEvent);

  // Keep onEventRef updated with latest callback
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = () => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(`${API_URL}/api/events`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      backoffRef.current = 1000; // reset backoff on successful connection
    };

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as SecurityEvent;
        onEventRef.current(data);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
      const delay = Math.min(backoffRef.current, 30000);
      backoffRef.current = Math.min(delay * 2, 30000);
      setTimeout(connect, delay);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, reconnect: connect };
}
