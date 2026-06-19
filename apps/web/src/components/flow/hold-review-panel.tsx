'use client';

import type { HoldReviewItem } from '@agile-tools/shared/contracts/api';
import { codeStyle, insetPanelStyle, palette, tonePillStyle } from '@/components/app/chrome';

interface HoldReviewPanelProps {
  holdItems: HoldReviewItem[];
  onItemSelect?: (workItemId: string, issueKey: string) => void;
}

const placementLabels: Record<HoldReviewItem['placement'], string> = {
  before_start: 'Before start',
  in_flow: 'In flow',
  done: 'Done',
  off_board: 'Off-board',
};

const placementTones: Record<HoldReviewItem['placement'], 'neutral' | 'info' | 'warning' | 'positive'> = {
  before_start: 'warning',
  in_flow: 'info',
  done: 'positive',
  off_board: 'warning',
};

export function HoldReviewPanel({ holdItems, onItemSelect }: HoldReviewPanelProps) {
  const offBoardCount = holdItems.filter((item) => item.placement === 'off_board').length;
  const beforeStartCount = holdItems.filter((item) => item.placement === 'before_start').length;
  const longestHold = holdItems[0]?.holdAgeDays ?? 0;

  if (holdItems.length === 0) {
    return (
      <div
        style={{
          ...insetPanelStyle,
          minHeight: '20rem',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ margin: 0, color: palette.ink, fontWeight: 700 }}>No current hold items</p>
          <p style={{ margin: '0.35rem 0 0', color: palette.soft, fontSize: '0.875rem' }}>
            Configured hold statuses will appear here when Jira issues enter them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }} role="region" aria-label="Hold review">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
          gap: '0.6rem',
        }}
      >
        <HoldMetric label="Current holds" value={String(holdItems.length)} />
        <HoldMetric label="Longest hold" value={`${formatDays(longestHold)}d`} />
        <HoldMetric label="Off-board" value={String(offBoardCount)} />
        <HoldMetric label="Before start" value={String(beforeStartCount)} />
      </div>

      <div
        style={{
          border: `1px solid ${palette.line}`,
          borderRadius: '8px',
          overflowX: 'auto',
          overflowY: 'hidden',
          background: palette.panel,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(9rem, 1.2fr) minmax(8rem, 0.9fr) minmax(7rem, 0.8fr) 5.5rem 5.5rem minmax(7rem, 0.8fr)',
            gap: '0.65rem',
            padding: '0.55rem 0.75rem',
            color: palette.soft,
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            borderBottom: `1px solid ${palette.line}`,
            minWidth: '48rem',
          }}
        >
          <span>Issue</span>
          <span>Status</span>
          <span>Location</span>
          <span>Hold age</span>
          <span>Flow age</span>
          <span>Assignee</span>
        </div>
        <div style={{ display: 'grid' }}>
          {holdItems.map((item) => (
            <button
              key={item.workItemId}
              type="button"
              onClick={() => onItemSelect?.(item.workItemId, item.issueKey)}
              style={{
                appearance: 'none',
                border: 0,
                borderBottom: `1px solid ${palette.line}`,
                background: palette.panel,
                color: palette.ink,
                cursor: onItemSelect ? 'pointer' : 'default',
                display: 'grid',
                gridTemplateColumns: 'minmax(9rem, 1.2fr) minmax(8rem, 0.9fr) minmax(7rem, 0.8fr) 5.5rem 5.5rem minmax(7rem, 0.8fr)',
                gap: '0.65rem',
                padding: '0.7rem 0.75rem',
                textAlign: 'left',
                alignItems: 'center',
                width: '100%',
                minWidth: '48rem',
                font: 'inherit',
              }}
              aria-label={`Open ${item.issueKey} hold details`}
            >
              <span style={{ minWidth: 0 }}>
                <span style={codeStyle}>{item.issueKey}</span>
                <span
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    color: palette.muted,
                    fontSize: '0.78rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.summary}
                </span>
              </span>
              <span style={{ color: palette.ink }}>{item.currentStatus}</span>
              <span style={tonePillStyle(placementTones[item.placement])}>
                {placementLabels[item.placement]}
              </span>
              <StrongMetric value={`${formatDays(item.holdAgeDays)}d`} />
              <span style={{ color: item.flowAgeDays == null ? palette.soft : palette.ink }}>
                {item.flowAgeDays == null ? 'Not started' : `${formatDays(item.flowAgeDays)}d`}
              </span>
              <span style={{ color: item.assigneeName ? palette.ink : palette.soft }}>
                {item.assigneeName ?? 'Unassigned'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: palette.soft, fontSize: '0.82rem' }}>
          Off-board and before-start holds are reviewed here without forcing them into the aging charts.
        </span>
      </div>
    </div>
  );
}

function HoldMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px solid ${palette.line}`,
        borderRadius: '8px',
        background: palette.panel,
        padding: '0.65rem 0.75rem',
      }}
    >
      <p style={{ margin: 0, color: palette.soft, fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: '0.25rem 0 0', color: palette.ink, fontSize: '1.2rem', fontWeight: 800 }}>
        {value}
      </p>
    </div>
  );
}

function StrongMetric({ value }: { value: string }) {
  return <span style={{ color: palette.warning, fontWeight: 800 }}>{value}</span>;
}

function formatDays(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1);
}
