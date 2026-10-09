import { useState, type ReactNode } from 'react';
import { formatNumber } from '@ccih/domain';
import { cssVar, useElementWidth } from '../lib/util';
import type { Column, TableState } from '../components/DataTable';
import { ChartFrame } from './ChartFrame';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Color token; defaults to 'primary'. Use IRAS tokens only when the bar is an IRAS type. */
  color?: string;
  /** Extra context for tooltip and table (e.g. "6 ISC em 261 cirurgias"). */
  note?: string;
}

export interface BarChartProps {
  title: string;
  description?: ReactNode;
  period?: string;
  data: BarDatum[];
  unit?: string;
  decimals?: number;
  target?: { value: number; label?: string };
  /** Keep the given order instead of sorting descending. */
  keepOrder?: boolean;
  categoryLabel?: string;
  valueLabel?: string;
  state?: TableState;
  onRetry?: () => void;
  onExport?: (columns: Column<BarDatum>[], rows: BarDatum[]) => void;
  footnote?: ReactNode;
}

const BAR_H = 18;
/** Below this width labels go above the bars instead of beside them (no truncation in narrow cards). */
const STACK_BELOW = 420;

/** Horizontal bars, sorted, with keyboard focus per bar (tooltip never depends on hover only). */
export function BarChart({ title, description, period, data, unit, decimals = 1, target, keepOrder, categoryLabel = 'Categoria', valueLabel = 'Valor', state, onRetry, onExport, footnote }: BarChartProps) {
  const rows = keepOrder ? data : data.slice().sort((a, b) => b.value - a.value);
  const [ref, measured] = useElementWidth<HTMLDivElement>(560);
  const [idx, setIdx] = useState<number | null>(null);
  const W = Math.max(260, measured);
  const stacked = W < STACK_BELOW;
  const ROW_H = stacked ? 46 : 32;
  const top = target ? 20 : 4;
  const height = top + rows.length * ROW_H + 4;
  const labelW = stacked ? 0 : Math.min(170, Math.round(W * 0.34));
  const pw = W - labelW - 64;
  /** Bar top inside row i. */
  const barY = (i: number) => top + i * ROW_H + (stacked ? 22 : (ROW_H - BAR_H) / 2);
  const max = Math.max(target?.value ?? 0, ...rows.map((r) => r.value), 0);
  const x = (v: number) => labelW + (max ? (Math.max(0, v) / max) * pw : 0);
  const fill = (r: BarDatum) => cssVar(r.color ?? 'primary');
  const fmt = (v: number) => formatNumber(v, decimals);
  const trunc = (s: string) => {
    const c = Math.floor(((stacked ? W : labelW) - 12) / 6.2);
    return s.length > c ? `${s.slice(0, c - 1)}…` : s;
  };
  const bar = (x0: number, x1: number, yy: number) => {
    const w = Math.max(0, x1 - x0);
    const rr = Math.min(4, w, BAR_H / 2);
    return `M${x0},${yy}H${x0 + w - rr}Q${x0 + w},${yy} ${x0 + w},${yy + rr}V${yy + BAR_H - rr}Q${x0 + w},${yy + BAR_H} ${x0 + w - rr},${yy + BAR_H}H${x0}Z`;
  };

  const tableCols: Column<BarDatum>[] = [
    { key: 'label', label: categoryLabel },
    { key: 'value', label: unit ? `${valueLabel} (${unit})` : valueLabel, align: 'right', render: (r) => fmt(r.value) },
    ...(rows.some((r) => r.note) ? [{ key: 'note', label: 'Detalhe', sortable: false } as Column<BarDatum>] : []),
  ];
  const active = idx != null ? rows[idx] : undefined;

  return (
    <ChartFrame
      title={title}
      description={description}
      period={period}
      unit={unit}
      table={{ columns: tableCols, rows, rowKey: (r) => r.key }}
      isEmpty={rows.length === 0}
      state={state}
      onRetry={onRetry}
      onExport={onExport}
      legend={target ? <ul className="ig-legend" aria-label="Legenda"><li><i className="ig-legend-key ig-dash" />{target.label ?? 'Meta'} {fmt(target.value)}</li></ul> : null}
      footnote={footnote}
    >
      <div className="ig-chart" ref={ref}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="list" aria-label={title}>
          {rows.map((r, i) => {
            const yy = barY(i);
            const dim = idx != null && idx !== i;
            return (
              <g
                key={r.key}
                role="listitem"
                tabIndex={0}
                className="ig-bar-row"
                aria-label={`${r.label}: ${fmt(r.value)}${unit ? ` ${unit}` : ''}${r.note ? `. ${r.note}` : ''}`}
                onMouseEnter={() => setIdx(i)}
                onMouseLeave={() => setIdx(null)}
                onFocus={() => setIdx(i)}
                onBlur={() => setIdx(null)}
              >
                <rect className="ig-bar-hit" x={1} y={top + i * ROW_H + 1} width={W - 2} height={ROW_H - 2} rx={4} fill="transparent" />
                <text className="ig-chart-label" x={stacked ? 0 : labelW - 10} y={stacked ? yy - 6 : yy + BAR_H / 2 + 4} textAnchor={stacked ? 'start' : 'end'} style={{ fill: 'var(--ink)' }} aria-hidden="true">
                  <title>{r.label}</title>
                  {trunc(r.label)}
                </text>
                <path d={bar(labelW, x(r.value), yy)} fill={fill(r)} opacity={dim ? 0.4 : 1} aria-hidden="true" />
                <text className="ig-chart-value" x={x(r.value) + 6} y={yy + BAR_H / 2 + 4} aria-hidden="true">{fmt(r.value)}</text>
              </g>
            );
          })}
          <line x1={labelW} x2={labelW} y1={top - 2} y2={height - 2} stroke="var(--line-strong)" aria-hidden="true" />
          {target ? (
            <g aria-hidden="true">
              <line className="ig-target" x1={x(target.value)} x2={x(target.value)} y1={top - 4} y2={height - 2} />
              <text className="ig-chart-label" x={x(target.value)} y={12} textAnchor="middle">{target.label ?? 'Meta'}</text>
            </g>
          ) : null}
        </svg>
        {active && idx != null ? (
          <div className="ig-tip" style={{ left: Math.max(0, Math.min(x(active.value) + 12, W - 180)), top: barY(idx) + BAR_H + 4 }} aria-hidden="true">
            <div className="ig-label" style={{ marginBottom: 4 }}>{active.label}</div>
            <div className="ig-tip-row">
              <span><i className="ig-tip-key" style={{ background: fill(active), height: 10 }} />{valueLabel}</span>
              <b>{fmt(active.value)}{unit ? ` ${unit}` : ''}</b>
            </div>
            {target ? <div className="ig-tip-row ig-muted"><span>{target.label ?? 'Meta'}</span><span>{fmt(target.value)}</span></div> : null}
            {active.note ? <div className="ig-muted" style={{ marginTop: 4 }}>{active.note}</div> : null}
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
