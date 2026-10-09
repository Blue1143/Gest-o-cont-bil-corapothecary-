import { lazy, Suspense, type ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { Permission } from '@ccih/domain';
import { LoadingState } from '@ccih/ui';
import { AppShell } from './AppShell';
import { ALL_NAV_ITEMS } from './navigation';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotFoundPage, PlannedModulePage } from '../features/modules/PlannedModulePage';
import { LoginPage } from '../features/auth/LoginPage';
import { Guard, HomeRoute, RequireSession } from '../features/auth/guards';

const named = <K extends string>(load: () => Promise<Record<K, () => ReactElement | null>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const IndicatorsPage = named(() => import('../features/indicators/IndicatorsPage'), 'IndicatorsPage');
const AdminLayout = named(() => import('../features/admin/AdminLayout'), 'AdminLayout');
const AdminIndex = named(() => import('../features/admin/AdminLayout'), 'AdminIndex');
const TargetsPage = named(() => import('../features/admin/TargetsPage'), 'TargetsPage');
const ParametersPage = named(() => import('../features/admin/ParametersPage'), 'ParametersPage');
const ReferencesPage = named(() => import('../features/admin/ReferencesPage'), 'ReferencesPage');
const CmePolicyPage = named(() => import('../features/admin/CmePolicyPage'), 'CmePolicyPage');
const UsersPage = named(() => import('../features/admin/UsersPage'), 'UsersPage');
const AuditPage = named(() => import('../features/admin/AuditPage'), 'AuditPage');

const page = (el: ReactElement) => <Suspense fallback={<div className="page"><LoadingState /></div>}>{el}</Suspense>;
const guarded = (anyOf: Permission[], el: ReactElement) => <Guard anyOf={anyOf}>{page(el)}</Guard>;

export const routes: RouteObject[] = [
  { path: '/entrar', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireSession><AppShell /></RequireSession>,
    children: [
      { index: true, element: <HomeRoute dashboard={<DashboardPage />} /> },
      { path: 'indicadores', element: guarded(['indicators:view'], <IndicatorsPage />) },
      {
        path: 'admin',
        element: guarded(['config:view', 'users:view', 'audit:view'], <AdminLayout />),
        children: [
          { index: true, element: page(<AdminIndex />) },
          { path: 'metas', element: guarded(['config:view'], <TargetsPage />) },
          { path: 'parametros', element: guarded(['config:view'], <ParametersPage />) },
          { path: 'referencias', element: guarded(['config:view'], <ReferencesPage />) },
          { path: 'cme', element: guarded(['config:view'], <CmePolicyPage />) },
          { path: 'usuarios', element: guarded(['users:view'], <UsersPage />) },
          { path: 'auditoria', element: guarded(['audit:view'], <AuditPage />) },
        ],
      },
      ...ALL_NAV_ITEMS.filter((i) => i.phase != null).map((item) => ({ path: item.path.slice(1), element: <Guard anyOf={item.permissions}><PlannedModulePage item={item} /></Guard> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
