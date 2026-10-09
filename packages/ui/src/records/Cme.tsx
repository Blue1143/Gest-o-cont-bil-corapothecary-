import type { ReactNode } from 'react';
import { LOAD_STATUS_LABEL, TEST_TYPE_LABEL, formatDate, type LoadReleaseEvaluation, type LoadStatus, type SterilizationTestType, type Status, type TestResult } from '@ccih/domain';
import { cx } from '../lib/util';
import { StatusBadge } from '../components/Basics';
import { Icon } from '../components/Icon';

/* ---------- SterilizationCycle ---------- */

export interface CycleTest {
  id: string;
  type: SterilizationTestType;
  detail?: string;
  result: TestResult;
}

export interface SterilizationCycleProps {
  equipment: string;
  cycle: string;
  startedAt?: string;
  program?: string;
  parameters?: Array<{ name: string; value: string }>;
  tests: CycleTest[];
  equipmentBowieDick?: TestResult;
  release: LoadReleaseEvaluation;
  items?: number;
  hasImplant?: boolean;
  operator?: string;
  actions?: ReactNode;
  /** IANA zone for dates (the institution's). */
  timeZone?: string;
  /** Badge text when the load's own status is shown elsewhere (the badge then describes the policy evaluation). */
  releaseLabel?: string;
}

const TEST_RESULT: Record<TestResult, [Status, string]> = { aprovado: ['ok', 'Aprovado'], reprovado: ['crit', 'Reprovado'], pendente: ['warn', 'Em leitura'] };
export const LOAD_TONE: Record<LoadStatus, Status> = { liberada: 'ok', aguardando: 'warn', retida: 'warn', rejeitada: 'crit', reprocessamento: 'crit' };

export function SterilizationCycle(p: SterilizationCycleProps) {
  const tone = p.release.policyApplied ? LOAD_TONE[p.release.status] : 'neutral';
  return (
    <article className="ig-card" aria-label={`Ciclo ${p.cycle}`}>
      <div className="ig-rec-head">
        <div>
          <span className="ig-label">Ciclo de esterilização</span>
          <h3 className="ig-rec-name">{p.equipment}</h3>
          <div className="ig-row" style={{ marginTop: 4 }}>
            <span className="ig-mono">Ciclo {p.cycle}</span>
            <span className="ig-muted ig-small">{[formatDate(p.startedAt, p.timeZone), p.program].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <StatusBadge status={tone}>{p.releaseLabel ?? `Carga ${LOAD_STATUS_LABEL[p.release.status].toLowerCase()}`}</StatusBadge>
      </div>
      {p.release.reasons.length ? (
        <ul className="ig-card-sub" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {p.release.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
      {p.parameters?.length ? (
        <dl className="ig-facts">
          {p.parameters.map((q) => <div key={q.name}><dt>{q.name}</dt><dd className="ig-num">{q.value}</dd></div>)}
        </dl>
      ) : null}
      <div className="ig-section">
        <span className="ig-label">Testes e indicadores</span>
        <div className="ig-tests">
          {p.equipmentBowieDick ? (
            <div className="ig-test">
              <span className="ig-test-name">{TEST_TYPE_LABEL.BOWIE_DICK}</span>
              <span className="ig-muted ig-small">Teste diário do equipamento</span>
              <span><StatusBadge status={TEST_RESULT[p.equipmentBowieDick][0]}>{TEST_RESULT[p.equipmentBowieDick][1]}</StatusBadge></span>
            </div>
          ) : null}
          {p.tests.map((t) => (
            <div key={t.id} className="ig-test">
              <span className="ig-test-name">{TEST_TYPE_LABEL[t.type]}</span>
              {t.detail ? <span className="ig-muted ig-small">{t.detail}</span> : null}
              <span><StatusBadge status={TEST_RESULT[t.result][0]}>{TEST_RESULT[t.result][1]}</StatusBadge></span>
            </div>
          ))}
        </div>
      </div>
      <div className="ig-section ig-row" style={{ justifyContent: 'space-between' }}>
        <span className="ig-small ig-muted">
          {[p.items != null ? `${p.items} itens na carga` : null, p.hasImplant ? 'contém implantável' : null, p.operator ? `Operador: ${p.operator}` : null].filter(Boolean).join(' · ')}
        </span>
        {p.actions}
      </div>
    </article>
  );
}

/* ---------- TraceTimeline ---------- */

export interface TraceStep {
  id: string;
  title: string;
  at?: string;
  responsible?: string;
  detail?: ReactNode;
  status: Extract<Status, 'ok' | 'warn' | 'crit' | 'neutral' | 'info'>;
}

export interface TraceTimelineProps {
  heading: string;
  subtitle?: ReactNode;
  steps: TraceStep[];
  timeZone?: string;
}

export function traceSummary(steps: TraceStep[]): { status: Status; label: string } {
  if (steps.some((s) => s.status === 'crit')) return { status: 'crit', label: 'Quebra na cadeia' };
  if (steps.some((s) => s.status === 'warn' || s.status === 'neutral')) return { status: 'warn', label: 'Elo pendente' };
  return { status: 'ok', label: 'Rastreabilidade completa' };
}

const STEP_NOTE: Partial<Record<TraceStep['status'], string>> = {
  crit: 'Não conformidade registrada nesta etapa.',
  warn: 'Etapa com pendência.',
  neutral: 'Etapa ainda não realizada.',
};

export function TraceTimeline({ heading, subtitle, steps, timeZone }: TraceTimelineProps) {
  const summary = traceSummary(steps);
  return (
    <article className="ig-card" aria-label={heading}>
      <div className="ig-rec-head" style={{ marginBottom: 16 }}>
        <div>
          <span className="ig-label">Rastreabilidade</span>
          <h3 className="ig-card-title" style={{ fontSize: 18 }}>{heading}</h3>
          {subtitle ? <div className="ig-row" style={{ marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        <StatusBadge status={summary.status}>{summary.label}</StatusBadge>
      </div>
      <ol className="ig-tl">
        {steps.map((s) => (
          <li key={s.id}>
            <span className={cx('ig-tl-dot', `ig-tone-${s.status}`)} aria-hidden="true">
              {s.status === 'neutral' ? null : <Icon name={s.status} size={14} weight={2.5} />}
            </span>
            <div>
              <div className="ig-tl-step">
                <b>{s.title}</b>
                <span className="ig-small ig-muted ig-num">{s.at ? formatDate(s.at, timeZone) : 'Não registrado'}</span>
              </div>
              {s.detail || s.responsible ? (
                <div className="ig-small ig-muted">
                  {s.detail}
                  {s.detail && s.responsible ? ' · ' : ''}
                  {s.responsible ? `Resp.: ${s.responsible}` : ''}
                </div>
              ) : null}
              {STEP_NOTE[s.status] ? <span className="ig-small" style={{ color: 'var(--ink)' }}>{STEP_NOTE[s.status]}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
