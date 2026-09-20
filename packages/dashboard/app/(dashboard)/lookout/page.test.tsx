import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MaintainerScore } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  fetchMaintainerReputation: vi.fn(async (): Promise<MaintainerScore[]> => []),
}));

import LookoutPage from './page';

describe('LookoutPage (smoke)', () => {
  it('renders without throwing and shows the tab heading', async () => {
    render(<LookoutPage />);
    expect(await screen.findByText('Lookout')).toBeInTheDocument();
  });
});
