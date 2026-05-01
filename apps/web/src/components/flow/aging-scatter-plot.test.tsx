// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgingScatterTooltipCard } from './aging-scatter-plot';

describe('AgingScatterTooltipCard', () => {
  it('lets the summary column grow to fill the header row', () => {
    render(
      <AgingScatterTooltipCard
        datum={{
          x: 8.25,
          y: 0,
          workItemId: 'work-item-1',
          issueKey: 'AGILE-101',
          summary: 'Normal work item',
          issueType: 'Story',
          currentStatus: 'In Progress',
          currentColumn: 'Doing',
          assigneeName: 'Riley Chen',
          onHoldNow: false,
          agingZone: 'watch',
        }}
        ageDays={8.25}
      />,
    );

    const summary = screen.getByText('Normal work item');
    const card = summary.parentElement?.parentElement?.parentElement?.parentElement;

    expect(card).toHaveStyle({
      width: '19.5rem',
      maxWidth: 'calc(100vw - 2rem)',
    });
    expect(summary.parentElement).toHaveStyle({
      minWidth: '0px',
      flex: '1 1 auto',
    });
    expect(summary).toHaveStyle({
      overflowWrap: 'break-word',
    });
  });
});
