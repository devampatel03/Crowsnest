'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, RefreshCw, Zap, Play, CheckCircle2, XCircle, Folder, AlertCircle, Loader2 } from 'lucide-react';
import { fetchIncidents, triggerScan } from '@/lib/api';
import { useSSEStream } from '@/lib/sse';
import type { Incident, SecurityEvent } from '@/lib/types';
import { attackPatternIcon, attackPatternLabel, severityConfig, timeAgo, cn } from '@/lib/utils';
import { SeverityBadge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveDot } from '@/components/ui/live-dot';
import { PageSpinner } from '@/components/ui/spinner';
import { PublishFirehose } from '@/components/charts/PublishFirehose';
import { ThreatTimeline } from '@/components/charts/ThreatTimeline';

export default function HorizonPage() {
  const [liveEvents, setLiveEvents] = useState<SecurityEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectPath, setProjectPath] = useState('c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Horizon</h1>
          <p className="text-sm text-slate-500">Active supply chain threats hitting your dependency graph</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveDot connected={connected} />
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-100 rounded text-sm font-medium transition-colors shadow-[0_0_10px_rgba(8,145,178,0.2)] hover:shadow-[0_0_15px_rgba(8,145,178,0.4)]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Scan Project
          </button>
          <button
            onClick={() => mutate()}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scan Progress Banner */}
      {scanStatus !== 'idle' && (
        <Card className={cn(
          "transition-all duration-300 border",
          scanStatus === 'complete' ? "border-emerald-500/30 bg-emerald-950/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]" :
          scanStatus === 'failed' ? "border-red-500/30 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
          "border-cyan-500/30 bg-cyan-950/10 shadow-[0_0_15px_rgba(8,145,178,0.1)]"
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {scanStatus === 'triggering' && (
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              )}
              {scanStatus === 'ingesting' && (
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              )}
              {scanStatus === 'running' && (
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              )}
              {scanStatus === 'complete' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
              {scanStatus === 'failed' && (
                <XCircle className="w-5 h-5 text-red-400" />
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  {scanStatus === 'triggering' && 'Initializing Scan...'}
                  {scanStatus === 'ingesting' && 'Ingesting Project Lockfile...'}
                  {scanStatus === 'running' && 'Running LangGraph Agent Team...'}
                  {scanStatus === 'complete' && 'Scan Completed'}
                  {scanStatus === 'failed' && 'Scan Failed'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {scanStatus === 'triggering' && 'Registering scan task on the backend...'}
                  {scanStatus === 'ingesting' && 'Parsing dependencies and syncing with local DuckDB...'}
                  {scanStatus === 'running' && 'LLMs are executing detection plan, investigating signals, and triaging alerts...'}
                  {scanStatus === 'complete' && `Finished audit. Detected ${incidentsFound} new incident(s).`}
                  {scanStatus === 'failed' && (scanError || 'An error occurred during scanning.')}
                </p>
              </div>
            </div>

            {scanStatus === 'failed' && (
              <button
                onClick={() => setScanStatus('idle')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Modal / Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                <Play className="w-5 h-5 fill-current animate-pulse" />
              </div>
              <div>
                <h3 className="text-md font-semibold text-slate-100">Scan Project</h3>
                <p className="text-xs text-slate-500">Run a supply chain security audit on a local directory</p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="project-path" className="text-xs font-semibold text-slate-400">Project Directory Path</label>
              <div className="relative">
                <Folder className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  id="project-path"
                  type="text"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="w-full bg-[#020817] border border-slate-800 rounded px-3 py-2 pl-10 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="e.g. c:/path/to/project"
                />
              </div>
              <p className="text-[10px] text-slate-600">
                Note: The FastAPI backend will parse the project's lockfile, fetch metadata, and execute LLM-agent reasoning.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartScan}
                disabled={!projectPath.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-100 text-xs font-semibold rounded transition-colors shadow-[0_0_10px_rgba(8,145,178,0.2)]"
              >
                Start Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Severity summary bar */}
      <div className="flex gap-6">
        {[
          { sev: 'CRITICAL' as const, count: counts.CRITICAL, color: 'text-red-400' },
          { sev: 'HIGH' as const, count: counts.HIGH, color: 'text-orange-400' },
          { sev: 'MEDIUM' as const, count: counts.MEDIUM, color: 'text-amber-400' },
          { sev: 'LOW' as const, count: counts.LOW, color: 'text-cyan-400' },
        ].map(({ sev, count, color }) => (
          <div key={sev} className="text-center">
            <div className={`text-2xl font-bold ${color}`}>{count}</div>
            <div className="text-xs text-slate-500">{sev}</div>
          </div>
        ))}
        {(incidents?.length ?? 0) === 0 && !isLoading && (
          <div className="text-emerald-400 text-sm self-center">✓ No active incidents</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Incident list */}
        <div className="col-span-2 space-y-3">
          {isLoading ? (
            <PageSpinner />
          ) : sorted.length === 0 ? (
            <Card>
              <div className="text-center py-8 text-slate-500">
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
          <Card className="border-cyan-500/20">
            <div className="text-xs text-slate-500 mb-1">CoralDB efficiency</div>
            <div className="text-cyan-400 font-mono text-sm">
              <Zap className="w-3 h-3 inline mr-1" />
              Cross-source JOINs in SQL
            </div>
            <div className="text-xs text-slate-600 mt-1">
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
  const config = severityConfig(incident.severity);
  const glow = incident.severity === 'CRITICAL' ? 'red' :
               incident.severity === 'HIGH' ? 'orange' : 'none';

  return (
    <Card glow={glow}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="text-xl mt-0.5">{attackPatternIcon(incident.attack_pattern)}</div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={incident.severity} />
              <span className="text-sm font-medium text-slate-200">
                {attackPatternLabel(incident.attack_pattern)}
              </span>
              {incident.runtime_confirmation && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
                  RUNTIME CONFIRMED
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 space-x-2">
              <span>{incident.packages.slice(0, 3).join(', ')}{incident.packages.length > 3 ? ` +${incident.packages.length - 3}` : ''}</span>
              <span className="text-slate-600">·</span>
              <span>{(incident.blast_radius || []).length} project(s)</span>
              <span className="text-slate-600">·</span>
              <span>{Math.round(incident.confidence * 100)}% confidence</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-600 whitespace-nowrap">
          {timeAgo(incident.detected_at)}
        </div>
      </div>

      {incident.remediation_options.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Recommended action:</div>
          <div className="text-xs text-slate-300">{incident.remediation_options[0]}</div>
        </div>
      )}
    </Card>
  );
}
