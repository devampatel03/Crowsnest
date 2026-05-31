'use client';

import useSWR from 'swr';
import { Shield, TrendingDown, Bot } from 'lucide-react';
import { fetchMaintainerReputation } from '@/lib/api';
import type { MaintainerScore } from '@/lib/types';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/utils';

export default function LookoutPage() {
  const { data: maintainers, isLoading, error, mutate } = useSWR<MaintainerScore[]>(
    '/api/maintainers/reputation',
    fetchMaintainerReputation,
    { refreshInterval: 60000, shouldRetryOnError: true, errorRetryCount: 3 },
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Lookout</h1>
        <p className="text-sm text-slate-500">Proactive risk scoring — see threats before they materialize</p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <Card>
          <div className="text-center py-8 text-slate-500">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm text-red-400 mb-2">Failed to load maintainer data</div>
            <div className="text-xs text-slate-600 mb-4">The backend may still be processing a scan. Wait 30 seconds and retry.</div>
            <button
              onClick={() => mutate()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
            >
              Retry
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* Maintainer reputation */}
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  Maintainer Reputation Graph
                </CardTitle>
                <span className="text-xs text-slate-500">{maintainers?.length || 0} maintainers in transitive graph</span>
              </CardHeader>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-800">
                      <th className="text-left pb-2 font-normal">Maintainer</th>
                      <th className="text-right pb-2 font-normal">Packages</th>
                      <th className="text-right pb-2 font-normal">Commits/90d</th>
                      <th className="text-right pb-2 font-normal">GPG %</th>
                      <th className="text-right pb-2 font-normal">Platform Age</th>
                      <th className="text-center pb-2 font-normal">IOC</th>
                      <th className="text-right pb-2 font-normal">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {(maintainers || []).slice(0, 30).map((m) => (
                      <MaintainerRow key={m.login} score={m} />
                    ))}
                  </tbody>
                </table>
              </div>

              {maintainers && maintainers.length > 0 && (
                <div className="mt-4 p-3 bg-red-500/5 border border-red-500/20 rounded text-xs text-red-400">
                  <TrendingDown className="w-3 h-3 inline mr-1" />
                  The bottom {Math.min(10, maintainers.length)} maintainers by score are where the next attack will land.
                </div>
              )}
            </Card>
          </div>

          {/* AI Coder Forensics callout */}
          <Card className="border-amber-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-400" />
                AI Coder Forensics
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-slate-400 mb-3">
              41% of code is now AI-generated. 20% of LLM suggestions include non-existent packages.
              Crowsnest scores every import by AI-authored likelihood.
            </p>
            <div className="text-xs text-slate-500">
              View slopsquatting risks on the{' '}
              <a href="/hold" className="text-cyan-400 hover:underline">Hold</a> page.
            </div>
          </Card>

          {/* Counterfactual blast radius */}
          <Card className="border-cyan-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                Counterfactual Blast Radius
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-slate-400 mb-3">
              Prospective analysis: if the highest-risk maintainer was compromised right now,
              here is your exposure across all projects.
            </p>
            {maintainers && maintainers[0] && (
              <div className="font-mono text-xs space-y-1">
                <div className="text-slate-500">Highest risk maintainer:</div>
                <div className="text-amber-400 font-bold">@{maintainers[0].login}</div>
                <div className="text-slate-400">{maintainers[0].packages_in_graph} packages in graph</div>
                <div className="text-red-400">Risk score: {Math.round(maintainers[0].risk_score * 100)}%</div>
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
    score.risk_score >= 0.7 ? 'text-red-400' :
    score.risk_score >= 0.4 ? 'text-amber-400' : 'text-emerald-400';

  const riskPct = Math.round(score.risk_score * 100);
  const barWidth = `${riskPct}%`;

  return (
    <tr className="hover:bg-slate-900/50 transition-colors">
      <td className="py-2">
        <span className="font-medium text-slate-200">@{score.login}</span>
        {score.ioc_flagged && (
          <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-1 rounded">IOC</span>
        )}
      </td>
      <td className="text-right text-slate-400">{score.packages_in_graph}</td>
      <td className="text-right text-slate-400">{score.commits_90d}</td>
      <td className="text-right text-slate-400">{Math.round(score.gpg_sign_ratio * 100)}%</td>
      <td className="text-right text-slate-400">
        {score.days_on_platform === 0
          ? <span className="text-slate-600">N/A</span>
          : score.days_on_platform >= 365
            ? `${Math.round(score.days_on_platform / 365)}y`
            : `${score.days_on_platform}d`}
      </td>
      <td className="text-center">
        {score.ioc_flagged ? (
          <span className="text-red-500">🚨</span>
        ) : (
          <span className="text-emerald-500 text-xs">✓</span>
        )}
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-1.5 bg-slate-800 rounded overflow-hidden">
            <div
              className={`h-full rounded ${score.risk_score >= 0.7 ? 'bg-red-500' : score.risk_score >= 0.4 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: barWidth }}
            />
          </div>
          <span className={`text-xs font-mono ${riskColor}`}>{riskPct}%</span>
        </div>
      </td>
    </tr>
  );
}
