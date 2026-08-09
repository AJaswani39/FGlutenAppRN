import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, FontWeight, Radius, Spacing, TouchTarget } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';

type IconName = keyof typeof Ionicons.glyphMap;

interface IconCircleProps {
  name: IconName;
  color?: string;
  backgroundColor?: string;
  size?: number;
}

export function IconCircle({
  name,
  color,
  backgroundColor,
  size = 22,
}: IconCircleProps) {
  const { colors } = useTheme();
  const iconColor = color ?? colors.primary;
  const iconBackgroundColor = backgroundColor ?? colors.primaryLight;

  return (
    <View style={[styles.iconCircle, { backgroundColor: iconBackgroundColor }]}>
      <Ionicons name={name} size={size} color={iconColor} />
    </View>
  );
}

export function MetaPill({
  icon,
  text,
  color,
  backgroundColor,
}: {
  icon?: IconName;
  text: string;
  color?: string;
  backgroundColor?: string;
}) {
  const { colors } = useTheme();

  if (!text) return null;

  return (
    <View style={[styles.pill, { backgroundColor: backgroundColor ?? colors.surfaceElevated }]}>
      {icon ? <Ionicons name={icon} size={12} color={color ?? colors.textSecondary} /> : null}
      <Text style={[styles.pillText, { color: color ?? colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}) {
  const { colors } = useTheme();
  const meta = {
    success: { color: colors.success, bg: colors.successBg },
    warning: { color: colors.warning, bg: colors.warningBg },
    error: { color: colors.error, bg: colors.errorBg },
    info: { color: colors.info, bg: colors.infoBg },
    neutral: { color: colors.textSecondary, bg: colors.surfaceElevated },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{label}</Text>
    </View>
  );
}

export function StateMessage({
  icon,
  title,
  message,
  actionLabel,
  actionIcon = 'refresh',
  onAction,
  loading,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const stateStyles = React.useMemo(() => createStateStyles(colors), [colors]);

  return (
    <View style={stateStyles.container}>
      <IconCircle name={icon} size={30} />
      <Text style={stateStyles.title}>{title}</Text>
      <Text style={stateStyles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={stateStyles.button} onPress={onAction} accessibilityRole="button">
          {loading ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <>
              {actionIcon && <Ionicons name={actionIcon} size={16} color={colors.textInverse} />}
              <Text style={stateStyles.buttonText}>{actionLabel}</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const themedStyles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      style={[themedStyles.iconButton, active && themedStyles.iconButtonActive, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={active ? colors.primary : colors.textSecondary} />
    </Pressable>
  );
}

export { Ionicons };
export type { IconName };

const styles = StyleSheet.create({
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 4,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  disabled: {
    opacity: 0.45,
  },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    iconButton: {
      width: TouchTarget.minimum,
      height: TouchTarget.minimum,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconButtonActive: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
    },
  });
}

function createStateStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
    },
    title: {
      color: colors.textPrimary,
      fontSize: FontSize.xl,
      fontWeight: FontWeight.bold,
      marginTop: Spacing.md,
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
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
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
