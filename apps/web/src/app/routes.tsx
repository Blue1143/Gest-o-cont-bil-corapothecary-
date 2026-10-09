import { lazy, Suspense, type ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { LoadingState } from '@ccih/ui';
import { AppShell } from './AppShell';
import { ALL_NAV_ITEMS } from './navigation';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotFoundPage, PlannedModulePage } from '../features/modules/PlannedModulePage';

const IndicatorsPage = lazy(() => import('../features/indicators/IndicatorsPage').then((m) => ({ default: m.IndicatorsPage })));
const AdminPage = lazy(() => import('../features/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

const page = (el: ReactElement) => <Suspense fallback={<div className="page"><LoadingState /></div>}>{el}</Suspense>;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'indicadores', element: page(<IndicatorsPage />) },
      { path: 'admin', element: page(<AdminPage />) },
      ...ALL_NAV_ITEMS.filter((i) => i.phase != null).map((item) => ({ path: item.path.slice(1), element: <PlannedModulePage item={item} /> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
