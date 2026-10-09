import { useEffect, useRef, useState } from 'react';
import { AlertBanner, Button } from '@ccih/ui';
import { useSession } from './session';

const WARN_BEFORE_MS = 2 * 60_000;
const KEEPALIVE_MS = 5 * 60_000;

/**
 * Session timeout on the client side of the server rule: warns two minutes before the idle
 * limit, keeps the server session alive while the user is actually working, and logs out when
 * the limit is reached.
 */
export function IdleWarning() {
  const session = useSession();
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [warning, setWarning] = useState<number | null>(null);
  const idleMs = (session.info?.session.idleMinutes ?? 0) * 60_000;
  const { refresh, logout, status } = session;

  useEffect(() => {
    if (status !== 'authenticated' || !idleMs) return;
    const mark = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = window.setInterval(() => {
      const now = Date.now();
      const inactive = now - lastActivity.current;
      if (inactive >= idleMs) {
        void logout('inatividade');
        return;
      }
      setWarning(inactive >= idleMs - WARN_BEFORE_MS ? Math.ceil((idleMs - inactive) / 1000) : null);
      if (inactive < KEEPALIVE_MS && now - lastPing.current > KEEPALIVE_MS) {
        lastPing.current = now;
        void refresh();
      }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(timer);
    };
  }, [status, idleMs, refresh, logout]);

  if (warning == null) return null;
  return (
    <div style={{ padding: '8px 24px 0' }}>
      <AlertBanner
        tone="warn"
        title={`Sua sessão será encerrada por inatividade em cerca de ${Math.max(1, Math.round(warning / 60))} minuto(s).`}
        actions={<Button size="sm" variant="primary" onClick={() => { lastActivity.current = Date.now(); lastPing.current = Date.now(); setWarning(null); void refresh(); }}>Continuar conectado</Button>}
      >
        Dados não salvos em formulários podem ser perdidos.
      </AlertBanner>
    </div>
  );
}
