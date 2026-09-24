'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Clock, RotateCcw, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchIncidents, replayIncident } from '@/lib/api';
import type { Incident } from '@/lib/types';
import { attackPatternIcon, attackPatternLabel, cn, severityConfig, timeAgo } from '@/lib/utils';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ToastProvider, useToast } from '@/components/ui/toast-provider';

export default function LogPage() {
  return (
    <ToastProvider>
      <LogPageContent />
    </ToastProvider>
  );
}

function LogPageContent() {
  const { toast } = useToast();
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
      toast({
        message: `Replay complete for: ${attackPatternLabel(incident.attack_pattern)}`,
        tone: 'success',
      });
    } catch (err) {
      toast({
        message: `Replay failed: ${err instanceof Error ? err.message : String(err)}`,
        tone: 'error',
      });
    } finally {
      setReplaying(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Log" description="Incident history and Time Machine replay" />

      {isLoading ? (
        <PageSpinner />
      ) : !incidents || incidents.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-text-muted">
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
  const config = severityConfig(incident.severity);

  return (
    <Card className={cn('cursor-pointer transition-colors hover:brightness-110', config.bg, config.border)}>
      <div className="flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="text-lg">{attackPatternIcon(incident.attack_pattern)}</span>
          <div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <span className="text-sm font-medium text-text-primary">
                {attackPatternLabel(incident.attack_pattern)}
              </span>
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {incident.packages.slice(0, 3).join(', ')} · {timeAgo(incident.detected_at)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onReplay(incident); }}
            disabled={isReplaying}
          >
            {isReplaying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            {isReplaying ? 'Replaying...' : 'Replay'}
          </Button>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-text-secondary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-text-muted mb-1">Packages</div>
              <div className="space-y-0.5">
                {incident.packages.map((p) => (
                  <div key={p} className="font-mono text-text-primary">{p}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Blast radius ({incident.blast_radius.length})</div>
              <div className="space-y-0.5">
                {incident.blast_radius.slice(0, 5).map((b, i) => (
                  <div key={i} className="text-text-secondary truncate">
                    {b.package} in {b.project_path.split('/').slice(-1)[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-text-muted text-xs mb-1">Remediation options</div>
            <ol className="space-y-0.5 text-xs text-text-secondary">
              {incident.remediation_options.map((r, i) => (
                <li key={i}>{i + 1}. {r}</li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <Badge variant={incident.runtime_confirmation ? 'danger' : 'dim'}>
              {incident.runtime_confirmation ? '⚡ Runtime confirmed' : '○ Not runtime confirmed'}
            </Badge>
            <Badge variant="default">
              {Math.round(incident.confidence * 100)}% confidence
            </Badge>
          </div>
        </div>
      )}
    </Card>
  );
}
