import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { formatNumber } from '@ccih/domain';
import { cssVar, niceScale, useElementWidth } from '../lib/util';
import type { Column, TableState } from '../components/DataTable';
import { ChartFrame } from './ChartFrame';

export interface TrendSeries {
  name: string;
  /** Color token (e.g. 'iras-ipcs', 'serie-2', 'primary'). Follows the entity, never the rank. */
  color?: string;
  values: Array<number | null>;
}

export interface TrendChartProps {
  title: string;
  description?: ReactNode;
  period?: string;
  labels: string[];
  series: TrendSeries[];
  unit?: string;
  decimals?: number;
  target?: { value: number; label?: string };
  /** Upper control limit, constant or per period. */
  limit?: number | Array<number | null>;
  limitLabel?: string;
  height?: number;
  state?: TableState;
  onRetry?: () => void;
  onExport?: (columns: Column<Record<string, unknown>>[], rows: Record<string, unknown>[]) => void;
  footnote?: ReactNode;
}

type Row = Record<string, unknown> & { periodo: string };

export function TrendChart({ title, description, period, labels, series, unit, decimals = 1, target, limit, limitLabel = 'Limite superior de controle', height = 220, state, onRetry, onExport, footnote }: TrendChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>(640);
  const [idx, setIdx] = useState<number | null>(null);
  const W = Math.max(280, measured);
  const n = labels.length;
  const direct = series.length <= 4;
  const limits = limit == null ? null : Array.isArray(limit) ? limit : labels.map(() => limit);
  const values = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const isEmpty = n === 0 || values.length === 0;
  const max = Math.max(0, ...values, target?.value ?? 0, ...(limits ?? []).filter((v): v is number => v != null));
  const sc = niceScale(max * 1.05);
  const m = { l: 40, r: direct ? 76 : 16, t: 12, b: 28 };
  const pw = W - m.l - m.r;
  const ph = height - m.t - m.b;
  const x = (i: number) => m.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v: number) => m.t + ph - (v / sc.top) * ph;
  const every = Math.max(1, Math.ceil((n * 44) / pw));
  const color = (s: TrendSeries, i: number) => cssVar(s.color ?? `serie-${i + 1}`);
  const fmt = (v: number | null | undefined) => formatNumber(v ?? null, decimals);

  const path = (vals: Array<number | null>) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const ends = direct
    ? series
        .map((s, i) => {
          const k = s.values.findLastIndex((v) => v != null);
          return k >= 0 ? { i, y: y(s.values[k] as number), name: s.name } : null;
        })
        .filter((e): e is { i: number; y: number; name: string } => e != null)
        .sort((a, b) => a.y - b.y)
    : [];
  for (let e = 1; e < ends.length; e++) if (ends[e]!.y - ends[e - 1]!.y < 14) ends[e]!.y = ends[e - 1]!.y + 14;

  const onMove = (ev: MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const mx = (ev.clientX - r.left) * (W / r.width);
    const i = Math.round((mx - m.l) / (pw / Math.max(1, n - 1)));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (ev: KeyboardEvent<SVGSVGElement>) => {
    if (ev.key === 'ArrowRight') { setIdx((c) => (c == null ? 0 : Math.min(n - 1, c + 1))); ev.preventDefault(); }
    else if (ev.key === 'ArrowLeft') { setIdx((c) => (c == null ? n - 1 : Math.max(0, c - 1))); ev.preventDefault(); }
    else if (ev.key === 'Home') { setIdx(0); ev.preventDefault(); }
    else if (ev.key === 'End') { setIdx(n - 1); ev.preventDefault(); }
    else if (ev.key === 'Escape') setIdx(null);
  };

  const tableRows: Row[] = labels.map((l, i) => {
    const r: Row = { periodo: l };
    series.forEach((s, k) => { r[`s${k}`] = s.values[i] ?? null; });
    if (target) r.meta = target.value;
    return r;
  });
  const tableCols: Column<Row>[] = [
    { key: 'periodo', label: 'Período' },
    ...series.map((s, k): Column<Row> => ({ key: `s${k}`, label: unit ? `${s.name} (${unit})` : s.name, align: 'right', value: (r) => r[`s${k}`] as number | null, render: (r) => fmt(r[`s${k}`] as number | null) })),
    ...(target ? [{ key: 'meta', label: target.label ?? 'Meta', align: 'right' as const, value: (r: Row) => r.meta as number, render: (r: Row) => fmt(r.meta as number) }] : []),
  ];

  const announce = idx == null ? '' : `${labels[idx]}: ${series.map((s) => `${s.name} ${fmt(s.values[idx])}${unit ? ` ${unit}` : ''}`).join('; ')}`;
  let tipLeft = idx == null ? 0 : Math.min(Math.max(x(idx) + 12, 0), W - 190);
  if (idx != null && x(idx) + 200 > W) tipLeft = Math.max(0, x(idx) - 190);

  const legend =
    series.length > 1 || target || limits ? (
      <ul className="ig-legend" aria-label="Legenda">
        {series.length > 1 ? series.map((s, i) => (
          <li key={s.name}><i className="ig-legend-key" style={{ background: color(s, i) }} />{s.name}</li>
        )) : null}
        {target ? <li><i className="ig-legend-key ig-dash" />{target.label ?? 'Meta'} {fmt(target.value)}</li> : null}
        {limits ? <li><i className="ig-legend-key ig-dot" />{limitLabel}</li> : null}
      </ul>
    ) : null;

  return (
    <ChartFrame
      title={title}
      description={description}
      period={period}
      unit={unit}
      table={{ columns: tableCols, rows: tableRows, rowKey: (r) => r.periodo }}
      isEmpty={isEmpty}
      state={state}
      onRetry={onRetry}
      onExport={onExport as ((c: Column<Row>[], r: Row[]) => void) | undefined}
      legend={legend}
      footnote={footnote}
    >
      <div className="ig-chart" ref={ref}>
        <svg
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="group"
          aria-roledescription="gráfico de linhas"
          aria-label={`${title}. Use as setas esquerda e direita para percorrer os períodos.`}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setIdx(null)}
          onKeyDown={onKey}
          onBlur={() => setIdx(null)}
        >
          <g className="ig-axis" aria-hidden="true">
            {sc.ticks.map((t) => (
              <g key={t}>
                <line className="ig-grid-line" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{formatNumber(t, sc.step % 1 ? 1 : 0)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % every === 0 ? <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle">{l}</text> : null))}
          </g>
          <g aria-hidden="true">
            {target ? <line className="ig-target" x1={m.l} x2={W - m.r} y1={y(target.value)} y2={y(target.value)} /> : null}
            {limits ? <path className="ig-limit" d={path(limits)} /> : null}
            {idx != null ? <line className="ig-crosshair" x1={x(idx)} x2={x(idx)} y1={m.t} y2={m.t + ph} /> : null}
            {series.map((s, i) => {
              const last = s.values.findLastIndex((v) => v != null);
              const cur = idx != null ? s.values[idx] : null;
              return (
                <g key={s.name}>
                  <path d={path(s.values)} fill="none" stroke={color(s, i)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {last >= 0 ? <circle cx={x(last)} cy={y(s.values[last] as number)} r={4} fill={color(s, i)} stroke="var(--surface-raised)" strokeWidth={2} /> : null}
                  {idx != null && cur != null ? <circle cx={x(idx)} cy={y(cur)} r={5} fill={color(s, i)} stroke="var(--surface-raised)" strokeWidth={2} /> : null}
                </g>
              );
            })}
            {ends.map((e) => (
              <text key={e.i} className="ig-chart-label" x={W - m.r + 10} y={e.y + 4} style={{ fill: 'var(--ink)' }}>{e.name}</text>
            ))}
          </g>
        </svg>
        <span className="ig-sr-only" aria-live="polite">{announce}</span>
        {idx != null ? (
          <div className="ig-tip" style={{ left: tipLeft, top: 4 }} aria-hidden="true">
            <div className="ig-label" style={{ marginBottom: 4 }}>{labels[idx]}</div>
            {series
              .map((s, i) => ({ s, i, v: s.values[idx] ?? null }))
              .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
              .map((o) => (
                <div key={o.s.name} className="ig-tip-row">
                  <span><i className="ig-tip-key" style={{ background: color(o.s, o.i) }} />{o.s.name}</span>
                  <b>{fmt(o.v)}{unit ? ` ${unit}` : ''}</b>
                </div>
              ))}
            {target ? <div className="ig-tip-row ig-muted"><span>{target.label ?? 'Meta'}</span><span>{fmt(target.value)}</span></div> : null}
            {limits && limits[idx] != null ? <div className="ig-tip-row ig-muted"><span>LSC</span><span>{fmt(limits[idx])}</span></div> : null}
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}
