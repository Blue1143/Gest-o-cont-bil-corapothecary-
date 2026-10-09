import { cloneElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { Button } from './Basics';

/* ---------- Field ---------- */

export interface FieldProps {
  label: string;
  /** Contextual help shown under the label. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** A single input element; id, aria-describedby, aria-invalid and required are wired automatically. */
  children: ReactElement<Record<string, unknown>>;
}

/** Labelled field with help text and pt-BR error, accessible by construction. */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="ig-field">
      <label htmlFor={id} className="ig-field-label">
        {label}
        {required ? <span className="ig-required" aria-hidden="true"> *</span> : <span className="ig-optional"> (opcional)</span>}
      </label>
      {hint ? <p id={hintId} className="ig-field-hint">{hint}</p> : null}
      {cloneElement(children, {
        id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {error ? <p id={errorId} className="ig-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

/* ---------- FormError summary ---------- */

export function FormMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <p className={tone === 'error' ? 'ig-form-msg ig-form-msg-error' : 'ig-form-msg ig-form-msg-ok'} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/* ---------- ConfirmDialog ---------- */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for critical actions, on the native <dialog> (focus trap, Esc to cancel,
 * focus returns to the trigger).
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d || typeof d.showModal !== 'function') return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ig-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id={titleId} className="ig-card-title">{title}</h2>
      <div className="ig-dialog-body">{children}</div>
      <div className="ig-dialog-actions">
        <Button onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : confirmLabel}</Button>
      </div>
    </dialog>
  );
}

/* ---------- Tabs as navigation ---------- */

export interface SubNavItem {
  key: string;
  label: string;
  active: boolean;
  href: string;
}

/** Secondary navigation (links, not ARIA tabs: each section has its own URL). */
export function SubNav({ label, items, renderLink }: { label: string; items: SubNavItem[]; renderLink: (item: SubNavItem, className: string) => ReactNode }) {
  return (
    <nav className="ig-subnav" aria-label={label}>
      <ul>
        {items.map((it) => (
          <li key={it.key}>{renderLink(it, it.active ? 'ig-subnav-link active' : 'ig-subnav-link')}</li>
        ))}
      </ul>
    </nav>
  );
}
