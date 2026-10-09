import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IRAS_TYPES, STATUS_LABEL, type IrasType, type Status } from '@ccih/domain';
import { cx, cssVar } from '../lib/util';
import { Icon, type IconName } from './Icon';

/* ---------- Button ---------- */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'secondary' | 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx('ig-btn', variant !== 'secondary' && `ig-btn-${variant}`, size === 'sm' && 'ig-btn-sm', className)}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ---------- StatusBadge ---------- */

export interface StatusBadgeProps {
  status?: Status;
  children?: ReactNode;
  className?: string;
}

/** The only way to show a status: icon + word, never color alone. */
export function StatusBadge({ status = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span className={cx('ig-badge', `ig-tone-${status}`, className)}>
      <Icon name={status} size={13} weight={2.5} />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

/* ---------- InfectionTag ---------- */

export interface InfectionTagProps {
  type: IrasType;
  showName?: boolean;
}

export function InfectionTag({ type, showName }: InfectionTagProps) {
  const info = IRAS_TYPES[type];
  return (
    <span className="ig-iras" title={info.name}>
      <i className="ig-iras-dot" style={{ background: cssVar(info.token) }} aria-hidden="true" />
      <b>{info.sigla}</b>
      {showName ? <span>{info.name}</span> : <span className="ig-sr-only">{info.name}</span>}
    </span>
  );
}

/* ---------- ProvenanceTag ---------- */

export type ProvenanceKind = 'demo' | 'meta_institucional' | 'meta_demo' | 'parametro' | 'referencia' | 'requer_validacao';

const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  demo: 'Dado de demonstração',
  meta_institucional: 'Meta institucional',
  meta_demo: 'Meta de demonstração',
  parametro: 'Parâmetro configurável',
  referencia: 'Referência regulatória',
  requer_validacao: 'Requer validação institucional',
};

/** Distinguishes demo data, institutional targets, configurable parameters and references. */
export function ProvenanceTag({ kind, children, title }: { kind: ProvenanceKind; children?: ReactNode; title?: string }) {
  const cls = kind === 'demo' || kind === 'meta_demo' ? 'ig-prov-demo' : kind === 'requer_validacao' ? 'ig-prov-validacao' : null;
  return (
    <span className={cx('ig-prov', cls)} title={title}>
      {children ?? PROVENANCE_LABEL[kind]}
    </span>
  );
}

/* ---------- AlertBanner ---------- */

export interface AlertBannerProps {
  tone?: 'info' | 'ok' | 'warn' | 'crit';
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export function AlertBanner({ tone = 'info', title, children, actions }: AlertBannerProps) {
  return (
    <div className={cx('ig-alert', `ig-tone-${tone}`)} role={tone === 'crit' ? 'alert' : 'status'}>
      <Icon name={tone} size={18} />
      <div className="ig-alert-body">
        {title ? <p className="ig-alert-title">{title}</p> : null}
        {children ? <p className="ig-alert-text">{children}</p> : null}
        {actions ? <div className="ig-alert-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ---------- EnvironmentBanner ---------- */

/** Permanent strip shown whenever the data source is synthetic. Not dismissible by design. */
export function EnvironmentBanner({ children = 'Ambiente de demonstração — dados sintéticos, sem pacientes reais' }: { children?: ReactNode }) {
  return (
    <div className="ig-env" role="note">
      <Icon name="warn" size={14} weight={2.5} />
      <span>{children}</span>
    </div>
  );
}

/* ---------- Card ---------- */

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  as?: 'section' | 'article' | 'div';
  className?: string;
  headingLevel?: 2 | 3;
}

export function Card({ title, subtitle, actions, footer, children, as: Tag = 'section', className, headingLevel = 3 }: CardProps) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Tag className={cx('ig-card', className)}>
      {title || actions ? (
        <div className="ig-card-head">
          <div>
            {title ? <H className="ig-card-title">{title}</H> : null}
            {subtitle ? <p className="ig-card-sub">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
      {footer ? <p className="ig-card-foot">{footer}</p> : null}
    </Tag>
  );
}

/* ---------- State views ---------- */

export function EmptyState({ title = 'Nenhum dado no período', children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ig-state" role="status">
      <Icon name="neutral" size={20} />
      <p className="ig-state-title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function LoadingState({ label = 'Carregando dados…', lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="ig-sr-only">{label}</span>
      <div className="ig-stack" style={{ gap: 8 }}>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ig-skeleton" style={{ height: 14, width: `${90 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Não foi possível carregar os dados', children, onRetry }: { title?: ReactNode; children?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="ig-state" role="alert">
      <span style={{ color: 'var(--crit)' }}>
        <Icon name="crit" size={20} />
      </span>
      <p className="ig-state-title">{title}</p>
      <p>{children ?? 'Tente novamente. Se o problema continuar, acione o suporte de TI informando o horário.'}</p>
      {onRetry ? (
        <Button size="sm" icon="refresh" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
