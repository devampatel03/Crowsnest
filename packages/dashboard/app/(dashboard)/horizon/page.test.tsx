import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Incident } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  fetchIncidents: vi.fn(async (): Promise<Incident[]> => []),
  triggerScan: vi.fn(async () => ({ scan_id: 'test-scan-id' })),
}));

vi.mock('@/lib/sse', () => ({
  useSSEStream: vi.fn(() => ({ connected: false, reconnect: vi.fn() })),
}));

import HorizonPage from './page';

describe('HorizonPage (smoke)', () => {
  it('renders without throwing and shows the tab heading', async () => {
    render(<HorizonPage />);
    expect(await screen.findByText('Horizon')).toBeInTheDocument();
    expect(screen.getByText('Scan Project')).toBeInTheDocument();
  });
});
