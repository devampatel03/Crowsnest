import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Call } from './Call';
import { Gauge, GAUGE_FILLED, NoFlags, gaugeFromSeverity, gaugeText } from './Gauge';

function filled(container: HTMLElement): number {
  return container.querySelectorAll('.gauge-notch[data-filled="true"]').length;
}

describe('Gauge', () => {
  it('fills 0, 1, 2, 3 notches for Clear, Note, Watch, Hold (meaning without colour)', () => {
    expect(GAUGE_FILLED).toEqual({ clear: 0, note: 1, watch: 2, hold: 3 });
    for (const [level, count] of Object.entries(GAUGE_FILLED)) {
      const { container, unmount } = render(<Gauge level={level as 'clear'} />);
      expect(container.querySelectorAll('.gauge-notch')).toHaveLength(3);
      expect(filled(container)).toBe(count);
      unmount();
    }
  });

  it('always prints the word, with "Hold · urgent" for urgent holds', () => {
    const { rerender } = render(<Gauge level="watch" />);
    expect(screen.getByText('Watch')).toBeInTheDocument();
    rerender(<Gauge level="hold" urgent />);
    expect(screen.getByText('Hold · urgent')).toBeInTheDocument();
    expect(gaugeText('hold')).toBe('Hold');
    expect(gaugeText('watch', true)).toBe('Watch');
  });

  it('maps severity: LOW Note, MEDIUM Watch, HIGH Hold, CRITICAL Hold urgent', () => {
    expect(gaugeFromSeverity('LOW')).toEqual({ level: 'note', urgent: false });
    expect(gaugeFromSeverity('MEDIUM')).toEqual({ level: 'watch', urgent: false });
    expect(gaugeFromSeverity('HIGH')).toEqual({ level: 'hold', urgent: false });
    expect(gaugeFromSeverity('CRITICAL')).toEqual({ level: 'hold', urgent: true });
  });

  it('uses the alarm colour only for hold, and names the mark when the word is hidden', () => {
    const { container, rerender } = render(<Gauge level="hold" />);
    expect(container.firstElementChild).toHaveClass('text-hold');
    rerender(<Gauge level="watch" />);
    expect(container.firstElementChild).not.toHaveClass('text-hold');
    rerender(<Gauge level="hold" showWord={false} />);
    expect(screen.getByRole('img', { name: 'Hold' })).toBeInTheDocument();
  });

  it('NoFlags never says Clear', () => {
    render(<NoFlags />);
    expect(screen.getByText('No flags')).toBeInTheDocument();
    expect(screen.queryByText(/clear/i)).toBeNull();
  });
});

describe('Call', () => {
  it('renders headline, quiet line, gauge word and the first piece of advice as the main action', () => {
    render(
      <Call
        level="hold"
        headline="This package's name is very close to a famous one."
        detail="quikrequest@1.0.0 · used in 3 projects · found 2 days ago"
        advice={['Remove it and install the well-known package instead.', 'Check who else uses it.']}
      />,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('very close to a famous one');
    expect(screen.getByText(/used in 3 projects/)).toBeInTheDocument();
    expect(screen.getByText('Hold')).toBeInTheDocument();
    expect(screen.getByText('What to do')).toBeInTheDocument();
    expect(screen.getByText('Remove it and install the well-known package instead.')).toBeInTheDocument();
    expect(screen.getByText('Check who else uses it.').tagName).toBe('LI');
  });
});
