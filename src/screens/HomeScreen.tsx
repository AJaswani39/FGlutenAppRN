import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NavigationProp, TabActions, useNavigation } from '@react-navigation/native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useSettings } from '../context/SettingsContext';
import { RootTabParamList } from '../types/navigation';
import { getRestaurantListKey } from '../util/restaurantUtils';
import { IconCircle, Ionicons, MetaPill } from '../components/ui';
import { RestaurantSummaryCard } from '../components/RestaurantSummaryCard';

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { uiState, loadNearbyRestaurants } = useRestaurants();
  const { useMiles } = useSettings();

  const cached = uiState.restaurants;
  const hasData = cached.length > 0;
  const isLoading = uiState.status === 'loading';
  const shouldShowStatusMessage =
    Boolean(uiState.message) &&
    (uiState.status === 'error' || uiState.status === 'permission_required' || !hasData);

  const handleFindRestaurants = React.useCallback(() => {
    navigation.dispatch(TabActions.jumpTo('Restaurants'));
    void loadNearbyRestaurants();
  }, [loadNearbyRestaurants, navigation]);

  const stats = React.useMemo(() => {
    let favorites = 0;
    let scans = 0;
    let latestScan = 0;
    for (const r of cached) {
      if (r.favoriteStatus) favorites += 1;
      if (r.menuScanStatus === 'SUCCESS') scans += 1;
      if (r.menuScanTimestamp > latestScan) latestScan = r.menuScanTimestamp;
    }
    return { favorites, scans, latestScan };
  }, [cached]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <IconCircle name="leaf" />
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>Gluten-free nearby guide</Text>
            <Text style={styles.heroTitle}>Find a safer place to eat</Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>
          Search nearby restaurants, scan public menus for gluten-free evidence, and keep your own safe/try/avoid list.
        </Text>
        <Pressable
          style={[styles.ctaButton, isLoading && styles.ctaButtonDisabled]}
          onPress={handleFindRestaurants}
          disabled={isLoading}
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.textInverse} size="small" />
          ) : (
            <>
              <Ionicons name="navigate" size={17} color={Colors.textInverse} />
              <Text style={styles.ctaText}>Find Restaurants Near Me</Text>
            </>
          )}
        </Pressable>
        {shouldShowStatusMessage ? (
          <Text style={styles.statusMessage}>{uiState.message}</Text>
        ) : null}
      </View>

      <View style={styles.statsGrid}>
        <StatCard icon="location" label="Results" value={`${cached.length}`} />
        <StatCard icon="heart" label="Saved" value={`${stats.favorites}`} />
        <StatCard icon="scan" label="Scanned" value={`${stats.scans}`} />
      </View>

      {stats.latestScan > 0 ? (
        <View style={styles.timestampRow}>
          <MetaPill icon="time" text={`Last scan ${timeAgo(stats.latestScan)}`} />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Results</Text>
          {hasData ? (
            <Pressable onPress={() => navigation.dispatch(TabActions.jumpTo('Restaurants'))}>
              <Text style={styles.linkText}>Explore all</Text>
            </Pressable>
          ) : null}
        </View>

        {hasData ? (
          cached.slice(0, 5).map((restaurant, index) => (
            <RestaurantSummaryCard
              key={getRestaurantListKey(restaurant, index)}
              restaurant={restaurant}
              useMiles={useMiles}
              compact
            />
          ))
        ) : (
          <View style={styles.emptyPanel}>
            <Ionicons name="restaurant-outline" size={24} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>No search results yet</Text>
            <Text style={styles.emptyText}>Start a nearby search to fill your dashboard.</Text>
          </View>
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function StatCard({ icon, label, value }: { icon: 'location' | 'heart' | 'scan'; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingTop: Spacing.lg },
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroCopy: { flex: 1 },
  kicker: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extraBold,
    lineHeight: 32,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  ctaButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  ctaButtonDisabled: { opacity: 0.65 },
  ctaText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  statusMessage: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extraBold,
    marginTop: Spacing.sm,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  timestampRow: { marginBottom: Spacing.md, alignItems: 'flex-start' },
  section: { marginTop: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  linkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  emptyPanel: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 4,
    textAlign: 'center',
  },
});
