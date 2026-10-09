import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@ccih/ui';

interface Props {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. on navigation). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Catches render errors; the user sees a plain message, never a stack trace. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 2 sends this to the API's structured log (without patient data).
    console.error('[ccih-integra] erro de interface', error.name, info.componentStack?.split('\n')[1]?.trim());
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="ig-card" style={{ margin: 24 }}>
          <ErrorState title="Algo deu errado nesta tela" onRetry={() => this.setState({ error: null })}>
            Os dados não foram alterados. Tente novamente; se o erro continuar, informe o suporte com o horário do ocorrido.
          </ErrorState>
        </div>
      );
    }
    return this.props.children;
  }
}
