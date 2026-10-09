import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '@ccih/domain';
import { SubNav } from '@ccih/ui';
import { useSession } from '../auth/session';

export const ADMIN_SECTIONS: Array<{ key: string; label: string; path: string; permission: Permission }> = [
  { key: 'metas', label: 'Metas', path: '/admin/metas', permission: 'config:view' },
  { key: 'parametros', label: 'Parâmetros', path: '/admin/parametros', permission: 'config:view' },
  { key: 'referencias', label: 'Referências', path: '/admin/referencias', permission: 'config:view' },
  { key: 'cme', label: 'Política da CME', path: '/admin/cme', permission: 'config:view' },
  { key: 'usuarios', label: 'Usuários e perfis', path: '/admin/usuarios', permission: 'users:view' },
  { key: 'auditoria', label: 'Log de auditoria', path: '/admin/auditoria', permission: 'audit:view' },
];

export function AdminLayout() {
  const session = useSession();
  const { pathname } = useLocation();
  const sections = ADMIN_SECTIONS.filter((s) => session.can(s.permission));
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Administração</h1>
          <p className="page-sub">Configuração institucional, acessos e trilha de auditoria. Toda alteração exige justificativa e fica registrada.</p>
        </div>
      </header>
      <SubNav
        label="Seções da administração"
        items={sections.map((s) => ({ key: s.key, label: s.label, href: s.path, active: pathname.startsWith(s.path) }))}
        renderLink={(item, className) => <Link to={item.href} className={className} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>}
      />
      <Outlet />
    </div>
  );
}

export function AdminIndex() {
  const session = useSession();
  const first = ADMIN_SECTIONS.find((s) => session.can(s.permission));
  return first ? <Navigate to={first.path} replace /> : null;
}
