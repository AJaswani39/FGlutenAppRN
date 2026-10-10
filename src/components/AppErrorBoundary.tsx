import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { logger, reportError } from '../util/logger';

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  context?: Record<string, unknown>;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const context = { ...this.props.context, errorBoundary: 'AppErrorBoundary' };
    logger.error('Unhandled render error', error.message, info.componentStack);
    void reportError(error, context, { componentStack: info.componentStack ?? undefined });
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback(this.state.error!, this.reset);
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return <ThemedErrorFallback onRetry={this.reset} error={this.state.error} />;
  }
}

function ThemedErrorFallback({ onRetry, error }: { onRetry: () => void; error?: Error }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.error} />
      </View>
      <Text style={styles.title}>Something needs a refresh</Text>
      <Text style={styles.message}>
        The app hit an unexpected screen error. Your saved places and settings are still stored.
      </Text>
      <Pressable
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Ionicons name="refresh" size={16} color={colors.textInverse} />
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {error && __DEV__ && (
        <Text style={styles.errorDetails}>{error.message}</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: Spacing.xl,
    },
    iconWrap: {
      width: 64,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.full,
      backgroundColor: colors.errorBg,
      marginBottom: Spacing.lg,
    },
    title: {
      color: colors.textPrimary,
      fontSize: FontSize.xl,
      fontWeight: FontWeight.bold,
      marginBottom: Spacing.sm,
      textAlign: 'center',
    },
    message: {
      color: colors.textSecondary,
      fontSize: FontSize.md,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 12,
    },
    buttonText: {
      color: colors.textInverse,
      fontSize: FontSize.md,
      fontWeight: FontWeight.bold,
    },
    errorDetails: {
      color: colors.textSecondary,
      fontSize: FontSize.xs,
      marginTop: Spacing.md,
      textAlign: 'center',
      fontFamily: 'monospace',
    },
  });
}