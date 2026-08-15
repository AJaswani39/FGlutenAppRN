import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { logger } from '../util/logger';

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('Unhandled render error', error.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <ThemedErrorFallback onRetry={() => this.setState({ hasError: false })} />;
  }
}

function ThemedErrorFallback({ onRetry }: { onRetry: () => void }) {
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
  });
}
