import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LockfileEntry } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  fetchLockfiles: vi.fn(async (): Promise<LockfileEntry[]> => []),
}));

import HoldPage from './page';

describe('HoldPage (smoke)', () => {
  it('renders without throwing and shows the tab heading', async () => {
    render(<HoldPage />);
    expect(await screen.findByText('Hold')).toBeInTheDocument();
  });
});
