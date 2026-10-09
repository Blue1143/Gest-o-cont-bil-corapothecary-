import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { evaluateBundle, evaluateTarget, surgicalRiskIndex, type BundleAnswer } from '@ccih/domain';
import { StatusBadge, InfectionTag, EnvironmentBanner } from './Basics';
import { DataTable, type Column } from './DataTable';
import { KpiCard } from './KpiCard';
import { TrendChart } from '../charts/TrendChart';
import { BarChart } from '../charts/BarChart';
import { BundleChecklist } from '../records/Management';
import { SurgeryRecord } from '../records/SurgeryRecord';
import { toCsv } from '../lib/util';

describe('status never relies on color alone', () => {
  it('renders the status word with its icon', () => {
    render(<StatusBadge status="crit" />);
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('gives infection tags an accessible full name', () => {
    render(<InfectionTag type="PAV" />);
    expect(screen.getByText('Pneumonia associada à ventilação mecânica')).toBeInTheDocument();
  });

  it('marks the demo environment', () => {
    render(<EnvironmentBanner />);
    expect(screen.getByRole('note')).toHaveTextContent(/ambiente de demonstração/i);
  });
});

type Row = { id: string; setor: string; casos: number };
const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), setor: i % 2 ? 'UTI Adulto' : 'Clínica Médica', casos: i }));
const cols: Column<Row>[] = [
  { key: 'setor', label: 'Setor' },
  { key: 'casos', label: 'Casos', align: 'right' },
];

describe('DataTable', () => {
  it('searches, sorts and paginates', async () => {
    const user = userEvent.setup();
    render(<DataTable caption="Casos" columns={cols} rows={rows} rowKey={(r) => r.id} searchable pageSize={5} />);
    expect(screen.getByText('1–5 de 12')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'uti');
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5 rows (first page of 6 matches)
    await user.click(screen.getByRole('button', { name: /Casos/ }));
    await user.click(screen.getByRole('button', { name: /Casos/ }));
    expect(screen.getByRole('columnheader', { name: /Casos/ })).toHaveAttribute('aria-sort', 'descending');
    expect(within(screen.getAllByRole('row')[1]!).getByText('11')).toBeInTheDocument();
  });

  it('shows empty, loading and error states', () => {
    const { rerender } = render(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} emptyMessage="Sem casos." />);
    expect(screen.getByText('Sem casos.')).toBeInTheDocument();
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} state="loading" />);
    expect(screen.getByText('Carregando dados…')).toBeInTheDocument();
    const retry = vi.fn();
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.id} state="error" onRetry={retry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hands visible columns and filtered rows to the export handler', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<DataTable caption="Casos" columns={cols} rows={rows} rowKey={(r) => r.id} columnPicker onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    await user.click(screen.getByRole('checkbox', { name: 'Casos' }));
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(onExport.mock.calls[0]![0].map((c: Column<Row>) => c.key)).toEqual(['setor']);
    expect(onExport.mock.calls[0]![1]).toHaveLength(12);
  });
});

describe('KpiCard', () => {
  it('states when no target is configured and flags demo targets', () => {
    const { rerender } = render(<KpiCard label="IPCS" value={2.4} />);
    expect(screen.getByText('Sem meta configurada')).toBeInTheDocument();
    const target = { indicatorId: 'di-ipcs', value: 2, direction: 'lower' as const, origin: 'demonstracao' as const, approvedBy: null, validFrom: '2026-01-01', referenceId: null };
    rerender(<KpiCard label="IPCS" value={2.4} target={target} evaluation={evaluateTarget(2.4, target)} trend={{ delta: 0.6, improved: false }} />);
    expect(screen.getByText('Fora da meta')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByLabelText(/piora/)).toBeInTheDocument();
  });
});

describe('charts', () => {
  it('TrendChart announces the focused period by keyboard and toggles to a table', async () => {
    const user = userEvent.setup();
    render(<TrendChart title="Densidade IPCS" labels={['ago/26', 'set/26']} series={[{ name: 'IPCS', values: [1.8, 2.4] }]} unit="‰" />);
    screen.getByRole('group', { name: /Densidade IPCS/ }).focus();
    await user.keyboard('{End}');
    expect(screen.getByText(/set\/26: IPCS 2,4 ‰/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Visualizar tabela' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('TrendChart shows an empty state without values', () => {
    render(<TrendChart title="Vazio" labels={['set/26']} series={[{ name: 'IPCS', values: [null] }]} />);
    expect(screen.getByText('Não há dados para os filtros selecionados.')).toBeInTheDocument();
  });

  it('BarChart bars are keyboard-focusable with an accessible value', async () => {
    const user = userEvent.setup();
    render(<BarChart title="IRAS por tipo" data={[{ key: 'a', label: 'PAV', value: 41 }, { key: 'b', label: 'IPCS', value: 27 }]} decimals={0} unit="casos" />);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toHaveAttribute('aria-label', 'PAV: 41 casos');
  });
});

describe('BundleChecklist', () => {
  const items = [{ id: '1', text: 'Higiene das mãos' }, { id: '2', text: 'Barreira máxima' }];

  it('is truly read-only without onAnswer (audit M-03)', () => {
    const answers: BundleAnswer[] = ['conforme', 'nao_conforme'];
    render(<BundleChecklist title="CVC" items={items} answers={answers} evaluation={evaluateBundle(answers, 'tudo_ou_nada')} method="tudo_ou_nada" />);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByText('Não conforme — 1 item')).toBeInTheDocument();
  });

  it('reports answers through onAnswer', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const answers: BundleAnswer[] = [null, null];
    render(<BundleChecklist title="CVC" items={items} answers={answers} evaluation={evaluateBundle(answers, 'tudo_ou_nada')} method="tudo_ou_nada" onAnswer={onAnswer} />);
    await user.click(within(screen.getByRole('group', { name: 'Barreira máxima' })).getByRole('button', { name: 'Não conforme' }));
    expect(onAnswer).toHaveBeenCalledWith(1, 'nao_conforme');
  });
});

describe('SurgeryRecord', () => {
  it('shows an incomplete risk index and missing surveillance rule', () => {
    render(<SurgeryRecord procedure="Hernioplastia" date="2026-10-02" risk={surgicalRiskIndex({ woundClass: 'limpa' })} surveillance={null} />);
    expect(screen.getByText(/Incompleto: falta ASA, duração ou P75/)).toBeInTheDocument();
    expect(screen.getAllByText(/não configurad/).length).toBeGreaterThan(0);
  });
});

describe('toCsv', () => {
  it('escapes separators and neutralizes formula injection', () => {
    const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'x;y']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"x;y"');
    expect(csv.startsWith('﻿')).toBe(true);
  });
});
