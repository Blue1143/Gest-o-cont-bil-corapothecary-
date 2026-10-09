import { useId } from 'react';
import { formatDate, formatNumber, type BundleAnswer, type BundleEvaluation, type BundleMethod, type StockEvaluation, type TargetEvaluation, type TargetOrigin } from '@ccih/domain';
import { cx, cssVar } from '../lib/util';
import { Card, ProvenanceTag, StatusBadge } from '../components/Basics';
import { DataTable, type Column, type DataTableProps } from '../components/DataTable';

/* ---------- TrainingProgress ---------- */

export interface TrainingItem {
  id: string;
  topic: string;
  audience?: string;
  done: number;
  total: number;
  nextRecycle?: string;
  evaluation: TargetEvaluation;
}

export interface TrainingProgressProps {
  title?: string;
  /** Coverage target in %, when configured. */
  target?: { value: number; origin: TargetOrigin };
  items: TrainingItem[];
}

export function TrainingProgress({ title = 'Treinamentos', target, items }: TrainingProgressProps) {
  return (
    <Card
      title={title}
      subtitle={
        target ? (
          <>Cobertura por tema · meta {formatNumber(target.value)}% (traço vertical) {target.origin === 'demonstracao' ? <ProvenanceTag kind="meta_demo">demo</ProvenanceTag> : null}</>
        ) : (
          'Cobertura por tema · sem meta configurada'
        )
      }
    >
      <ul className="ig-prog">
        {items.map((t) => {
          const pct = t.total ? (t.done / t.total) * 100 : 0;
          const fillToken = t.evaluation.status === 'neutral' ? 'line-strong' : t.evaluation.status;
          return (
            <li key={t.id} className="ig-prog-item">
              <div className="ig-prog-head">
                <div className="ig-prog-name">
                  {t.topic}
                  <small>{[t.audience, t.nextRecycle ? `reciclagem ${formatDate(t.nextRecycle)}` : null].filter(Boolean).join(' · ')}</small>
                </div>
                <div className="ig-prog-val">
                  <b>{formatNumber(pct)}%</b>
                  <span className="ig-muted">{t.done}/{t.total}</span>
                  <StatusBadge status={t.evaluation.status}>{t.evaluation.label}</StatusBadge>
                </div>
              </div>
              <div className="ig-prog-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${t.topic}: ${formatNumber(pct)}%`}>
                <div className="ig-prog-fill" style={{ width: `${Math.min(100, pct)}%`, background: cssVar(fillToken) }} />
                {target ? <div className="ig-prog-meta" style={{ left: `calc(${target.value}% - 1px)` }} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- BundleChecklist ---------- */

export interface BundleChecklistProps {
  title: string;
  context?: string;
  items: Array<{ id: string; text: string }>;
  answers: BundleAnswer[];
  evaluation: BundleEvaluation;
  method: BundleMethod;
  /** Omit for a read-only audit. */
  onAnswer?: (index: number, answer: BundleAnswer) => void;
}

const OPTIONS: Array<[Exclude<BundleAnswer, null>, string, string]> = [
  ['conforme', 'Conforme', 'ig-yes'],
  ['nao_conforme', 'Não conforme', 'ig-no'],
  ['nao_aplicavel', 'N/A', 'ig-na'],
];

/** Controlled bundle audit; read-only when `onAnswer` is absent (audit M-03). */
export function BundleChecklist({ title, context, items, answers, evaluation, method, onAnswer }: BundleChecklistProps) {
  const readOnly = !onAnswer;
  const noteId = useId();
  return (
    <Card title={title} subtitle={context} actions={<StatusBadge status={evaluation.status}>{evaluation.label}</StatusBadge>}>
      <ul className="ig-chk" aria-describedby={noteId}>
        {items.map((it, i) => (
          <li key={it.id}>
            <span>{it.text}</span>
            <span className="ig-seg" role="group" aria-label={it.text}>
              {OPTIONS.map(([value, label, cls]) => (
                <button
                  key={value}
                  type="button"
                  className={cx('ig-check', cls)}
                  aria-pressed={answers[i] === value}
                  disabled={readOnly}
                  onClick={() => onAnswer?.(i, answers[i] === value ? null : value)}
                >
                  {label}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="ig-card-foot" id={noteId}>
        {method === 'tudo_ou_nada'
          ? 'Método “tudo ou nada”: um único item não conforme torna a auditoria não conforme.'
          : `Método por item: ${evaluation.itemCompliancePct != null ? `${formatNumber(evaluation.itemCompliancePct)}% dos itens aplicáveis conformes` : 'sem itens aplicáveis'}.`}
        {readOnly ? ' Registro somente leitura.' : ''}
      </p>
    </Card>
  );
}

/* ---------- SupplyStock ---------- */

export interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  dailyConsumption: number | null;
  lot?: string;
  expiresOn?: string;
  evaluation: StockEvaluation;
}

const STATUS_ORDER = { crit: 0, warn: 1, neutral: 2, info: 3, ok: 4 } as const;

/** Supplies relevant to infection prevention, ordered by the most critical first. */
export function SupplyStock({ title = 'Insumos de prevenção e controle', rows, onExport }: { title?: string; rows: SupplyRow[]; onExport?: DataTableProps<SupplyRow>['onExport'] }) {
  const columns: Column<SupplyRow>[] = [
    { key: 'name', label: 'Insumo', render: (r) => <span>{r.name}{r.lot ? <span className="ig-mono ig-muted" style={{ marginLeft: 8 }}>{r.lot}</span> : null}</span> },
    { key: 'quantity', label: 'Estoque', align: 'right', value: (r) => r.quantity, render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
    { key: 'dailyConsumption', label: 'Consumo/dia', align: 'right', value: (r) => r.dailyConsumption, render: (r) => formatNumber(r.dailyConsumption, 1) },
    { key: 'coverage', label: 'Cobertura', align: 'right', value: (r) => r.evaluation.coverageDays, render: (r) => (r.evaluation.coverageDays == null ? '—' : `${formatNumber(r.evaluation.coverageDays)} dias`) },
    { key: 'expiresOn', label: 'Validade', value: (r) => r.expiresOn ?? null, render: (r) => formatDate(r.expiresOn) },
    { key: 'status', label: 'Situação', value: (r) => STATUS_ORDER[r.evaluation.status], render: (r) => <StatusBadge status={r.evaluation.status}>{r.evaluation.label}</StatusBadge>, exportable: true },
  ];
  return <DataTable caption={title} columns={columns} rows={rows} rowKey={(r) => r.id} initialSort={{ key: 'status', dir: 'asc' }} searchable onExport={onExport} />;
}
