import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Colors, Radius, FontSize, FontWeight, Spacing } from '../theme/colors';
import { MenuScanProgress } from '../types/restaurant';
import { useRestaurants } from '../context/RestaurantContext';
import { Ionicons } from './ui';

interface Props {
  progress: MenuScanProgress;
}

export const ScanProgressBanner = React.memo(function ScanProgressBanner({
  progress,
}: Props) {
  const { retryFailedScans } = useRestaurants();
  const text = progress.active
    ? `Scanning menus ${progress.completed}/${progress.total}`
    : `Menu scans complete ${progress.completed}/${progress.total}`;

  const hasFailures = progress.failed > 0;

  return (
    <View style={[styles.scanBanner, !progress.active && styles.scanBannerDone, hasFailures && styles.scanBannerError]}>
      <View style={styles.scanBannerMain}>
        {progress.active ? <ActivityIndicator size="small" color={Colors.info} /> : null}
        <Ionicons
          name={progress.active ? 'scan' : hasFailures ? 'alert-circle' : 'checkmark-circle'}
          size={16}
          color={progress.active ? Colors.info : hasFailures ? Colors.error : Colors.success}
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
          <Ionicons name="refresh" size={14} color={Colors.error} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.infoBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderColor: Colors.info,
  },
  scanBannerDone: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success,
  },
  scanBannerText: {
    color: Colors.info,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  scanBannerDoneText: { color: Colors.success },
  scanBannerError: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.error,
  },
  scanBannerErrorText: {
    color: Colors.error,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  retryBtnText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
