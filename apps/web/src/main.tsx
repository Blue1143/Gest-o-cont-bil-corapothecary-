import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorState } from '@ccih/ui';
import '@ccih/ui/styles.css';
import './app/app.css';
import { routes } from './app/routes';
import { createDataSource, DataSourceConfigError, DataSourceProvider } from './data/source';
import type { CcihDataSource } from './data/port';

const router = createBrowserRouter(routes);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

let source: CcihDataSource | null = null;
let configError: string | null = null;
try {
  source = createDataSource();
} catch (e) {
  configError = e instanceof DataSourceConfigError ? e.message : 'Falha ao iniciar a aplicação.';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {source ? (
      <QueryClientProvider client={queryClient}>
        <DataSourceProvider source={source}>
          <RouterProvider router={router} />
        </DataSourceProvider>
      </QueryClientProvider>
    ) : (
      <div className="ig-root" style={{ padding: 24 }}>
        <ErrorState title="Configuração incompleta">{configError}</ErrorState>
      </div>
    )}
  </StrictMode>,
);
