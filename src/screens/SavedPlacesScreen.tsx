import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useSettings } from '../context/SettingsContext';
import { FavoriteStatus, Restaurant } from '../types/restaurant';
import { SettingsManager } from '../util/SettingsManager';
import RestaurantDetailModal from './components/RestaurantDetailModal';

type SavedSection = {
  title: string;
  status: NonNullable<FavoriteStatus>;
  data: Restaurant[];
};

const SECTION_META: Array<{
  title: string;
  status: NonNullable<FavoriteStatus>;
  color: string;
  bg: string;
}> = [
  { title: 'Safe', status: 'safe', color: Colors.success, bg: Colors.successBg },
  { title: 'Try', status: 'try', color: Colors.warning, bg: Colors.warningBg },
  { title: 'Avoid', status: 'avoid', color: Colors.error, bg: Colors.errorBg },
];

export default function SavedPlacesScreen() {
  const { savedRestaurants } = useRestaurants();
  const { useMiles } = useSettings();
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const sections = useMemo<SavedSection[]>(
    () =>
      SECTION_META.map((meta) => ({
        title: meta.title,
        status: meta.status,
        data: savedRestaurants.filter((restaurant) => restaurant.favoriteStatus === meta.status),
      })).filter((section) => section.data.length > 0),
    [savedRestaurants]
  );

  if (savedRestaurants.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>❤️</Text>
        <Text style={styles.emptyTitle}>No saved places yet</Text>
        <Text style={styles.emptyText}>
          Mark restaurants as Safe, Try, or Avoid from their detail page and they will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(restaurant) => restaurant.placeId || `${restaurant.name}-${restaurant.address}`}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <SectionHeader section={section} />
        )}
        renderItem={({ item }) => (
          <SavedRestaurantRow
            restaurant={item}
            useMiles={useMiles}
            onPress={() => setSelectedRestaurant(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      {selectedRestaurant ? (
        <RestaurantDetailModal
          restaurant={selectedRestaurant}
          useMiles={useMiles}
          onClose={() => setSelectedRestaurant(null)}
        />
      ) : null}
    </View>
  );
}

function SectionHeader({ section }: { section: SavedSection }) {
  const meta = SECTION_META.find((item) => item.status === section.status) ?? SECTION_META[0];

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={[styles.countBadge, { backgroundColor: meta.bg }]}>
        <Text style={[styles.countText, { color: meta.color }]}>{section.data.length}</Text>
      </View>
    </View>
  );
}

function SavedRestaurantRow({
  restaurant,
  useMiles,
  onPress,
}: {
  restaurant: Restaurant;
  useMiles: boolean;
  onPress: () => void;
}) {
  const dist = SettingsManager.formatDistance(restaurant.distanceMeters, useMiles);
  const meta = SECTION_META.find((item) => item.status === restaurant.favoriteStatus) ?? SECTION_META[0];
  const gfCount = restaurant.gfMenu.length;

  return (
    <Pressable style={rowStyles.card} onPress={onPress}>
      <View style={rowStyles.headerRow}>
        <Text style={rowStyles.name} numberOfLines={1}>{restaurant.name}</Text>
        <View style={[rowStyles.statusBadge, { backgroundColor: meta.bg }]}>
          <Text style={[rowStyles.statusText, { color: meta.color }]}>{meta.title}</Text>
        </View>
      </View>
      <Text style={rowStyles.address} numberOfLines={1}>{restaurant.address}</Text>
      <View style={rowStyles.metaRow}>
        {restaurant.rating != null ? (
          <Text style={rowStyles.metaText}>⭐ {restaurant.rating.toFixed(1)}</Text>
        ) : null}
        {dist ? <Text style={rowStyles.metaText}>📍 {dist}</Text> : null}
        {gfCount > 0 ? (
          <Text style={[rowStyles.metaText, { color: Colors.success }]}>🔬 {gfCount} GF</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
  },
});

const rowStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  name: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  statusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  address: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
});
