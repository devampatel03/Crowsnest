'use client';

import { RiskRanking } from '@/components/charts/RiskRanking';
import { useMaintainers, useStaleMarker } from '@/components/console/data';
import { ConsolePageHead } from '@/components/console/ConsolePageHead';
import { MaintainerPanel } from '@/components/console/MaintainerPanel';
import { Cameo, toChartError } from '@/components/console/PageStates';
import { useScan } from '@/components/console/ScanProvider';
import { useShortcutActions } from '@/components/console/ShortcutProvider';
import { Button, Panel, PanelGrid } from '@/components/system';
import { LOOKOUT_NOTE } from '@/lib/console/notes';
import { useUrlState } from '@/lib/console/url-state';

export default function LookoutPage() {
  const m = useMaintainers();
  const stale = useStaleMarker(m);
  const scan = useScan();
  const [{ who }, update] = useUrlState({ who: '' });
  useShortcutActions({
    refresh: m.retry,
    escape: () => {
      if (!who) return false;
      update({ who: '' });
      return true;
    },
  });

  const list = m.data;
  const selected = list?.find((x) => x.login === who) ?? null;

  return (
    <>
      <ConsolePageHead title="Who maintains your packages" note={LOOKOUT_NOTE} />
      <PanelGrid lines>
        <Panel label="People who publish your packages" className="col-span-12 min-h-[26.25rem] lg:col-span-7" stale={stale}>
          {list && list.length === 0 ? (
            <Cameo pose="spy" line="Nobody to look at yet.">
              <p className="m-0 text-body-s text-fg-soft">Scan a project to see who maintains your packages.</p>
              <Button variant="tertiary" onClick={scan.openDialog}>
                Scan a project
              </Button>
            </Cameo>
          ) : (
            <RiskRanking
              maintainers={list ?? []}
              loading={m.loading}
              error={m.error && !list ? toChartError(m.error) : null}
              onRetry={m.retry}
              selectedLogin={selected?.login ?? null}
              onSelect={(login) => update({ who: login ?? '' })}
            />
          )}
        </Panel>
        <Panel label="Selected person" className="col-span-12 min-h-[26.25rem] lg:col-span-5" stale={stale}>
          <MaintainerPanel maintainer={selected} />
        </Panel>
      </PanelGrid>
    </>
  );
}
