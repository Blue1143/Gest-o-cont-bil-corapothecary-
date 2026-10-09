import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL, formatDate, type RoleCode } from '@ccih/domain';
import { AlertBanner, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, FormMessage, LoadingState, StatusBadge, type Column } from '@ccih/ui';
import { useInstitution } from '../../data/source';
import type { AdminUser } from '../../data/port';
import { useSession } from '../auth/session';
import { EditAvailability, JustificationField, UnsavedChangesGuard, justificationError, useAdmin, useAdminMutation } from './shared';

interface Draft {
  roles: string[];
  scopeAll: boolean;
  sectorIds: string[];
  active: boolean;
  justification: string;
}

export function UsersPage() {
  const admin = useAdmin();
  const session = useSession();
  const institution = useInstitution();
  const users = useQuery({ queryKey: ['users'], enabled: !!admin, queryFn: () => admin!.users() });
  const roles = useQuery({ queryKey: ['roles'], enabled: !!admin, queryFn: () => admin!.roles() });
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [confirm, setConfirm] = useState<'save' | 'unlock' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const canManage = session.writable && session.can('users:manage');
  const save = useAdminMutation((d: { id: string; draft: Draft; rowVersion: number }) => admin!.patchUser(d.id, { ...d.draft, rowVersion: d.rowVersion }), ['users']);
  const unlock = useAdminMutation((id: string) => admin!.unlockUser(id), ['users']);
  const [creating, setCreating] = useState(false);
  const [temporary, setTemporary] = useState<{ login: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const reset = useAdminMutation((d: { id: string; justification: string }) => admin!.resetPassword(d.id, d.justification), ['users']);

  if (!admin) {
    return (
      <Card title="Usuários e perfis">
        <EmptyState title="Disponível com o backend">O gerenciamento de usuários, perfis e escopos por setor exige a API (VITE_DATA_SOURCE=api).</EmptyState>
      </Card>
    );
  }
  if (users.isPending || institution.isPending) return <LoadingState />;
  if (users.isError || institution.isError) return <ErrorState onRetry={() => void users.refetch()} />;
  const sectors = institution.data.data.sectors;
  const sectorName = (id: string) => sectors.find((s) => s.id === id)?.name ?? 'Setor fora do seu escopo';
  const roleName = (code: string) => ROLE_LABEL[code as RoleCode] ?? code;

  const open = (u: AdminUser) => {
    setSaved(null);
    setErrors({});
    setEditing(u);
    setDraft({ roles: [...u.roles], scopeAll: u.scopeAll, sectorIds: [...u.sectorIds], active: u.active, justification: '' });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const errs = {
      roles: draft.roles.length ? undefined : 'Selecione ao menos um perfil.',
      sectorIds: draft.scopeAll || draft.sectorIds.length ? undefined : 'Selecione ao menos um setor ou o acesso a todos.',
      justification: justificationError(draft.justification),
    };
    setErrors(errs);
    if (!Object.values(errs).some(Boolean)) setConfirm('save');
  };

  const columns: Column<AdminUser>[] = [
    { key: 'login', label: 'Usuário', render: (u) => <span><b className="ig-mono">{u.login}</b><br /><span className="ig-small ig-muted">{u.displayName}</span></span> },
    { key: 'roles', label: 'Perfis', value: (u) => u.roles.map(roleName).join(', ') },
    { key: 'scope', label: 'Escopo', value: (u) => (u.scopeAll ? 'Todos os setores' : u.sectorIds.map(sectorName).join(', ')) },
    { key: 'status', label: 'Situação', value: (u) => (u.lockedUntil ? 0 : u.active ? 2 : 1), render: (u) => (u.lockedUntil ? <StatusBadge status="crit">Bloqueado até {formatDate(u.lockedUntil, institution.data.data.config.timezone)}</StatusBadge> : u.active ? <StatusBadge status="ok">Ativo</StatusBadge> : <StatusBadge status="neutral">Inativo</StatusBadge>) },
    { key: 'lastLoginAt', label: 'Último acesso', render: (u) => formatDate(u.lastLoginAt, institution.data.data.config.timezone) },
    ...(canManage ? [{ key: 'action', label: 'Ações', sortable: false, exportable: false, render: (u: AdminUser) => (
      <span className="ig-row" style={{ gap: 6 }}>
        <Button size="sm" onClick={() => open(u)} aria-label={`Editar acesso de ${u.login}`}>Editar acesso</Button>
        {u.lockedUntil ? <Button size="sm" onClick={() => { setEditing(u); setConfirm('unlock'); }} aria-label={`Desbloquear ${u.login}`}>Desbloquear</Button> : null}
        {u.id !== session.info?.user.id ? <Button size="sm" variant="ghost" onClick={() => { setResetting(u); setResetReason(''); setResetError(null); }} aria-label={`Redefinir senha de ${u.login}`}>Redefinir senha</Button> : null}
      </span>
    ) } as Column<AdminUser>] : []),
  ];

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Gerenciar usuários, perfis e escopos" allowed={session.can('users:manage')} />
      {saved ? <FormMessage tone="success">{saved}</FormMessage> : null}
      {temporary ? (
        <AlertBanner tone="warn" title={`Senha temporária de ${temporary.login}: ${temporary.password}`} actions={<Button size="sm" onClick={() => setTemporary(null)}>Já entreguei a senha</Button>}>
          Entregue ao usuário por canal seguro. Ela não será exibida novamente, não fica no log e precisa ser trocada no primeiro acesso.
        </AlertBanner>
      ) : null}
      {canManage && !creating && !editing ? <div><Button icon="plus" onClick={() => { setCreating(true); setSaved(null); }}>Novo usuário</Button></div> : null}
      {creating ? <NewUserForm sectors={sectors} roles={roles.data?.roles ?? []} onDone={(r) => { setCreating(false); if (r) { setTemporary(r); setSaved(`Usuário ${r.login} criado.`); } }} /> : null}
      {editing && draft && confirm !== 'unlock' ? (
        <Card title={`Acesso de ${editing.login}`} subtitle="Alterar perfis ou escopo encerra as sessões abertas do usuário. O acesso a dados é sempre conferido no servidor.">
          <form className="ig-form" onSubmit={submit} noValidate>
            {save.formError ? <FormMessage tone="error">{save.formError}</FormMessage> : null}
            <fieldset className="ig-checks">
              <legend>Perfis *</legend>
              {(roles.data?.roles ?? []).map((r) => (
                <label key={r.code} title={r.permissions.length + ' permissões'}>
                  <input type="checkbox" checked={draft.roles.includes(r.code)} onChange={(e) => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles, r.code] : draft.roles.filter((x) => x !== r.code) })} />
                  {r.name}
                </label>
              ))}
            </fieldset>
            {errors.roles ?? save.fieldErrors.roles ? <p className="ig-field-error" role="alert">{errors.roles ?? save.fieldErrors.roles}</p> : null}
            <fieldset className="ig-checks">
              <legend>Escopo de dados *</legend>
              <label><input type="radio" name="scope" checked={draft.scopeAll} onChange={() => setDraft({ ...draft, scopeAll: true })} />Todos os setores</label>
              <label><input type="radio" name="scope" checked={!draft.scopeAll} onChange={() => setDraft({ ...draft, scopeAll: false })} />Setores selecionados</label>
            </fieldset>
            {!draft.scopeAll ? (
              <fieldset className="ig-checks">
                <legend>Setores</legend>
                {sectors.map((s) => (
                  <label key={s.id}>
                    <input type="checkbox" checked={draft.sectorIds.includes(s.id)} onChange={(e) => setDraft({ ...draft, sectorIds: e.target.checked ? [...draft.sectorIds, s.id] : draft.sectorIds.filter((x) => x !== s.id) })} />
                    {s.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {errors.sectorIds ?? save.fieldErrors.sectorIds ? <p className="ig-field-error" role="alert">{errors.sectorIds ?? save.fieldErrors.sectorIds}</p> : null}
            <fieldset className="ig-checks">
              <legend>Situação</legend>
              <label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Conta ativa</label>
            </fieldset>
            <JustificationField value={draft.justification} onChange={(v) => setDraft({ ...draft, justification: v })} error={errors.justification ?? save.fieldErrors.justification} />
            <div className="ig-form-actions">
              <Button type="submit" variant="primary">Salvar acesso</Button>
              <Button onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</Button>
            </div>
          </form>
          <UnsavedChangesGuard when={draft.justification !== ''} />
        </Card>
      ) : null}
      <DataTable caption="Usuários" columns={columns} rows={users.data.users} rowKey={(u) => u.id} searchable />
      <ConfirmDialog
        open={confirm === 'save'}
        title="Alterar o acesso do usuário?"
        confirmLabel="Salvar acesso"
        busy={save.mutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => editing && draft && save.mutation.mutate({ id: editing.id, draft: { ...draft, justification: draft.justification.trim() }, rowVersion: editing.rowVersion }, { onSettled: () => setConfirm(null), onSuccess: () => { setSaved(`Acesso de ${editing.login} atualizado. As sessões abertas foram encerradas.`); setEditing(null); setDraft(null); } })}
      >
        Perfis e escopo passam a valer imediatamente e as sessões abertas do usuário serão encerradas.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'unlock'}
        title={`Desbloquear ${editing?.login ?? ''}?`}
        confirmLabel="Desbloquear"
        busy={unlock.mutation.isPending}
        onCancel={() => { setConfirm(null); setEditing(null); }}
        onConfirm={() => editing && unlock.mutation.mutate(editing.id, { onSettled: () => { setConfirm(null); setEditing(null); }, onSuccess: () => setSaved('Conta desbloqueada.') })}
      >
        Confirme que a identidade do usuário foi verificada. O desbloqueio fica registrado no log de auditoria.
      </ConfirmDialog>
      <ConfirmDialog open={!!resetting} title={`Redefinir a senha de ${resetting?.login ?? ''}?`} confirmLabel="Gerar senha temporária" tone="danger" busy={reset.mutation.isPending}
        onCancel={() => setResetting(null)}
        onConfirm={() => {
          const e = justificationError(resetReason);
          if (e) { setResetError(e); return; }
          const u = resetting!;
          reset.mutation.mutate({ id: u.id, justification: resetReason.trim() }, { onSuccess: (r) => { setTemporary({ login: u.login, password: r.temporaryPassword }); setResetting(null); } });
        }}>
        <p style={{ marginTop: 0 }}>As sessões do usuário serão encerradas e ele deverá trocar a senha no próximo acesso. Confirme a identidade antes.</p>
        <Field label="Justificativa" required error={resetError ?? reset.formError}><textarea value={resetReason} onChange={(e) => setResetReason(e.target.value)} maxLength={500} /></Field>
      </ConfirmDialog>
    </div>
  );
}

function NewUserForm({ sectors, roles, onDone }: { sectors: Array<{ id: string; name: string }>; roles: Array<{ code: string; name: string }>; onDone: (r?: { login: string; password: string }) => void }) {
  const admin = useAdmin()!;
  const [d, setD] = useState({ login: '', displayName: '', roles: [] as string[], scopeAll: false, sectorIds: [] as string[], justification: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const create = useAdminMutation((input: typeof d) => admin.createUser(input), ['users']);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = {
      login: /^[a-z0-9._-]{3,60}$/.test(d.login.trim().toLowerCase()) ? undefined : 'Use 3 a 60 letras minúsculas, números, ponto, hífen ou sublinhado.',
      displayName: d.displayName.trim().length >= 3 ? undefined : 'Informe o nome de exibição.',
      roles: d.roles.length ? undefined : 'Selecione ao menos um perfil.',
      sectorIds: d.scopeAll || d.sectorIds.length ? undefined : 'Selecione ao menos um setor ou o acesso a todos.',
      justification: justificationError(d.justification),
    };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    const input = { ...d, login: d.login.trim().toLowerCase(), displayName: d.displayName.trim(), justification: d.justification.trim() };
    create.mutation.mutate(input, { onSuccess: (r) => onDone({ login: input.login, password: r.temporaryPassword }) });
  };
  const err = (k: string) => errors[k] ?? create.fieldErrors[k] ?? null;
  return (
    <Card title="Novo usuário" subtitle="O sistema gera uma senha temporária, exibida uma única vez; o usuário a troca no primeiro acesso.">
      <form className="ig-form" onSubmit={submit} noValidate>
        {create.formError ? <FormMessage tone="error">{create.formError}</FormMessage> : null}
        <div className="ig-form-row">
          <Field label="Login" required error={err('login')}><input value={d.login} onChange={(e) => setD({ ...d, login: e.target.value })} autoComplete="off" /></Field>
          <Field label="Nome de exibição" required error={err('displayName')}><input value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} /></Field>
        </div>
        <fieldset className="ig-checks">
          <legend>Perfis *</legend>
          {roles.map((r) => <label key={r.code}><input type="checkbox" checked={d.roles.includes(r.code)} onChange={(e) => setD({ ...d, roles: e.target.checked ? [...d.roles, r.code] : d.roles.filter((x) => x !== r.code) })} />{r.name}</label>)}
        </fieldset>
        {err('roles') ? <p className="ig-field-error" role="alert">{err('roles')}</p> : null}
        <fieldset className="ig-checks">
          <legend>Escopo de dados *</legend>
          <label><input type="radio" name="new-scope" checked={d.scopeAll} onChange={() => setD({ ...d, scopeAll: true })} />Todos os setores</label>
          <label><input type="radio" name="new-scope" checked={!d.scopeAll} onChange={() => setD({ ...d, scopeAll: false })} />Setores selecionados</label>
        </fieldset>
        {!d.scopeAll ? (
          <fieldset className="ig-checks">
            <legend>Setores</legend>
            {sectors.map((s) => <label key={s.id}><input type="checkbox" checked={d.sectorIds.includes(s.id)} onChange={(e) => setD({ ...d, sectorIds: e.target.checked ? [...d.sectorIds, s.id] : d.sectorIds.filter((x) => x !== s.id) })} />{s.name}</label>)}
          </fieldset>
        ) : null}
        {err('sectorIds') ? <p className="ig-field-error" role="alert">{err('sectorIds')}</p> : null}
        <JustificationField value={d.justification} onChange={(v) => setD({ ...d, justification: v })} error={err('justification') ?? undefined} />
        <div className="ig-form-actions">
          <Button type="submit" variant="primary" disabled={create.mutation.isPending}>Criar usuário</Button>
          <Button onClick={() => onDone()}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}
