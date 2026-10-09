import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorState } from '@ccih/ui';
import '@ccih/ui/styles.css';
import './app/app.css';
import { routes } from './app/routes';
import { createDataSource, DataSourceConfigError, DataSourceProvider } from './data/source';
import { SessionProvider } from './features/auth/session';
import type { CcihDataSource } from './data/port';

const root = createRoot(document.getElementById('root')!);

function renderApp(source: CcihDataSource) {
  const router = createBrowserRouter(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <DataSourceProvider source={source}>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

function renderConfigError(message: string) {
  root.render(
    <div className="ig-root" style={{ padding: 24 }}>
      <ErrorState title="Configuração incompleta">{message}</ErrorState>
    </div>,
  );
}

createDataSource()
  .then(renderApp)
  .catch((e: unknown) => renderConfigError(e instanceof DataSourceConfigError ? e.message : 'Falha ao iniciar a aplicação.'));
