'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, RefreshCw, Zap, Play, CheckCircle2, XCircle, Folder, Loader2 } from 'lucide-react';
import { fetchIncidents, triggerScan } from '@/lib/api';
import { useSSEStream } from '@/lib/sse';
import type { Incident, SecurityEvent } from '@/lib/types';
import { attackPatternIcon, attackPatternLabel, timeAgo, cn } from '@/lib/utils';
import { SeverityBadge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveDot } from '@/components/ui/live-dot';
import { PageSpinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow } from '@/components/ui/stat-row';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { PublishFirehose } from '@/components/charts/PublishFirehose';
import { ThreatTimeline } from '@/components/charts/ThreatTimeline';

export default function HorizonPage() {
  const [liveEvents, setLiveEvents] = useState<SecurityEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'triggering' | 'ingesting' | 'running' | 'complete' | 'failed'>('idle');
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [incidentsFound, setIncidentsFound] = useState<number | null>(null);

  const { data: incidents, isLoading, mutate } = useSWR<Incident[]>(
    '/api/incidents',
    () => fetchIncidents(),
    { refreshInterval: 30000 },
  );

  const onEvent = useCallback((event: SecurityEvent) => {
    setLiveEvents((prev) => [...prev.slice(-100), event]);

    if (event.type === 'incident_detected') {
      mutate();
    }

    if (event.type === 'scan_progress' && activeScanId && event.scan_id === activeScanId) {
      if (event.phase === 'started') {
        setScanStatus('ingesting');
      } else if (event.phase === 'ingestion_complete') {
        setScanStatus('running');
      } else if (event.phase === 'complete') {
        setScanStatus('complete');
        setIncidentsFound(event.incidents_found ?? 0);
        mutate();
        setTimeout(() => {
          setScanStatus('idle');
          setActiveScanId(null);
          setIncidentsFound(null);
        }, 5000);
      } else if (event.phase === 'failed') {
        setScanStatus('failed');
        setScanError(event.error || 'Scan failed due to an unknown error');
      }
    }
  }, [activeScanId, mutate]);

  const handleStartScan = async () => {
    if (!projectPath.trim()) return;
    setScanStatus('triggering');
    setScanError(null);
    setIncidentsFound(null);
    setIsModalOpen(false);

    try {
      const res = await triggerScan(projectPath);
      setActiveScanId(res.scan_id);
    } catch (err: any) {
      setScanStatus('failed');
      setScanError(err.message || 'Failed to start scan');
      setActiveScanId(null);
    }
  };

  const { connected } = useSSEStream(onEvent);

  const sorted = [...(incidents || [])].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return order[a.severity] - order[b.severity];
  });

  const counts = {
    CRITICAL: sorted.filter((i) => i.severity === 'CRITICAL').length,
    HIGH: sorted.filter((i) => i.severity === 'HIGH').length,
    MEDIUM: sorted.filter((i) => i.severity === 'MEDIUM').length,
    LOW: sorted.filter((i) => i.severity === 'LOW').length,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Horizon"
        description="Active supply chain threats hitting your dependency graph"
        actions={
          <>
            <LiveDot connected={connected} />
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
              <Play className="w-3.5 h-3.5 fill-current" />
              Scan Project
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5 py-1.5"
              onClick={() => mutate()}
              aria-label="Refresh incidents"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </>
        }
      />

      {/* Scan Progress Banner */}
      {scanStatus !== 'idle' && (
        <Card className={cn(
          'transition-all duration-300 border',
          scanStatus === 'complete' ? 'border-success/30 bg-success/5 shadow-cyan-glow' :
          scanStatus === 'failed' ? 'border-severity-critical/30 bg-severity-critical-bg shadow-critical-glow' :
          'border-primary/30 bg-primary/5 shadow-cyan-glow'
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {(scanStatus === 'triggering' || scanStatus === 'ingesting' || scanStatus === 'running') && (
                <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
              )}
              {scanStatus === 'complete' && (
                <CheckCircle2 className="w-5 h-5 text-success" />
              )}
              {scanStatus === 'failed' && (
                <XCircle className="w-5 h-5 text-severity-critical" />
              )}

              <div>
                <h4 className="text-sm font-semibold text-text-primary">
                  {scanStatus === 'triggering' && 'Initializing Scan...'}
                  {scanStatus === 'ingesting' && 'Ingesting Project Lockfile...'}
                  {scanStatus === 'running' && 'Running LangGraph Agent Team...'}
                  {scanStatus === 'complete' && 'Scan Completed'}
                  {scanStatus === 'failed' && 'Scan Failed'}
                </h4>
                <p className="text-xs text-text-muted mt-0.5">
                  {scanStatus === 'triggering' && 'Registering scan task on the backend...'}
                  {scanStatus === 'ingesting' && 'Parsing dependencies and syncing with local DuckDB...'}
                  {scanStatus === 'running' && 'LLMs are executing detection plan, investigating signals, and triaging alerts...'}
                  {scanStatus === 'complete' && `Finished audit. Detected ${incidentsFound} new incident(s).`}
                  {scanStatus === 'failed' && (scanError || 'An error occurred during scanning.')}
                </p>
              </div>
            </div>

            {scanStatus === 'failed' && (
              <Button variant="secondary" size="sm" onClick={() => setScanStatus('idle')}>
                Close
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Scan trigger dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary-400">
                <Play className="w-5 h-5 fill-current animate-pulse" />
              </div>
              <div>
                <DialogTitle>Scan Project</DialogTitle>
                <DialogDescription>Run a supply chain security audit on a local directory</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="project-path" className="text-xs font-semibold text-text-secondary">Project Directory Path</label>
            <div className="relative">
              <Folder className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
              <input
                id="project-path"
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 pl-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-400 transition-colors"
                placeholder="/path/to/your/project"
              />
            </div>
            <p className="text-[10px] text-text-muted">
              Note: The FastAPI backend will parse the project&apos;s lockfile, fetch metadata, and execute LLM-agent reasoning.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="md">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" size="md" onClick={handleStartScan} disabled={!projectPath.trim()}>
              Start Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Severity summary bar */}
      <div className="flex items-center gap-6">
        <StatRow
          stats={[
            { label: 'CRITICAL', value: counts.CRITICAL, tone: 'critical' },
            { label: 'HIGH', value: counts.HIGH, tone: 'high' },
            { label: 'MEDIUM', value: counts.MEDIUM, tone: 'medium' },
            { label: 'LOW', value: counts.LOW, tone: 'low' },
          ]}
        />
        {(incidents?.length ?? 0) === 0 && !isLoading && (
          <div className="text-success text-sm self-center">✓ No active incidents</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Incident list */}
        <div className="col-span-2 relative space-y-3">
          <div
            className="radar-sweep absolute inset-0 pointer-events-none overflow-hidden animate-[radar-spin_8s_linear_infinite]"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(53,230,214,0.06) 8%, transparent 16%)',
              opacity: 0.35,
              mixBlendMode: 'screen',
            }}
            aria-hidden
          />
          {isLoading ? (
            <PageSpinner />
          ) : sorted.length === 0 ? (
            <Card className="relative">
              <div className="text-center py-8 text-text-muted">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <div>No incidents detected</div>
                <div className="text-xs mt-1">Crowsnest is monitoring your dependency graph</div>
              </div>
            </Card>
          ) : (
            sorted.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Token counter */}
          <Card className="border-primary/20">
            <div className="text-xs text-text-muted mb-1">CoralDB efficiency</div>
            <div className="text-primary-400 font-mono text-sm">
              <Zap className="w-3 h-3 inline mr-1" />
              Cross-source JOINs in SQL
            </div>
            <div className="text-xs text-text-muted mt-1">
              vs. 400× tokens with MCP tool calls
            </div>
          </Card>

          {/* Threat timeline */}
          <Card>
            <CardHeader>
              <CardTitle>24h Threat Timeline</CardTitle>
            </CardHeader>
            <ThreatTimeline incidents={incidents || []} />
          </Card>

          {/* Live firehose */}
          <Card>
            <CardHeader>
              <CardTitle>npm Publish Firehose</CardTitle>
              <LiveDot connected={connected} />
            </CardHeader>
            <PublishFirehose events={liveEvents} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const glow = incident.severity === 'CRITICAL' ? 'red' :
               incident.severity === 'HIGH' ? 'orange' : 'none';

  return (
    <Card glow={glow} className="relative">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="text-xl mt-0.5">{attackPatternIcon(incident.attack_pattern)}</div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={incident.severity} />
              <span className="text-sm font-medium text-text-primary">
                {attackPatternLabel(incident.attack_pattern)}
              </span>
              {incident.runtime_confirmation && (
                <span className="text-xs bg-severity-critical-bg text-severity-critical border border-severity-critical-border px-1.5 py-0.5 rounded">
                  RUNTIME CONFIRMED
                </span>
              )}
            </div>
            <div className="text-xs text-text-secondary space-x-2">
              <span>{incident.packages.slice(0, 3).join(', ')}{incident.packages.length > 3 ? ` +${incident.packages.length - 3}` : ''}</span>
              <span className="text-text-muted">·</span>
              <span>{(incident.blast_radius || []).length} project(s)</span>
              <span className="text-text-muted">·</span>
              <span>{Math.round(incident.confidence * 100)}% confidence</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-text-muted whitespace-nowrap">
          {timeAgo(incident.detected_at)}
        </div>
      </div>

      {incident.remediation_options.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-soft">
          <div className="text-xs text-text-muted mb-1">Recommended action:</div>
          <div className="text-xs text-text-secondary">{incident.remediation_options[0]}</div>
        </div>
      )}
    </Card>
  );
}
