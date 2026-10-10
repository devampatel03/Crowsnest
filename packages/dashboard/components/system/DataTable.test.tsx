import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, nextSort, sortRows, type Column } from './DataTable';

type Row = { id: string; name: string; n: number };
const rows: Row[] = [
  { id: 'a', name: 'alpha', n: 3 },
  { id: 'b', name: 'beta', n: 1 },
  { id: 'c', name: 'gamma', n: 2 },
];
const columns: Column<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
  { id: 'n', header: 'N', cell: (r) => r.n, sortValue: (r) => r.n, mono: true, align: 'right' },
];

describe('sort helpers', () => {
  it('cycles asc, desc, none', () => {
    expect(nextSort(null, 'n')).toEqual({ id: 'n', dir: 'asc' });
    expect(nextSort({ id: 'n', dir: 'asc' }, 'n')).toEqual({ id: 'n', dir: 'desc' });
    expect(nextSort({ id: 'n', dir: 'desc' }, 'n')).toBeNull();
    expect(nextSort({ id: 'n', dir: 'desc' }, 'name')).toEqual({ id: 'name', dir: 'asc' });
  });
  it('sorts numerically and keeps input order for null sort', () => {
    expect(sortRows(rows, columns, { id: 'n', dir: 'asc' }).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortRows(rows, columns, { id: 'n', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortRows(rows, columns, null)).toBe(rows);
  });
});

describe('DataTable', () => {
  const base = { ariaLabel: 'Test rows', columns, rows, rowKey: (r: Row) => r.id };

  it('renders table semantics and aria-sort, with no end marker', () => {
    render(<DataTable {...base} sort={{ id: 'n', dir: 'asc' }} />);
    expect(screen.getByRole('table', { name: 'Test rows' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^N(\s|$)/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');
    expect(screen.queryByText(/end of list/)).toBeNull();
    const dataRows = screen.getAllByRole('row').slice(1);
    expect(dataRows[0]).toHaveTextContent('beta');
  });

  it('uses one tab stop and j/k moves focus', () => {
    render(<DataTable {...base} />);
    const dataRows = screen.getAllByRole('row').slice(1);
    expect(dataRows.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    dataRows[0].focus();
    fireEvent.keyDown(dataRows[0], { key: 'j' });
    expect(document.activeElement).toBe(screen.getAllByRole('row')[2]);
  });

  it('Enter activates, x does nothing (no multi-select), header click requests a sort change', () => {
    const onActivate = vi.fn();
    const onSortChange = vi.fn();
    render(
      <DataTable
        {...base}
        onActivate={onActivate}
        selectedKey="b"
        onSortChange={onSortChange}
      />,
    );
    const first = screen.getAllByRole('row')[1];
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith(rows[0]);
    fireEvent.keyDown(first, { key: 'x', shiftKey: true });
    fireEvent.keyDown(first, { key: 'a', ctrlKey: true });
    expect(onActivate).toHaveBeenCalledTimes(1);
    const selectedRow = screen.getAllByRole('row')[2];
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');
    expect(selectedRow).toHaveClass('border-l-brand', 'bg-pressed');
    fireEvent.click(screen.getByRole('button', { name: /^N(\s|$)/ }));
    expect(onSortChange).toHaveBeenCalledWith({ id: 'n', dir: 'asc' });
  });

  it('does not hijack keys typed in inner controls', () => {
    const onActivate = vi.fn();
    const cols: Column<Row>[] = [{ id: 'i', header: 'I', cell: () => <input aria-label="inner" /> }];
    render(<DataTable {...base} columns={cols} onActivate={onActivate} />);
    fireEvent.keyDown(screen.getAllByLabelText('inner')[0], { key: 'Enter' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('shows skeleton while loading and the empty node when there are no rows', () => {
    const { rerender } = render(<DataTable {...base} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Test rows');
    rerender(<DataTable {...base} rows={[]} empty={<p>Nothing here.</p>} />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('expander toggles details and exposes aria-expanded', () => {
    const onToggleExpanded = vi.fn();
    render(
      <DataTable
        {...base}
        renderExpanded={(r) => <p>detail {r.name}</p>}
        expandedKeys={new Set(['a'])}
        onToggleExpanded={onToggleExpanded}
      />,
    );
    expect(screen.getByText('detail alpha')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /details/i });
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(buttons[1]);
    expect(onToggleExpanded).toHaveBeenCalledWith('b');
  });
});
