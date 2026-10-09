import { useState, type ReactNode } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/Basics';
import { DataTable, type Column, type TableState } from '../components/DataTable';

export interface ChartTable<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, index: number) => string;
}

export interface ChartFrameProps<R> {
  title: string;
  description?: ReactNode;
  /** Period shown under the title, e.g. "out/25 – set/26". */
  period?: string;
  unit?: string;
  table: ChartTable<R>;
  isEmpty: boolean;
  emptyMessage?: ReactNode;
  state?: TableState;
  onRetry?: () => void;
  onExport?: (columns: Column<R>[], rows: R[]) => void;
  legend?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}

/** Common chrome for every chart: context, legend, chart ⇄ table toggle and data states. */
export function ChartFrame<R>({ title, description, period, unit, table, isEmpty, emptyMessage, state = 'ready', onRetry, onExport, legend, footnote, children }: ChartFrameProps<R>) {
  const [asTable, setAsTable] = useState(false);
  const meta = [description, period, unit ? `Unidade: ${unit}` : null].filter(Boolean);
  return (
    <section className="ig-card" aria-label={title}>
      <div className="ig-card-head">
        <div>
          <h3 className="ig-card-title">{title}</h3>
          {meta.length ? (
            <p className="ig-card-sub">
              {meta.map((m, i) => (
                <span key={i}>{i ? ' · ' : ''}{m}</span>
              ))}
            </p>
          ) : null}
        </div>
        {state === 'ready' && !isEmpty ? (
          <span className="ig-row" style={{ gap: 4 }}>
            <Button variant="ghost" size="sm" icon={asTable ? 'chart' : 'table'} aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Ver gráfico' : 'Visualizar tabela'}
            </Button>
            {onExport ? (
              <Button variant="ghost" size="sm" icon="download" onClick={() => onExport(table.columns, table.rows)}>
                CSV
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
      {state === 'loading' ? (
        <LoadingState lines={4} />
      ) : state === 'error' ? (
        <ErrorState {...(onRetry ? { onRetry } : {})} />
      ) : isEmpty ? (
        <EmptyState>{emptyMessage ?? 'Não há dados para os filtros selecionados.'}</EmptyState>
      ) : asTable ? (
        <DataTable columns={table.columns} rows={table.rows} rowKey={table.rowKey} dense ariaLabel={`${title} — tabela`} />
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
      {footnote && state === 'ready' && !isEmpty ? <p className="ig-card-foot">{footnote}</p> : null}
    </section>
  );
}
