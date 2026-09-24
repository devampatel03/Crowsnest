'use client';

import useSWR from 'swr';
import { Shield, TrendingDown, Bot } from 'lucide-react';
import { fetchMaintainerReputation } from '@/lib/api';
import type { MaintainerScore } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';

export default function LookoutPage() {
  const { data: maintainers, isLoading, error, mutate } = useSWR<MaintainerScore[]>(
    '/api/maintainers/reputation',
    fetchMaintainerReputation,
    { refreshInterval: 60000, shouldRetryOnError: true, errorRetryCount: 3 },
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Lookout"
        description="Proactive risk scoring — see threats before they materialize"
      />

      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <Card>
          <div className="text-center py-8 text-text-muted">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm text-severity-critical mb-2">Failed to load maintainer data</div>
            <div className="text-xs text-text-muted mb-4">The backend may still be processing a scan. Wait 30 seconds and retry.</div>
            <Button variant="secondary" size="sm" onClick={() => mutate()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* Maintainer reputation */}
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Maintainer Reputation Graph
                </CardTitle>
                <span className="text-xs text-text-muted">{maintainers?.length || 0} maintainers in transitive graph</span>
              </CardHeader>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Maintainer</TableHead>
                      <TableHead className="text-right">Packages</TableHead>
                      <TableHead className="text-right">Commits/90d</TableHead>
                      <TableHead className="text-right">GPG %</TableHead>
                      <TableHead className="text-right">Platform Age</TableHead>
                      <TableHead className="text-center">IOC</TableHead>
                      <TableHead className="text-right">Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(maintainers || []).slice(0, 30).map((m) => (
                      <MaintainerRow key={m.login} score={m} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {maintainers && maintainers.length > 0 && (
                <div className="mt-4 p-3 bg-severity-critical-bg border border-severity-critical-border rounded text-xs text-severity-critical">
                  <TrendingDown className="w-3 h-3 inline mr-1" />
                  The bottom {Math.min(10, maintainers.length)} maintainers by score are where the next attack will land.
                </div>
              )}
            </Card>
          </div>

          {/* AI Coder Forensics callout */}
          <Card className="border-accent bg-accent/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-accent" />
                AI Coder Forensics
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-text-secondary mb-3">
              41% of code is now AI-generated. 20% of LLM suggestions include non-existent packages.
              Crowsnest scores every import by AI-authored likelihood.
            </p>
            <div className="text-xs text-text-muted">
              View slopsquatting risks on the{' '}
              <a href="/hold" className="text-primary hover:underline">Hold</a> page.
            </div>
          </Card>

          {/* Counterfactual blast radius */}
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Counterfactual Blast Radius
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-text-secondary mb-3">
              Prospective analysis: if the highest-risk maintainer was compromised right now,
              here is your exposure across all projects.
            </p>
            {maintainers && maintainers[0] && (
              <div className="font-mono text-xs space-y-1">
                <div className="text-text-muted">Highest risk maintainer:</div>
                <div className="text-accent font-bold">@{maintainers[0].login}</div>
                <div className="text-text-secondary">{maintainers[0].packages_in_graph} packages in graph</div>
                <div className="text-severity-critical">Risk score: {Math.round(maintainers[0].risk_score * 100)}%</div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function MaintainerRow({ score }: { score: MaintainerScore }) {
  const riskColor =
    score.risk_score >= 0.7 ? 'text-severity-critical' :
    score.risk_score >= 0.4 ? 'text-accent' : 'text-success';

  const riskPct = Math.round(score.risk_score * 100);
  const barWidth = `${riskPct}%`;

  return (
    <TableRow>
      <TableCell>
        <span className="font-medium text-text-primary">@{score.login}</span>
        {score.ioc_flagged && (
          <span className="ml-2 text-xs bg-severity-critical-bg text-severity-critical px-1 rounded">IOC</span>
        )}
      </TableCell>
      <TableCell className="text-right text-text-secondary">{score.packages_in_graph}</TableCell>
      <TableCell className="text-right text-text-secondary">{score.commits_90d}</TableCell>
      <TableCell className="text-right text-text-secondary">{Math.round(score.gpg_sign_ratio * 100)}%</TableCell>
      <TableCell className="text-right text-text-secondary">
        {score.days_on_platform === 0
          ? <span className="text-text-muted">N/A</span>
          : score.days_on_platform >= 365
            ? `${Math.round(score.days_on_platform / 365)}y`
            : `${score.days_on_platform}d`}
      </TableCell>
      <TableCell className="text-center">
        {score.ioc_flagged ? (
          <span className="text-severity-critical">🚨</span>
        ) : (
          <span className="text-success text-xs">✓</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 bg-surface-3 rounded overflow-hidden">
            <div
              className={`h-full rounded ${score.risk_score >= 0.7 ? 'bg-severity-critical' : score.risk_score >= 0.4 ? 'bg-accent' : 'bg-success'}`}
              style={{ width: barWidth }}
            />
          </div>
          <span className={`text-xs font-mono ${riskColor}`}>{riskPct}%</span>
        </div>
      </TableCell>
    </TableRow>
  );
}
