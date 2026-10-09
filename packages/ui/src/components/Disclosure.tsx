import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface DisclosureProps {
  title: string;
  /** Short status line shown while collapsed (e.g. "2 fora da meta"). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Native <details> section (keyboard and screen-reader support built in) for progressive disclosure. */
export function Disclosure({ title, summary, defaultOpen = true, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="ig-disclosure" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="ig-disclosure-chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
        <span className="ig-disclosure-title">{title}</span>
        {summary ? <span className="ig-disclosure-summary">{summary}</span> : null}
      </summary>
      <div className="ig-disclosure-body">{children}</div>
    </details>
  );
}
