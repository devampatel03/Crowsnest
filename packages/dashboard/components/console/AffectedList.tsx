'use client';

import { useState } from 'react';
import { Button } from '@/components/system';
import { projectName, type AffectedProject } from '@/lib/calls';

const SHOWN = 6;

function Project({ p }: { p: AffectedProject }) {
  const [all, setAll] = useState(false);
  const items = all ? p.items : p.items.slice(0, SHOWN);
  const more = p.items.length - SHOWN;
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <span className="min-w-0 break-all text-[0.8125rem] text-fg">{projectName(p.path)}</span>
      <span className="min-w-0 break-words text-body-s text-fg-soft">
        {items.map((i) => (i.version ? `${i.package} ${i.version}` : i.package)).join(', ')}
        {!all && more > 0 ? ` and ${more} more` : ''}
      </span>
      {more > 0 ? (
        <span>
          <Button variant="tertiary" arrow={false} aria-expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? 'Show fewer' : `Show all ${p.items.length}`}
          </Button>
        </span>
      ) : null}
    </li>
  );
}

/** Projects of yours (folder names only) and the packages in each that are affected. */
export function AffectedList({ projects }: { projects: AffectedProject[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-s3 p-0">
      {projects.map((p) => (
        <Project key={p.path} p={p} />
      ))}
    </ul>
  );
}
