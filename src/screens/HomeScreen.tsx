import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { Restaurant } from '../types/restaurant';
import { SettingsManager } from '../util/SettingsManager';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { uiState, useMiles, loadNearbyRestaurants } = useRestaurants();

  const cached = uiState.restaurants;
  const hasData = cached.length > 0;

  const stats = React.useMemo(() => {
    let favorites = 0;
    let scans = 0;
    let latestScan = 0;
    for (const r of cached) {
      if (r.favoriteStatus) favorites++;
      if (r.menuScanStatus === 'SUCCESS') scans++;
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
      {/* Hero header */}
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>🌾 Gluten-Free Guide</Text>
        </View>
        <Text style={styles.heroTitle}>Find Your Safe{'\n'}Restaurant</Text>
        <Text style={styles.heroSubtitle}>
          Discover nearby restaurants with gluten-free menus, AI-powered menu
          scanning, and community-verified options — all nearby.
        </Text>
        <Pressable
          style={styles.ctaButton}
          onPress={loadNearbyRestaurants}
        >
          <Text style={styles.ctaText}>🔍  Find Restaurants Near Me</Text>
        </Pressable>
      </View>

      {/* Stats chips */}
      {hasData && (
        <View style={styles.chipsRow}>
          <StatChip icon="📍" label={`${cached.length} cached`} />
          <StatChip icon="❤️" label={`${stats.favorites} saved`} />
          <StatChip icon="🔬" label={`${stats.scans} scanned`} />
        </View>
      )}

      {stats.latestScan > 0 && (
        <Text style={styles.timestampText}>
          Last scan: {timeAgo(stats.latestScan)}
        </Text>
      )}

      {/* Feature highlights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why FGlutenApp?</Text>
        <View style={styles.featureGrid}>
          <FeatureCard
            icon="🗺️"
            title="Nearby Search"
            desc="Finds restaurants within your chosen radius using your live location."
          />
          <FeatureCard
            icon="🤖"
            title="AI Menu Scan"
            desc="Automatically scans menus for gluten-free evidence and parses items."
          />
          <FeatureCard
            icon="❤️"
            title="Favorites"
            desc="Mark places as Safe, Try, or Avoid to remember your experiences."
          />
          <FeatureCard
            icon="🔍"
            title="Smart Filters"
            desc="Filter by GF-only, open now, rating, and distance radius."
          />
        </View>
      </View>

      {/* Cached restaurants */}
      {hasData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Results</Text>
          {cached.slice(0, 5).map((r) => (
            <CachedRestaurantRow key={r.placeId} restaurant={r} useMiles={useMiles} />
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.icon}>{icon}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={featureStyles.card}>
      <Text style={featureStyles.icon}>{icon}</Text>
      <Text style={featureStyles.title}>{title}</Text>
      <Text style={featureStyles.desc}>{desc}</Text>
    </View>
  );
}

function CachedRestaurantRow({
  restaurant,
  useMiles,
}: {
  restaurant: Restaurant;
  useMiles: boolean;
}) {
  const dist = SettingsManager.formatDistance(restaurant.distanceMeters, useMiles);
  const isGF = restaurant.hasGFMenu || restaurant.gfMenu.length > 0;

  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.left}>
        <Text style={rowStyles.name} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <Text style={rowStyles.meta}>
          {isGF ? '✅ GF  •  ' : ''}{dist}
        </Text>
      </View>
      {restaurant.favoriteStatus === 'safe' && (
        <View style={[rowStyles.badge, { backgroundColor: Colors.successBg }]}>
          <Text style={[rowStyles.badgeText, { color: Colors.success }]}>Safe</Text>
        </View>
      )}
      {restaurant.favoriteStatus === 'try' && (
        <View style={[rowStyles.badge, { backgroundColor: Colors.warningBg }]}>
          <Text style={[rowStyles.badgeText, { color: Colors.warning }]}>Try</Text>
        </View>
      )}
      {restaurant.favoriteStatus === 'avoid' && (
        <View style={[rowStyles.badge, { backgroundColor: Colors.errorBg }]}>
          <Text style={[rowStyles.badgeText, { color: Colors.error }]}>Avoid</Text>
        </View>
      )}
    </View>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xl },
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  heroBadge: {
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: Spacing.md,
  },
  heroBadgeText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.display,
    fontWeight: FontWeight.extraBold,
    lineHeight: 40,
    marginBottom: Spacing.md,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 23,
    marginBottom: Spacing.xl,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  timestampText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: Spacing.lg,
  },
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  icon: { fontSize: 13 },
  label: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});

const featureStyles = StyleSheet.create({
  card: {
    width: (width - Spacing.md * 2 - Spacing.sm) / 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: { fontSize: 26, marginBottom: Spacing.sm },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    marginBottom: 4,
  },
  desc: { color: Colors.textSecondary, fontSize: FontSize.xs, lineHeight: 17 },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  left: { flex: 1 },
  name: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  meta: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 3 },
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
});
