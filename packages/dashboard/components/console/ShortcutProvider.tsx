'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { Button, Dialog, DialogClose, DialogContent, DialogFooter, Kbd } from '@/components/system';
import { KEYS } from '@/lib/api';
import { CHORD_TARGETS, CHORD_WINDOW_MS, decideKey, isTypingTarget, SINGLE_KEYS_STORAGE } from '@/lib/console/hotkeys';
import { useScan } from './ScanProvider';

export type PageActions = {
  /** `/` focuses this. */
  focusFilter?: () => void;
  /** `r` calls this; the default refetches every shared key. */
  refresh?: () => void;
  /** `Esc` (when no dialog is open): return true when something was closed or cleared. */
  escape?: () => boolean;
};

type ShortcutContextValue = {
  register: (a: () => PageActions) => () => void;
  openHelp: () => void;
  /** Same as the `r` key and the header refresh button. */
  refresh: () => void;
  singleKeys: boolean;
  setSingleKeys: (b: boolean) => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function useShortcutContext(): ShortcutContextValue {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error('useShortcutContext must be used inside <ShortcutProvider>');
  return ctx;
}

/** Pages register their handlers for `/`, `r` and `Esc`. The latest closure is always used. */
export function useShortcutActions(actions: PageActions): void {
  // Tolerates a missing provider (isolated component tests): registration is then a no-op.
  const register = useContext(ShortcutContext)?.register;
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });
  useEffect(() => (register ? register(() => ref.current) : undefined), [register]);
}

/** Rows of the keyboard sheet (02-copy 9.1). `keys` of length 2 with `chord` read "g then h"; with `pair` they read "j / k". */
const ROWS: { keys: string[]; label: string; kind?: 'chord' | 'pair' }[] = [
  { keys: ['/'], label: 'Search or filter' },
  { keys: ['s'], label: 'Scan a project' },
  { keys: ['r'], label: 'Refresh' },
  { keys: ['?'], label: 'Show this list' },
  { keys: ['j', 'k'], label: 'Next or previous row', kind: 'pair' },
  { keys: ['g', 'h'], label: 'Horizon', kind: 'chord' },
  { keys: ['g', 'l'], label: 'Lookout', kind: 'chord' },
  { keys: ['g', 'o'], label: 'Installed', kind: 'chord' },
  { keys: ['g', 'g'], label: 'Log', kind: 'chord' },
];

function dialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/** Moves focus to the next or previous `[data-nav-item]` in main (call cards), or into the first table row. */
function moveRow(dir: 1 | -1, target: HTMLElement | null): boolean {
  if (target?.closest('[role="row"][data-row-index]')) return false; // the table handles its own rows
  const items = Array.from(document.querySelectorAll<HTMLElement>('main [data-nav-item], main [role="option"]'));
  if (items.length > 0) {
    const active = document.activeElement;
    const cur = items.findIndex((el) => el === active || el.contains(active));
    const next = cur === -1 ? (dir === 1 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, cur + dir));
    items[next].focus();
    return true;
  }
  const row = document.querySelector<HTMLElement>('main [role="row"][data-row-index][tabindex="0"]');
  if (row) {
    row.focus();
    return true;
  }
  return false;
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const scan = useScan();
  const [helpOpen, setHelpOpen] = useState(false);
  const [singleKeys, setSingleKeysState] = useState(true);
  const [chord, setChord] = useState(false);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chordOpen = useRef(false);
  const pages = useRef(new Set<() => PageActions>());
  const scanRef = useRef(scan);
  const singleRef = useRef(singleKeys);
  useEffect(() => {
    scanRef.current = scan;
    singleRef.current = singleKeys;
  });

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (window.localStorage.getItem(SINGLE_KEYS_STORAGE) === 'off') setSingleKeysState(false);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);

  const setSingleKeys = useCallback((b: boolean) => {
    setSingleKeysState(b);
    try {
      window.localStorage.setItem(SINGLE_KEYS_STORAGE, b ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, []);

  const register = useCallback((a: () => PageActions) => {
    pages.current.add(a);
    return () => {
      pages.current.delete(a);
    };
  }, []);

  const closeChord = useCallback(() => {
    chordOpen.current = false;
    setChord(false);
    if (chordTimer.current) clearTimeout(chordTimer.current);
    chordTimer.current = null;
  }, []);

  const page = useCallback((): PageActions => {
    let merged: PageActions = {};
    pages.current.forEach((p) => {
      merged = { ...merged, ...p() };
    });
    return merged;
  }, []);

  const refresh = useCallback(() => {
    const r = page().refresh;
    if (r) r();
    else Object.values(KEYS).forEach((k) => void mutate(k));
  }, [page, mutate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (chordOpen.current) closeChord();
        if (!dialogIsOpen() && page().escape?.()) e.preventDefault();
        return;
      }
      const d = decideKey(e, {
        typing: isTypingTarget(e.target),
        dialogOpen: dialogIsOpen(),
        chordOpen: chordOpen.current,
        singleKeys: singleRef.current,
      });
      switch (d.kind) {
        case 'none':
          if (chordOpen.current) closeChord();
          return;
        case 'chord-start':
          e.preventDefault();
          chordOpen.current = true;
          setChord(true);
          chordTimer.current = setTimeout(closeChord, CHORD_WINDOW_MS);
          return;
        case 'goto':
          e.preventDefault();
          closeChord();
          router.push(d.href);
          return;
        case 'help':
          e.preventDefault();
          setHelpOpen(true);
          return;
        case 'filter': {
          const f = page().focusFilter;
          if (f) {
            e.preventDefault();
            f();
          }
          return;
        }
        case 'scan':
          e.preventDefault();
          scanRef.current.openDialog();
          return;
        case 'refresh':
          e.preventDefault();
          refresh();
          return;
        case 'row':
          if (moveRow(d.dir, e.target as HTMLElement | null)) e.preventDefault();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeChord, page, refresh, router]);

  const value = useMemo<ShortcutContextValue>(
    () => ({ register, openHelp: () => setHelpOpen(true), refresh, singleKeys, setSingleKeys }),
    [register, refresh, singleKeys, setSingleKeys],
  );

  return (
    <ShortcutContext.Provider value={value}>
      {children}
      {chord ? (
        <div
          role="status"
          className="fixed bottom-s4 left-[5.25rem] z-40 rounded-ctl border border-rule-strong bg-raised px-s3 py-s2 text-body-s text-fg max-md:bottom-[4.5rem] max-md:left-s3"
        >
          {Object.entries(CHORD_TARGETS)
            .map(([k, v]) => `${k} ${v.label}`)
            .join(' · ')}
        </div>
      ) : null}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        {helpOpen ? (
          <DialogContent title="Keyboard shortcuts">
            <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-s4 gap-y-s2">
              {ROWS.map((r) => (
                <div key={r.label} className="contents">
                  <dt>
                    {r.kind === 'pair' ? (
                      <span className="inline-flex items-center gap-s1">
                        <Kbd keys={[r.keys[0]]} />
                        <span className="label">{' / '}</span>
                        <Kbd keys={[r.keys[1]]} />
                      </span>
                    ) : (
                      <Kbd keys={r.keys} />
                    )}
                  </dt>
                  <dd className="m-0 text-body-s text-fg-soft">{r.label}</dd>
                </div>
              ))}
            </dl>
            <p className="mb-0 mt-s4 text-body-s text-fg-mute">Shortcuts do nothing while you type.</p>
            <div className="mt-s4 flex flex-col gap-s2 border-t border-rule pt-s3">
              <p className="m-0 text-body-s text-fg-soft">Single-key shortcuts clash with some assistive technology. You can turn them off here. Press ? to bring this list back.</p>
              <div>
                <Button variant="secondary" aria-pressed={singleKeys} onClick={() => setSingleKeys(!singleKeys)}>
                  {singleKeys ? 'Single-key shortcuts: on' : 'Single-key shortcuts: off'}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ShortcutContext.Provider>
  );
}
