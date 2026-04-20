// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FlowFiltersPanel, type FlowFilters } from './flow-filters';

const baseFilters: FlowFilters = {
  historicalWindowDays: 90,
  issueTypeIds: [],
  statusIds: [],
  agingOnly: false,
  onHoldOnly: false,
};

describe('FlowFiltersPanel', () => {
  it('emits updated filter state when controls change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FlowFiltersPanel
        filterOptions={{
          historicalWindows: [30, 90],
          issueTypes: [{ id: 'story', name: 'Story' }],
          statuses: [{ id: '10', name: 'In Progress' }],
        }}
        filters={baseFilters}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /historical timeframe/i }), '30');
    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, historicalWindowDays: 30 });

    await user.click(screen.getByRole('checkbox', { name: /filter by story/i }));
    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, issueTypeIds: ['story'] });

    await user.click(screen.getByRole('checkbox', { name: /filter by status in progress/i }));
    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, statusIds: ['10'] });

    await user.click(screen.getByRole('checkbox', { name: /aging only/i }));
    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, agingOnly: true });

    await user.click(screen.getByRole('checkbox', { name: /on-hold only/i }));
    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, onHoldOnly: true });
  });
});