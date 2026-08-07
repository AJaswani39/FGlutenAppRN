import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { Restaurant } from '../types/restaurant';
import { formatDistance } from '../util/formatters';
import { getGfConfidenceLevel } from '../util/restaurantUtils';

import { Ionicons, MetaPill, StatusBadge } from './ui';

export function getFavoriteMeta(status: Restaurant['favoriteStatus']) {
  if (status === 'safe') return { label: 'Safe', tone: 'success' as const, icon: 'shield-checkmark' as const };
  if (status === 'try') return { label: 'Try', tone: 'warning' as const, icon: 'flag' as const };
  if (status === 'avoid') return { label: 'Avoid', tone: 'error' as const, icon: 'close-circle' as const };
  return null;
}

export function getConfidenceMeta(restaurant: Restaurant) {
  const level = getGfConfidenceLevel(restaurant);
  switch (level) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'success' as const, icon: 'checkmark-circle' as const };
    case 'name_match':
      return { label: 'Likely GF', tone: 'warning' as const, icon: 'leaf' as const };
    case 'no_evidence':
      return { label: 'No evidence', tone: 'neutral' as const, icon: 'search' as const };
    case 'unavailable':
      return { label: 'Unavailable', tone: 'warning' as const, icon: 'alert-circle' as const };
    default:
      return { label: 'Pending', tone: 'info' as const, icon: 'time' as const };
  }
}

export const RestaurantSummaryCard = React.memo(
  function RestaurantSummaryCard({
    restaurant,
    useMiles,
    onPress,
    compact,
    onRescan,
  }: {
    restaurant: Restaurant;
    useMiles: boolean;
    onPress?: () => void;
    compact?: boolean;
    onRescan?: () => void;
  }) {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const dist = formatDistance(restaurant.distanceMeters, useMiles);

    const confidence = getConfidenceMeta(restaurant);
    const favorite = getFavoriteMeta(restaurant.favoriteStatus);
    const Container = onPress ? Pressable : View;

    return (
      <Container style={[styles.card, compact && styles.compactCard]} onPress={onPress}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.name} numberOfLines={1}>
              {restaurant.name}
            </Text>
            <Text style={styles.address} numberOfLines={1}>
              {restaurant.address || 'Address unavailable'}
            </Text>
          </View>
          <StatusBadge label={favorite?.label ?? confidence.label} tone={favorite?.tone ?? confidence.tone} />
        </View>

        <View style={styles.metaRow}>
          {restaurant.rating != null ? (
            <MetaPill icon="star" text={restaurant.rating.toFixed(1)} color={colors.warning} />
          ) : null}
          {restaurant.openNow != null ? (
            <MetaPill
              icon={restaurant.openNow ? 'time' : 'time-outline'}
              text={restaurant.openNow ? 'Open' : 'Closed'}
              color={restaurant.openNow ? colors.success : colors.error}
            />
          ) : null}
          {dist ? <MetaPill icon="location" text={dist} /> : null}
          <MetaPill icon={confidence.icon} text={confidence.label} color={toneColor(confidence.tone, colors)} />
          {restaurant.menuScanStatus === 'FETCHING' ? (
            <View style={styles.scanPill}>
              <Ionicons name="sync" size={12} color={colors.info} />
              <Text style={styles.scanText}>Scanning</Text>
            </View>
          ) : null}
          {restaurant.menuScanStatus === 'SUCCESS' && restaurant.gfMenu.length > 0 ? (
            <MetaPill icon="restaurant" text={`${restaurant.gfMenu.length} GF`} color={colors.success} />
          ) : null}
          {restaurant.menuScanStatus === 'SUCCESS' && restaurant.menuScanTimestamp > 0 ? (
            <MetaPill 
              icon="calendar" 
              text={new Date(restaurant.menuScanTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} 
            />
          ) : null}
          {restaurant.menuScanStatus === 'FAILED' ? (
            <Pressable 
              style={styles.retryPill} 
              onPress={(e) => {
                e.stopPropagation();
                onRescan?.();
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry menu scan"
            >
              <Ionicons name="refresh" size={12} color={colors.error} />
              <Text style={styles.retryText}>Retry Scan</Text>
            </Pressable>
          ) : null}
        </View>
      </Container>
    );
  }
);


function toneColor(tone: ReturnType<typeof getConfidenceMeta>['tone'], colors: ThemeColors): string {
  if (tone === 'success') return colors.success;
  if (tone === 'warning') return colors.warning;
  if (tone === 'info') return colors.info;
  return colors.textSecondary;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    compactCard: {
      padding: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    titleGroup: {
      flex: 1,
    },
    name: {
      color: colors.textPrimary,
      fontSize: FontSize.md,
      fontWeight: FontWeight.semiBold,
    },
    address: {
      color: colors.textMuted,
      fontSize: FontSize.sm,
      marginTop: 3,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: Spacing.sm,
    },
    scanPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: Radius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: colors.infoBg,
    },
    scanText: {
      color: colors.info,
      fontSize: FontSize.xs,
      fontWeight: FontWeight.medium,
    },
    retryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: Radius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: colors.errorBg,
      borderWidth: 1,
      borderColor: colors.error,
    },
    retryText: {
      color: colors.error,
      fontSize: FontSize.xs,
      fontWeight: FontWeight.bold,
    },
  });
}
