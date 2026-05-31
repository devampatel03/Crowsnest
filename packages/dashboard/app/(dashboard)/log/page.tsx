'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Clock, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchIncidents, replayIncident } from '@/lib/api';
import type { Incident } from '@/lib/types';
import { attackPatternIcon, attackPatternLabel, timeAgo } from '@/lib/utils';
import { SeverityBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';

export default function LogPage() {
  const { data: incidents, isLoading } = useSWR<Incident[]>(
    '/api/incidents',
    () => fetchIncidents(),
    { refreshInterval: 60000 },
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);

  const handleReplay = async (incident: Incident) => {
    setReplaying(incident.id);
    try {
      await replayIncident(incident.attack_pattern);
      alert(`Replay complete for: ${attackPatternLabel(incident.attack_pattern)}`);
    } catch (err) {
      alert(`Replay failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReplaying(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Log</h1>
        <p className="text-sm text-slate-500">Incident history and Time Machine replay</p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !incidents || incidents.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div>No incidents in history</div>
            <div className="text-xs mt-1">Incidents detected by Crowsnest will appear here</div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentLogEntry
              key={incident.id}
              incident={incident}
              expanded={expanded === incident.id}
              onToggle={() => setExpanded(expanded === incident.id ? null : incident.id)}
              onReplay={handleReplay}
              isReplaying={replaying === incident.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface IncidentLogEntryProps {
  incident: Incident;
  expanded: boolean;
  onToggle: () => void;
  onReplay: (incident: Incident) => void;
  isReplaying: boolean;
}

function IncidentLogEntry({ incident, expanded, onToggle, onReplay, isReplaying }: IncidentLogEntryProps) {
  return (
    <Card className="cursor-pointer hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="text-lg">{attackPatternIcon(incident.attack_pattern)}</span>
          <div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <span className="text-sm font-medium text-slate-200">
                {attackPatternLabel(incident.attack_pattern)}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {incident.packages.slice(0, 3).join(', ')} · {timeAgo(incident.detected_at)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onReplay(incident); }}
            disabled={isReplaying}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 ${isReplaying ? 'animate-spin' : ''}`} />
            {isReplaying ? 'Replaying...' : 'Replay'}
          </button>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-500 mb-1">Packages</div>
              <div className="space-y-0.5">
                {incident.packages.map((p) => (
                  <div key={p} className="font-mono text-slate-300">{p}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">Blast radius ({incident.blast_radius.length})</div>
              <div className="space-y-0.5">
                {incident.blast_radius.slice(0, 5).map((b, i) => (
                  <div key={i} className="text-slate-400 truncate">
                    {b.package} in {b.project_path.split('/').slice(-1)[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-slate-500 text-xs mb-1">Remediation options</div>
            <ol className="space-y-0.5 text-xs text-slate-400">
              {incident.remediation_options.map((r, i) => (
                <li key={i}>{i + 1}. {r}</li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <div className={`text-xs px-2 py-1 rounded ${incident.runtime_confirmation ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'}`}>
              {incident.runtime_confirmation ? '⚡ Runtime confirmed' : '○ Not runtime confirmed'}
            </div>
            <div className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-500">
              {Math.round(incident.confidence * 100)}% confidence
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
