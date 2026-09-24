import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Incident } from '@/lib/types';

const sampleIncident: Incident = {
  id: 'inc-1',
  attack_pattern: 'typosquat',
  confidence: 0.87,
  severity: 'HIGH',
  packages: ['left-pad-typo'],
  blast_radius: [
    { project_path: 'apps/web', package: 'left-pad-typo', version: '1.0.0', declared_in: 'package.json', runtime_confirmed: false },
  ],
  runtime_confirmation: false,
  remediation_options: ['Remove the package', 'Pin to the legitimate package'],
  detected_at: new Date().toISOString(),
  raw_findings: [],
};

vi.mock('@/lib/api', () => ({
  fetchIncidents: vi.fn(async (): Promise<Incident[]> => [sampleIncident]),
  replayIncident: vi.fn(async () => ({})),
}));

import LogPage from './page';

describe('LogPage (smoke)', () => {
  it('renders without throwing and shows the tab heading', async () => {
    render(<LogPage />);
    expect(await screen.findByText('Log')).toBeInTheDocument();
  });

  it('shows a toast (not a native alert) on successful replay', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {
      throw new Error('window.alert should never be called');
    });

    render(<LogPage />);
    const replayButton = await screen.findByRole('button', { name: /replay/i });

    fireEvent.click(replayButton);

    expect(await screen.findByText(/Replay complete for:/i)).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('expands an incident to reveal remediation details on click', async () => {
    render(<LogPage />);
    const heading = await screen.findByText('Typosquatting');

    fireEvent.click(heading);

    await waitFor(() => {
      expect(screen.getByText('Remediation options')).toBeInTheDocument();
    });
  });
});
