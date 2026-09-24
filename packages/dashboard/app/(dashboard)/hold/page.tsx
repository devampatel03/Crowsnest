'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Search, Package } from 'lucide-react';
import { fetchLockfiles } from '@/lib/api';
import type { LockfileEntry } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow } from '@/components/ui/stat-row';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
      <PageHeader
        title="Hold"
        description="Your complete dependency inventory with security annotations"
      />

      {/* Summary stats */}
      <StatRow
        stats={[
          { label: 'total packages', value: filtered.length.toLocaleString() },
          { label: 'direct', value: directCount, tone: 'low' },
          { label: 'transitive', value: transitiveCount },
        ]}
      />

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Select
          value={ecosystemFilter || 'all'}
          onValueChange={(value) => setEcosystemFilter(value === 'all' ? '' : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All ecosystems" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ecosystems</SelectItem>
            {ecosystems.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <Card>
          <div className="text-center py-8 text-text-muted">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div className="text-sm text-severity-critical mb-2">Failed to load package inventory</div>
            <div className="text-xs text-text-muted mb-4">The backend may be busy. Wait a moment and retry.</div>
            <button
              onClick={() => mutate()}
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-text-secondary text-xs rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Package</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Ecosystem</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Project</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((pkg, i) => (
                  <LockfileRow key={`${pkg.project_path}-${pkg.package}-${i}`} entry={pkg} />
                ))}
              </TableBody>
            </Table>
          </div>

          {filtered.length > 200 && (
            <div className="mt-3 text-xs text-text-muted text-center">
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
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Package className="w-3 h-3 text-text-muted flex-shrink-0" />
          <span className={`font-mono text-xs ${isDirect ? 'text-text-primary' : 'text-text-secondary'}`}>
            {entry.package}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-text-secondary">{entry.version}</TableCell>
      <TableCell>
        <Badge variant="dim">{entry.ecosystem}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={isDirect ? 'default' : 'dim'}>
          {isDirect ? 'direct' : 'transitive'}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-text-muted max-w-xs truncate">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block truncate cursor-default">{entry.project_path}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{entry.project_path}</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
