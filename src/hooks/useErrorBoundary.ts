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

/**
 * A React component that acts as an error boundary, catching JavaScript errors anywhere in its child component tree.
 * It logs the error using the provided error reporting mechanism and displays a fallback UI if an error occurs.
 * The component can reset its error state when the resetKeys prop changes, allowing for recovery from errors.
 * @param children The child components to render within the error boundary.
 * @param fallback An optional fallback UI to display when an error is caught. It can be a React node or a function that receives the error and a reset function.
 * @param onError An optional callback function that is called when an error is caught, receiving the error and error information.
 * @param context Optional context information to include in the error report.
 * @param resetKeys An optional array of values that, when changed, will reset the error boundary's state, allowing for recovery from errors.
 * @returns A React element that either renders its children or a fallback UI in case of an error.
 */
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