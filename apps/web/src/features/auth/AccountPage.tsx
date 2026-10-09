import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABEL, type RoleCode } from '@ccih/domain';
import { AlertBanner, Button, Card, Field, FormMessage } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import { ApiError } from '../../data/api/http';
import { useSession } from './session';

/** Same policy as the server (the server is authoritative). */
export function passwordHint(password: string, login: string): string | null {
  if (password.length < 12) return 'A senha deve ter ao menos 12 caracteres.';
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length < 3) return 'Use ao menos três tipos de caractere: minúsculas, maiúsculas, números e símbolos.';
  if (login && password.toLowerCase().includes(login.toLowerCase())) return 'A senha não pode conter o nome de usuário.';
  return null;
}

export function AccountPage() {
  const source = useDataSource();
  const session = useSession();
  const navigate = useNavigate();
  const [d, setD] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [released, setReleased] = useState(false);
  const info = session.info;
  // Leave only after the refreshed session no longer requires the change (otherwise the guard sends us back).
  useEffect(() => { if (released && info && !info.mustChangePassword) navigate('/', { replace: true }); }, [released, info, navigate]);
  if (!source.auth || !info) return <div className="page"><Card title="Minha conta"><p>Disponível com o backend.</p></Card></div>;
  const forced = !!info.mustChangePassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = {
      current: d.current ? undefined : 'Informe a senha atual.',
      next: passwordHint(d.next, info.user.login) ?? (d.next === d.current ? 'A nova senha deve ser diferente da atual.' : undefined),
      confirm: d.confirm === d.next ? undefined : 'A confirmação não confere.',
    };
    setErrors(errs);
    setFormError(null);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await source.auth!.changePassword(d.current, d.next);
      setD({ current: '', next: '', confirm: '' });
      setDone(true);
      await session.refresh();
      if (forced) setReleased(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        setErrors(Object.fromEntries(err.fields.map((f) => [f.path === 'currentPassword' ? 'current' : f.path === 'newPassword' ? 'next' : f.path, f.message])));
      } else setFormError('Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head"><div><h1 className="page-title">Minha conta</h1><p className="page-sub">{info.user.displayName} · {info.user.login} · {info.roles.map((r) => ROLE_LABEL[r as RoleCode] ?? r).join(', ')}</p></div></header>
      {forced ? <AlertBanner tone="warn" title="Troque sua senha para continuar">Sua senha é temporária ou venceu. O acesso ao sistema é liberado depois da troca.</AlertBanner> : null}
      <Card title="Trocar senha" subtitle="Ao trocar, as suas outras sessões abertas são encerradas.">
        <form className="ig-form" onSubmit={(e) => void submit(e)} noValidate>
          {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
          {done ? <FormMessage tone="success">Senha alterada.</FormMessage> : null}
          <Field label="Senha atual" required error={errors.current ?? null}><input type="password" autoComplete="current-password" value={d.current} onChange={(e) => setD({ ...d, current: e.target.value })} /></Field>
          <Field label="Nova senha" required hint="Ao menos 12 caracteres e três tipos: minúsculas, maiúsculas, números e símbolos. Não use o nome de usuário." error={errors.next ?? null}>
            <input type="password" autoComplete="new-password" value={d.next} onChange={(e) => setD({ ...d, next: e.target.value })} />
          </Field>
          <Field label="Confirme a nova senha" required error={errors.confirm ?? null}><input type="password" autoComplete="new-password" value={d.confirm} onChange={(e) => setD({ ...d, confirm: e.target.value })} /></Field>
          <div className="ig-form-actions"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Salvando…' : 'Trocar senha'}</Button></div>
        </form>
      </Card>
    </div>
  );
}
