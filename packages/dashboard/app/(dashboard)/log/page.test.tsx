import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Incident } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  fetchIncidents: vi.fn(async (): Promise<Incident[]> => []),
  replayIncident: vi.fn(async () => ({})),
}));

import LogPage from './page';

describe('LogPage (smoke)', () => {
  it('renders without throwing and shows the tab heading', async () => {
    render(<LogPage />);
    expect(await screen.findByText('Log')).toBeInTheDocument();
  });
});
