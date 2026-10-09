import { useId, useMemo, useState, type ReactNode } from 'react';
import { cx } from '../lib/util';
import { Button, EmptyState, ErrorState, LoadingState } from './Basics';
import { Icon } from './Icon';

export interface Column<R> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Cell content; defaults to the row value at `key`. */
  render?: (row: R) => ReactNode;
  /** Value used for sorting, searching and CSV export. */
  value?: (row: R) => string | number | null | undefined;
  sortable?: boolean;
  /** Hidden by default (user can enable it in "Colunas"). */
  hidden?: boolean;
  /** Excluded from CSV export (e.g. action buttons). */
  exportable?: boolean;
}

export type TableState = 'ready' | 'loading' | 'error';

export interface DataTableProps<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R, index: number) => string;
  caption?: ReactNode;
  /** Accessible name when the caption is visual only. */
  ariaLabel?: string;
  state?: TableState;
  onRetry?: () => void;
  emptyMessage?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  dense?: boolean;
  columnPicker?: boolean;
  /** Export handler: receives visible columns and filtered rows. The caller checks permission and logs it. */
  onExport?: (columns: Column<R>[], rows: R[]) => void;
  toolbar?: ReactNode;
}

const cellValue = <R,>(col: Column<R>, row: R): string | number | null | undefined =>
  col.value ? col.value(row) : ((row as Record<string, unknown>)[col.key] as string | number | null | undefined);

export function DataTable<R>({
  columns, rows, rowKey, caption, ariaLabel, state = 'ready', onRetry, emptyMessage = 'Nenhum registro no período.',
  searchable = false, searchPlaceholder = 'Pesquisar', pageSize, initialSort, dense, columnPicker = false, onExport, toolbar,
}: DataTableProps<R>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState(() => new Set(columns.filter((c) => c.hidden).map((c) => c.key)));
  const [menuOpen, setMenuOpen] = useState(false);
  const searchId = useId();
  const menuId = useId();

  const visible = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    let out = q
      ? rows.filter((r) => columns.some((c) => String(cellValue(c, r) ?? '').toLocaleLowerCase('pt-BR').includes(q)))
      : rows.slice();
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = out.slice().sort((a, b) => {
          const A = cellValue(col, a);
          const B = cellValue(col, b);
          if (A == null && B == null) return 0;
          if (A == null) return 1;
          if (B == null) return -1;
          const r = typeof A === 'number' && typeof B === 'number' ? A - B : String(A).localeCompare(String(B), 'pt-BR', { numeric: true });
          return sort.dir === 'desc' ? -r : r;
        });
      }
    }
    return out;
  }, [rows, columns, query, sort]);

  const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const shown = pageSize ? filtered.slice(current * pageSize, (current + 1) * pageSize) : filtered;

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }));

  const hasHead = caption || searchable || columnPicker || onExport || toolbar;

  return (
    <div className="ig-table-box">
      {hasHead ? (
        <div className="ig-table-head">
          {caption ? <h3 className="ig-table-title">{caption}</h3> : <span />}
          <div className="ig-table-tools">
            {toolbar}
            {searchable ? (
              <>
                <label htmlFor={searchId} className="ig-sr-only">{searchPlaceholder}</label>
                <input
                  id={searchId}
                  className="ig-input"
                  type="search"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                />
              </>
            ) : null}
            {columnPicker ? (
              <div className="ig-colmenu">
                <Button size="sm" icon="columns" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((o) => !o)}>
                  Colunas
                </Button>
                {menuOpen ? (
                  <div className="ig-colmenu-panel" id={menuId}>
                    {columns.map((c) => (
                      <label key={c.key}>
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.key)}
                          disabled={!hidden.has(c.key) && visible.length === 1}
                          onChange={() =>
                            setHidden((h) => {
                              const n = new Set(h);
                              if (n.has(c.key)) n.delete(c.key);
                              else n.add(c.key);
                              return n;
                            })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {onExport ? (
              <Button size="sm" icon="download" onClick={() => onExport(visible.filter((c) => c.exportable !== false), filtered)} disabled={state !== 'ready' || !filtered.length}>
                Exportar CSV
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state === 'loading' ? (
        <div style={{ padding: 16 }}><LoadingState /></div>
      ) : state === 'error' ? (
        <ErrorState {...(onRetry ? { onRetry } : {})} />
      ) : (
        <div className="ig-table-scroll">
          <table className={cx('ig-table', dense && 'ig-dense')} aria-label={ariaLabel ?? (typeof caption === 'string' ? caption : undefined)}>
            <thead>
              <tr>
                {visible.map((c) => {
                  const on = sort?.key === c.key;
                  const sortable = c.sortable !== false;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={c.align === 'right' ? 'ig-r' : undefined}
                      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {sortable ? (
                        <button type="button" className="ig-th-btn" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          <Icon name={on ? sort.dir : 'sort'} size={12} />
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((r, i) => (
                  <tr key={rowKey(r, i)}>
                    {visible.map((c) => {
                      const v = cellValue(c, r);
                      return (
                        <td key={c.key} className={c.align === 'right' ? 'ig-r' : undefined}>
                          {c.render ? c.render(r) : v == null || v === '' ? '—' : v}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visible.length}>
                    <EmptyState title={query ? 'Nenhum resultado para a pesquisa' : 'Nenhum registro'}>{query ? null : emptyMessage}</EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pageSize && state === 'ready' && filtered.length > pageSize ? (
        <nav className="ig-table-foot" aria-label="Paginação">
          <span className="ig-num">
            {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} de {filtered.length}
          </span>
          <span className="ig-row" style={{ gap: 8 }}>
            <Button size="sm" onClick={() => setPage(current - 1)} disabled={current === 0}>Anterior</Button>
            <span className="ig-num" aria-live="polite">Página {current + 1} de {pages}</span>
            <Button size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>Próxima</Button>
          </span>
        </nav>
      ) : null}
    </div>
  );
}
