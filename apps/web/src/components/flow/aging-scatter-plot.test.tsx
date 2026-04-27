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

    expect(screen.getByText('Normal work item').parentElement).toHaveStyle({
      minWidth: '0px',
      flex: '1 1 auto',
    });
    expect(screen.getByText('Normal work item')).toHaveStyle({
      overflowWrap: 'anywhere',
    });
  });
});
