'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Search, Package, Lock, Eye } from 'lucide-react';
import { fetchLockfiles } from '@/lib/api';
import type { LockfileEntry } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';

export default function HoldPage() {
  const [search, setSearch] = useState('');
  const [ecosystemFilter, setEcosystemFilter] = useState('');

  const { data: lockfiles, isLoading, error, mutate } = useSWR<LockfileEntry[]>(
    `/api/lockfiles?${ecosystemFilter ? 'ecosystem=' + ecosystemFilter : ''}`,
    () => fetchLockfiles(ecosystemFilter || undefined),
    { refreshInterval: 120000, shouldRetryOnError: true, errorRetryCount: 3 },
  );

  const filtered = (lockfiles || []).filter((pkg) =>
    !search || pkg.package.toLowerCase().includes(search.toLowerCase()),
  );

  const ecosystems = Array.from(new Set((lockfiles || []).map((l) => l.ecosystem)));
  const directCount = filtered.filter((l) => l.declared_in === 'direct').length;
  const transitiveCount = filtered.filter((l) => l.declared_in === 'transitive').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Hold</h1>
        <p className="text-sm text-slate-500">Your complete dependency inventory with security annotations</p>
      </div>

      {/* Summary stats */}
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold text-slate-100">{filtered.length.toLocaleString()}</div>
          <div className="text-xs text-slate-500">total packages</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-cyan-400">{directCount}</div>
          <div className="text-xs text-slate-500">direct</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-400">{transitiveCount}</div>
          <div className="text-xs text-slate-500">transitive</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <select
          value={ecosystemFilter}
          onChange={(e) => setEcosystemFilter(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
        >
          <option value="">All ecosystems</option>
          {ecosystems.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <Card>
          <div className="text-center py-8 text-slate-500">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm text-red-400 mb-2">Failed to load package inventory</div>
            <div className="text-xs text-slate-600 mb-4">The backend may be busy. Wait a moment and retry.</div>
            <button
              onClick={() => mutate()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
            >
              Retry
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left pb-2 font-normal">Package</th>
                  <th className="text-left pb-2 font-normal">Version</th>
                  <th className="text-left pb-2 font-normal">Ecosystem</th>
                  <th className="text-left pb-2 font-normal">Type</th>
                  <th className="text-left pb-2 font-normal">Project</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {filtered.slice(0, 200).map((pkg, i) => (
                  <LockfileRow key={`${pkg.project_path}-${pkg.package}-${i}`} entry={pkg} />
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 200 && (
            <div className="mt-3 text-xs text-slate-500 text-center">
              Showing 200 of {filtered.length.toLocaleString()} packages
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function LockfileRow({ entry }: { entry: LockfileEntry }) {
  const isDirect = entry.declared_in === 'direct';

  return (
    <tr className="hover:bg-slate-900/50 transition-colors">
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Package className="w-3 h-3 text-slate-600 flex-shrink-0" />
          <span className={`font-mono text-xs ${isDirect ? 'text-slate-200' : 'text-slate-400'}`}>
            {entry.package}
          </span>
        </div>
      </td>
      <td className="py-2 font-mono text-xs text-slate-400">{entry.version}</td>
      <td className="py-2">
        <Badge variant="dim">{entry.ecosystem}</Badge>
      </td>
      <td className="py-2">
        <Badge variant={isDirect ? 'default' : 'dim'}>
          {isDirect ? 'direct' : 'transitive'}
        </Badge>
      </td>
      <td className="py-2 text-xs text-slate-500 max-w-xs truncate">{entry.project_path}</td>
    </tr>
  );
}
