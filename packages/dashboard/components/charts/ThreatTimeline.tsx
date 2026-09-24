'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Incident } from '@/lib/types';
import { format, subHours, startOfHour } from 'date-fns';
import { chartColors } from '@/lib/chart-colors';

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
          tick={{ fill: chartColors.axis, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          interval={5}
        />
        <YAxis tick={{ fill: chartColors.axis, fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 6 }}
          labelStyle={{ color: chartColors.axis }}
        />
        <Line type="monotone" dataKey="CRITICAL" stroke={chartColors.critical} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="HIGH" stroke={chartColors.high} strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="MEDIUM" stroke={chartColors.medium} strokeWidth={1} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
