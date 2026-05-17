import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

interface IconCircleProps {
  name: IconName;
  color?: string;
  backgroundColor?: string;
  size?: number;
}

export function IconCircle({
  name,
  color = Colors.primary,
  backgroundColor = Colors.primaryLight,
  size = 22,
}: IconCircleProps) {
  return (
    <View style={[styles.iconCircle, { backgroundColor }]}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

export function MetaPill({
  icon,
  text,
  color,
  backgroundColor = Colors.surfaceElevated,
}: {
  icon?: IconName;
  text: string;
  color?: string;
  backgroundColor?: string;
}) {
  if (!text) return null;

  return (
    <View style={[styles.pill, { backgroundColor }]}>
      {icon ? <Ionicons name={icon} size={12} color={color ?? Colors.textSecondary} /> : null}
      <Text style={[styles.pillText, color ? { color } : null]}>{text}</Text>
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
  const meta = {
    success: { color: Colors.success, bg: Colors.successBg },
    warning: { color: Colors.warning, bg: Colors.warningBg },
    error: { color: Colors.error, bg: Colors.errorBg },
    info: { color: Colors.info, bg: Colors.infoBg },
    neutral: { color: Colors.textSecondary, bg: Colors.surfaceElevated },
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
  return (
    <View style={stateStyles.container}>
      <IconCircle name={icon} size={30} />
      <Text style={stateStyles.title}>{title}</Text>
      <Text style={stateStyles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={stateStyles.button} onPress={onAction} accessibilityRole="button">
          {loading ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <>
              {actionIcon && <Ionicons name={actionIcon} size={16} color={Colors.textInverse} />}
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
  return (
    <Pressable
      style={[styles.iconButton, active && styles.iconButtonActive, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={active ? Colors.primary : Colors.textSecondary} />
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
    color: Colors.textSecondary,
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
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconButtonActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.45,
  },
});

const stateStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    color: Colors.textSecondary,
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
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  buttonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
