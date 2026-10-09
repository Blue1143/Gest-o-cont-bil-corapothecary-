import { useEffect, useRef, useState } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const cssVar = (token: string): string => `var(--${token})`;

/** Tracks an element's width; falls back to `initial` before layout and in tests. */
export function useElementWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth) setWidth(el.clientWidth);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface NiceScale {
  top: number;
  ticks: number[];
  step: number;
}

export function niceScale(max: number, count = 4): NiceScale {
  const m = max > 0 ? max : 1;
  const raw = m / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const top = step * Math.ceil(m / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(Number(v.toFixed(6)));
  return { top, ticks, step };
}

/** CSV with `;` separator and BOM (opens correctly in pt-BR spreadsheets); cells are escaped. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    // Neutralize spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}
