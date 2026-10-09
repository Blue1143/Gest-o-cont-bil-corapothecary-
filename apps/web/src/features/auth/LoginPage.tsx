import { useId, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, FormMessage, Icon } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import { ApiError } from '../../data/api/http';
import { useSession } from './session';

const REASON: Record<string, string> = {
  inatividade: 'Sua sessão foi encerrada por inatividade. Entre novamente.',
  saida: 'Você saiu do sistema.',
  expirada: 'Sua sessão expirou. Entre novamente.',
};

/** Only same-app relative paths are accepted as return targets (no open redirect). */
export function safeReturnPath(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}

export function LoginPage() {
  const source = useDataSource();
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const target = safeReturnPath(params.get('voltar'));

  if (session.status === 'demo' || session.status === 'authenticated') return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (login.trim().length < 3) next.login = 'Informe o usuário.';
    if (!password) next.password = 'Informe a senha.';
    setErrors(next);
    if (Object.keys(next).length || !source.auth) return;
    setBusy(true);
    try {
      await source.auth.login(login.trim().toLowerCase(), password);
      setPassword('');
      await session.refresh();
      navigate(target, { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.' });
    } finally {
      setBusy(false);
    }
  };

  const reason = params.get('motivo');
  return (
    <div className="login ig-root">
      <main className="login-card" aria-labelledby={`${formId}-title`}>
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true"><Icon name="shield" size={20} /></span>
          <div>
            <p className="brand-name">CCIH Integra</p>
            <p className="ig-small ig-muted" style={{ margin: 0 }}>Gestão integrada da CCIH/SCIRAS</p>
          </div>
        </div>
        <h1 id={`${formId}-title`} className="ig-card-title" style={{ fontSize: 20 }}>Entrar</h1>
        {reason && REASON[reason] ? <FormMessage tone="success">{REASON[reason]}</FormMessage> : null}
        {errors.form ? <FormMessage tone="error">{errors.form}</FormMessage> : null}
        <form className="ig-form" onSubmit={submit} noValidate>
          <Field label="Usuário" required error={errors.login ?? null}>
            <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} />
          </Field>
          <Field label="Senha" required error={errors.password ?? null}>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
        </form>
        <p className="ig-small ig-muted" style={{ margin: 0 }}>
          Acesso restrito a profissionais autorizados. Os acessos e as alterações são registrados no log de auditoria (LGPD).
        </p>
      </main>
    </div>
  );
}
