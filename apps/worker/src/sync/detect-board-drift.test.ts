import { describe, expect, it } from 'vitest';

import { detectBoardDrift } from './detect-board-drift.js';

describe('detectBoardDrift', () => {
  it('accepts done statuses that are available in completionStatuses but not on the board', () => {
    const drift = detectBoardDrift(
      {
        id: 'scope-1',
        workspaceId: 'workspace-1',
        boardId: '42',
        startStatusIds: ['2'],
        doneStatusIds: ['4'],
      },
      {
        boardId: 42,
        boardName: 'Team Kanban',
        columns: [
          { name: 'To Do', statusIds: ['1'] },
          { name: 'Doing', statusIds: ['2'] },
          { name: 'Done', statusIds: ['3'] },
        ],
        statuses: [
          { id: '1', name: 'To Do' },
          { id: '2', name: 'In Progress' },
          { id: '3', name: 'Done' },
        ],
        completionStatuses: [
          { id: '1', name: 'To Do' },
          { id: '2', name: 'In Progress' },
          { id: '3', name: 'Done' },
          { id: '4', name: 'Closed' },
        ],
        issueTypes: [{ id: 'story', name: 'Story' }],
      },
    );

    expect(drift).toBeNull();
  });

  it('flags done statuses that disappear from both the board and completionStatuses', () => {
    const drift = detectBoardDrift(
      {
        id: 'scope-1',
        workspaceId: 'workspace-1',
        boardId: '42',
        startStatusIds: ['2'],
        doneStatusIds: ['9'],
      },
      {
        boardId: 42,
        boardName: 'Team Kanban',
        columns: [
          { name: 'To Do', statusIds: ['1'] },
          { name: 'Doing', statusIds: ['2'] },
        ],
        statuses: [
          { id: '1', name: 'To Do' },
          { id: '2', name: 'In Progress' },
        ],
        completionStatuses: [
          { id: '1', name: 'To Do' },
          { id: '2', name: 'In Progress' },
          { id: '4', name: 'Closed' },
        ],
        issueTypes: [{ id: 'story', name: 'Story' }],
      },
    );

    expect(drift).toEqual({
      missingStartStatuses: [],
      missingDoneStatuses: ['9'],
    });
  });
});