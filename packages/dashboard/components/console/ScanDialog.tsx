'use client';

import { useEffect, useRef, useState } from 'react';
import { Nib } from '@/components/mascot';
import { Button, Dialog, DialogContent, DialogFooter, TextInput } from '@/components/system';
import { doneLine } from '@/lib/live/scan';
import { useConsoleLive } from './ConsoleLiveProvider';
import { useScan } from './ScanProvider';

function ScanBody() {
  const scan = useScan();
  const live = useConsoleLive();
  const { state } = scan;
  const [path, setPath] = useState(state.path);
  const inputRef = useRef<HTMLInputElement>(null);
  const formShown = state.phase === 'idle';

  // Radix focuses the first control (Close); the folder field is what people came for.
  useEffect(() => {
    if (!formShown) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [formShown]);

  if (state.phase === 'starting' || state.phase === 'running') {
    return (
      <div className="flex flex-col gap-s3">
        <div className="flex items-center gap-s3">
          <Nib pose="spy" size={56} animate />
          <p className="m-0 text-body text-fg" role="status">
            Checking your packages…
          </p>
        </div>
        <div role="progressbar" aria-label="Checking your packages" className="hairline-progress" />
        <DialogFooter>
          <Button variant="secondary" onClick={scan.closeDialog}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (state.phase === 'complete') {
    return (
      <div className="flex flex-col gap-s3">
        <div className="flex items-center gap-s3">
          {/* Nothing found: Nib nods. Findings: Nib stays steady, no line, no joke. */}
          <Nib pose={(state.found ?? 0) > 0 ? 'spy' : 'nod'} size={56} />
          <div className="flex min-w-0 flex-col gap-s1">
            <p className="m-0 text-body text-fg" role="status">
              {doneLine(state.found ?? 0)}
            </p>
            {(state.found ?? 0) > 0 ? null : <p className="m-0 text-body-s text-fg-soft">Nothing to hold.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={scan.retry}>
            Scan another folder
          </Button>
          <Button href="/horizon" onClick={scan.closeDialog}>
            See them
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="flex flex-col gap-s3">
        <p className="m-0 text-body text-fg" role="alert">
          {`The scan didn't finish. ${state.error ?? ''}`.trim()}
        </p>
        <div className="flex flex-wrap items-center gap-x-s4 gap-y-s2">
          <Button variant="tertiary" onClick={scan.retry}>
            Try again
          </Button>
          <Button variant="tertiary" href="/docs/troubleshooting" onClick={scan.closeDialog}>
            How to fix it
          </Button>
        </div>
      </div>
    );
  }

  const unreachable = live.status === 'offline' || live.status === 'reconnecting';
  const empty = path.trim() === '';
  const reason = unreachable ? "Crowsnest isn't reachable. Start it first." : empty ? 'Enter a folder to scan.' : undefined;

  return (
    <form
      className="flex flex-col gap-s4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason) void scan.start(path.trim());
      }}
    >
      <TextInput
        id="scan-folder"
        label="Project folder"
        placeholder="/path/to/project"
        hint={reason ?? 'Crowsnest reads the lockfile in this folder.'}
        value={path}
        onChange={setPath}
        inputRef={inputRef}
        autoComplete="off"
        spellCheck={false}
      />
      <DialogFooter>
        <Button variant="secondary" type="button" onClick={scan.closeDialog}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!reason}>
          Scan
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The scan dialog: one folder field, one progress sentence, one result line. No phases, no counters. */
export function ScanDialog() {
  const scan = useScan();
  return (
    <Dialog open={scan.dialogOpen} onOpenChange={(o) => (o ? scan.openDialog() : scan.closeDialog())}>
      {scan.dialogOpen ? (
        <DialogContent title="Scan a project">
          <ScanBody />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
