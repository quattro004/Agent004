import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional render-prop for the fallback UI; receives the caught error. */
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary for the CRT app.
 *
 * Constitution P8 ("Failure modes") forbids a white screen or silent failure.
 * When a render-time error escapes a child component, this boundary shows
 * an in-character "Signal interrupted" overlay instead of unmounting React.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the dev console; in production this also lands in
    // browser/CloudWatch RUM if wired.
    console.error('[ErrorBoundary] uncaught render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }
      return (
        <div role="alert" data-testid="error-boundary-fallback" className="error-boundary-fallback">
          <h1>Signal interrupted</h1>
          <p>Max is experiencing technical difficulties. Please stand by.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
