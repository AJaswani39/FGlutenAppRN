import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Radius, FontSize, FontWeight, Spacing } from '../theme/colors';
import { MenuScanProgress } from '../types/restaurant';
import { useRestaurants } from '../context/RestaurantContext';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { Ionicons } from './ui';

interface Props {
  progress: MenuScanProgress;
}

export const ScanProgressBanner = React.memo(function ScanProgressBanner({
  progress,
}: Props) {
  const { retryFailedScans } = useRestaurants();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const text = progress.active
    ? `Scanning menus ${progress.completed}/${progress.total}`
    : `Menu scans complete ${progress.completed}/${progress.total}`;

  const hasFailures = progress.failed > 0;

  return (
    <View style={[styles.scanBanner, !progress.active && styles.scanBannerDone, hasFailures && styles.scanBannerError]}>
      <View style={styles.scanBannerMain}>
        {progress.active ? <ActivityIndicator size="small" color={colors.info} /> : null}
        <Ionicons
          name={progress.active ? 'scan' : hasFailures ? 'alert-circle' : 'checkmark-circle'}
          size={16}
          color={progress.active ? colors.info : hasFailures ? colors.error : colors.success}
        />
        <Text style={[styles.scanBannerText, !progress.active && styles.scanBannerDoneText, hasFailures && styles.scanBannerErrorText]}>
          {text}
          {hasFailures ? ` (${progress.failed} failed)` : ''}
        </Text>
      </View>
      
      {hasFailures && !progress.active ? (
        <Pressable 
          style={styles.retryBtn} 
          onPress={retryFailedScans}
          accessibilityRole="button"
          accessibilityLabel="Retry failed scans"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
          <Ionicons name="refresh" size={14} color={colors.error} />
        </Pressable>
      ) : null}
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scanBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.infoBg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderColor: colors.info,
    },
    scanBannerDone: {
      backgroundColor: colors.successBg,
      borderColor: colors.success,
    },
    scanBannerText: {
      color: colors.info,
      fontSize: FontSize.sm,
      fontWeight: FontWeight.semiBold,
    },
    scanBannerDoneText: { color: colors.success },
    scanBannerError: {
      backgroundColor: colors.errorBg,
      borderColor: colors.error,
    },
    scanBannerErrorText: {
      color: colors.error,
    },
    scanBannerMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.error,
    },
    retryBtnText: {
      color: colors.error,
      fontSize: FontSize.xs,
      fontWeight: FontWeight.bold,
    },
  });
}
