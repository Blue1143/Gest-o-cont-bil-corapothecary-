import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABEL, formatDate, type RoleCode } from '@ccih/domain';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, FormMessage, LoadingState, StatusBadge, type Column } from '@ccih/ui';
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
      </span>
    ) } as Column<AdminUser>] : []),
  ];

  return (
    <div className="ig-stack" style={{ gap: 16 }}>
      <EditAvailability permissionLabel="Gerenciar usuários, perfis e escopos" allowed={session.can('users:manage')} />
      {saved ? <FormMessage tone="success">{saved}</FormMessage> : null}
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
    </div>
  );
}
