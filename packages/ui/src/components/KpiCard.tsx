import type { ReactNode } from 'react';
import { formatNumber, formatSigned, type TargetEvaluation, type TargetOrigin, type Trend } from '@ccih/domain';
import { ProvenanceTag, StatusBadge } from './Basics';
import { Icon } from './Icon';

function Sparkline({ values }: { values: Array<number | null> }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const w = 96;
  const h = 32;
  const mn = Math.min(...v);
  const rg = Math.max(...v) - mn || 1;
  const pts = v.map((y, i) => [(i * (w - 6)) / (v.length - 1) + 1, h - 4 - ((y - mn) / rg) * (h - 8)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--ink-muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="var(--primary)" stroke="var(--surface-raised)" strokeWidth={2} />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  value: number | null;
  unit?: string;
  decimals?: number;
  /** Result of evaluateTarget(); absent hides the badge. */
  evaluation?: TargetEvaluation;
  target?: { value: number; direction: 'lower' | 'higher'; origin: TargetOrigin };
  trend?: Trend;
  previousLabel?: string;
  spark?: Array<number | null>;
  /** Shown instead of the number when there is no value (e.g. "Denominador zero"). */
  emptyReason?: string;
  footnote?: ReactNode;
  onSelect?: () => void;
}

export function KpiCard({ label, value, unit, decimals = 1, evaluation, target, trend, previousLabel = 'vs anterior', spark, emptyReason, footnote, onSelect }: KpiCardProps) {
  const body = (
    <>
      <div className="ig-kpi-top">
        <span className="ig-label">{label}</span>
        {evaluation ? <StatusBadge status={evaluation.status}>{evaluation.label}</StatusBadge> : null}
      </div>
      <div className="ig-kpi-top" style={{ alignItems: 'flex-end' }}>
        <div className="ig-kpi-value">
          {formatNumber(value, decimals)}
          {unit && value != null ? <span className="ig-kpi-unit">{unit}</span> : null}
        </div>
        {spark ? <Sparkline values={spark} /> : null}
      </div>
      {value == null && emptyReason ? <p className="ig-kpi-note">{emptyReason}</p> : null}
      <div className="ig-kpi-foot">
        <span className="ig-row" style={{ gap: 6 }}>
          {target ? (
            <>
              <span>Meta {target.direction === 'lower' ? '≤' : '≥'} {formatNumber(target.value, decimals)}</span>
              {target.origin === 'demonstracao' ? <ProvenanceTag kind="meta_demo">demo</ProvenanceTag> : null}
            </>
          ) : (
            <span>Sem meta configurada</span>
          )}
        </span>
        {trend && trend.delta != null ? (
          <span
            className="ig-kpi-delta"
            aria-label={`Variação ${formatSigned(trend.delta, decimals)} ${previousLabel}, ${trend.improved == null ? 'estável' : trend.improved ? 'melhora' : 'piora'}`}
          >
            <span style={{ color: trend.improved == null ? 'var(--ink-muted)' : trend.improved ? 'var(--ok)' : 'var(--crit)', display: 'inline-flex' }}>
              <Icon name={trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat'} size={14} />
            </span>
            <b>{formatSigned(trend.delta, decimals)}</b> {previousLabel}
          </span>
        ) : null}
      </div>
      {footnote ? <p className="ig-kpi-note">{footnote}</p> : null}
      {onSelect ? (
        <span>
          <button type="button" className="ig-btn ig-btn-ghost ig-btn-sm" onClick={onSelect} aria-label={`Detalhar ${label}`}>
            Detalhar <Icon name="chevron" size={14} />
          </button>
        </span>
      ) : null}
    </>
  );
  return <div className="ig-card ig-kpi">{body}</div>;
}
