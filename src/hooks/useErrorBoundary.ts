import React, { useCallback, useState } from 'react';
import { reportError } from '../util/errorReporting';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  context?: Record<string, unknown>;
  resetKeys?: unknown[];
}

export function ErrorBoundary({
  children,
  fallback,
  onError,
  context = {},
  resetKeys = [],
}: ErrorBoundaryProps) {
  const [state, setState] = useState<ErrorBoundaryState>({ hasError: false });

  const reset = useCallback(() => {
    setState({ hasError: false, error: undefined });
  }, []);

  if (state.hasError) {
    if (typeof fallback === 'function') {
      return fallback(state.error!, reset);
    }
    return fallback ?? null;
  }

  return children;
}

export function useErrorHandler(context?: Record<string, unknown>) {
  return useCallback(
    (error: Error, componentStack?: string) => {
      void reportError(error, context, { componentStack, severity: 'error' });
    },
    [context]
  );
}