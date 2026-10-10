'use client';

import { PageError } from '@/components/console/PageStates';

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError error={error} retry={retry} />;
}
