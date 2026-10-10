import React from 'react';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { logger } from '../util/logger';

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: {
    fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
    context?: Record<string, unknown>;
  }
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  return function WithErrorBoundary(props: P) {
    return (
      <AppErrorBoundary
        fallback={options?.fallback}
        onError={options?.onError}
        context={{ ...options?.context, component: displayName }}
      >
        <WrappedComponent {...props} />
      </AppErrorBoundary>
    );
  };
}

export function createFeatureErrorBoundary(
  featureName: string,
  defaultFallback?: React.ReactNode
): React.FC<{ children: React.ReactNode }> {
  return function FeatureErrorBoundary({ children }) {
    return (
      <AppErrorBoundary
        context={{ feature: featureName }}
        fallback={defaultFallback}
      >
        {children}
      </AppErrorBoundary>
    );
  };
}

export const MapErrorBoundary = createFeatureErrorBoundary('Map');
export const RestaurantListErrorBoundary = createFeatureErrorBoundary('RestaurantList');
export const SettingsErrorBoundary = createFeatureErrorBoundary('Settings');
export const RestaurantDetailErrorBoundary = createFeatureErrorBoundary('RestaurantDetail');