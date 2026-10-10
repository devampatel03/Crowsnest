'use client';

import useSWR from 'swr';
import { Gauge, Skeleton } from '@/components/system';
import { fetchBlastRadius } from '@/lib/api';
import { activityText, platformAge, whoElse } from '@/lib/blast';
import { AffectedList } from './AffectedList';
import type { MaintainerScore } from '@/lib/types';
import { DataError } from './PageStates';

/** Selected person: plain facts, then who else is affected (from the read-only blast-radius query). */
export function MaintainerPanel({ maintainer }: { maintainer: MaintainerScore | null }) {
  const key = maintainer ? ['blast', maintainer.login] : null;
  const { data, error, isLoading, mutate } = useSWR(key, () => fetchBlastRadius(maintainer!.login), { shouldRetryOnError: false });

  if (!maintainer) return <p className="m-0 text-body-s text-fg-soft">Pick a person to see what depends on them.</p>;
  const who = whoElse(data, maintainer);
  const age = platformAge(maintainer.days_on_platform);
  return (
    <div className="flex min-w-0 flex-col gap-s4">
      <div className="flex flex-col gap-s2">
        <h3 className="m-0 break-all font-sans text-h3 text-fg">{maintainer.login}</h3>
        {maintainer.ioc_flagged ? (
          <div className="flex flex-col gap-1">
            <Gauge level="hold" />
            <p className="m-0 text-body-s text-fg-soft">Flagged: linked to known harmful activity</p>
          </div>
        ) : null}
        <p className="m-0 text-body-s text-fg-soft">
          Maintains {maintainer.packages_in_graph.toLocaleString('en-US')} {maintainer.packages_in_graph === 1 ? 'package' : 'packages'} in your projects
        </p>
        <p className="m-0 text-body-s text-fg-soft">{activityText(maintainer)}</p>
        <p className="m-0 text-body-s text-fg-soft">On the platform: {age}</p>
      </div>
      <section className="flex min-w-0 flex-col gap-s2 border-t border-rule pt-s3">
        <h4 className="label m-0">Who else is affected</h4>
        {isLoading ? (
          <div role="status">
            <span className="sr-only">Loading.</span>
            <Skeleton className="h-8" width="70%" />
          </div>
        ) : error ? (
          <DataError error={error} onRetry={() => void mutate()} />
        ) : who.kind === 'none' ? (
          <p className="m-0 text-body-s text-fg-soft">{who.text}</p>
        ) : (
          <AffectedList projects={who.projects} />
        )}
      </section>
    </div>
  );
}
