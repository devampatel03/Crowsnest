'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Incident } from '@/lib/types';
import { format, subHours, startOfHour } from 'date-fns';

interface ThreatTimelineProps {
  incidents: Incident[];
}

export function ThreatTimeline({ incidents }: ThreatTimelineProps) {
  // Group incidents by hour over last 24 hours
  const hours = Array.from({ length: 24 }, (_, i) => subHours(new Date(), 23 - i));

  const data = hours.map((hour) => {
    const start = startOfHour(hour);
    const end = new Date(start.getTime() + 3600000);

    const inHour = incidents.filter((inc) => {
      const ts = new Date(inc.detected_at);
      return ts >= start && ts < end;
    });

    return {
      time: format(hour, 'HH:00'),
      CRITICAL: inHour.filter((i) => i.severity === 'CRITICAL').length,
      HIGH: inHour.filter((i) => i.severity === 'HIGH').length,
      MEDIUM: inHour.filter((i) => i.severity === 'MEDIUM').length,
      LOW: inHour.filter((i) => i.severity === 'LOW').length,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="time"
          tick={{ fill: '#475569', fontSize: 10 }}
          tickLine={false}
          interval={5}
        />
        <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Line type="monotone" dataKey="CRITICAL" stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="HIGH" stroke="#f97316" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="MEDIUM" stroke="#fbbf24" strokeWidth={1} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
