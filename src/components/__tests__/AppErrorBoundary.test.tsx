import React from 'react';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { Text } from 'react-native';

describe('AppErrorBoundary', () => {
  it('exports correctly', () => {
    expect(AppErrorBoundary).toBeDefined();
    expect(typeof AppErrorBoundary).toBe('function');
  });

  it('has static getDerivedStateFromError', () => {
    expect(AppErrorBoundary.getDerivedStateFromError).toBeDefined();
  });

  it('has componentDidCatch', () => {
    expect(AppErrorBoundary.prototype.componentDidCatch).toBeDefined();
  });
});