import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useSettings } from '../context/SettingsContext';
import { FavoriteStatus, Restaurant } from '../types/restaurant';
import RestaurantDetailModal from './components/RestaurantDetailModal';
import { getRestaurantListKey } from '../util/restaurantUtils';
import { Ionicons, StateMessage, StatusBadge } from '../components/ui';
import { RestaurantSummaryCard } from '../components/RestaurantSummaryCard';

type SavedSection = {
  title: string;
  status: NonNullable<FavoriteStatus>;
  data: Restaurant[];
};

const SECTION_META: Array<{
  title: string;
  status: NonNullable<FavoriteStatus>;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'success' | 'warning' | 'error';
}> = [
  { title: 'Safe', status: 'safe', icon: 'shield-checkmark', tone: 'success' },
  { title: 'Try', status: 'try', icon: 'flag', tone: 'warning' },
  { title: 'Avoid', status: 'avoid', icon: 'close-circle', tone: 'error' },
];

export default function SavedPlacesScreen() {
  const { savedRestaurants, requestMenuRescan, setFavoriteStatus } = useRestaurants();
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
        <StateMessage
          icon="heart"
          title="No saved places yet"
          message="Mark restaurants as Safe, Try, or Avoid from their detail page and they will appear here."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Saved places</Text>
        <Text style={styles.headerText}>Your personal safe, try, and avoid list.</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(restaurant, index) => getRestaurantListKey(restaurant, index)}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <SectionHeader section={section} />}
        renderItem={({ item }) => (
          <ReanimatedSwipeable
            renderRightActions={() => (
              <Pressable
                style={styles.deleteAction}
                onPress={() => setFavoriteStatus(item, null)}
              >
                <Ionicons name="trash" size={24} color={Colors.textInverse} />
              </Pressable>
            )}
            friction={2}
            rightThreshold={40}
          >
            <RestaurantSummaryCard
              restaurant={item}
              useMiles={useMiles}
              onPress={() => setSelectedRestaurant(item)}
              onRescan={() => requestMenuRescan(item)}
            />
          </ReanimatedSwipeable>
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
      <View style={styles.sectionTitleRow}>
        <Ionicons name={meta.icon} size={18} color={toneColor(meta.tone)} />
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
      <StatusBadge label={`${section.data.length}`} tone={meta.tone} />
    </View>
  );
}

function toneColor(tone: 'success' | 'warning' | 'error') {
  if (tone === 'success') return Colors.success;
  if (tone === 'warning') return Colors.warning;
  return Colors.error;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center' },
  header: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  headerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  deleteAction: {
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    marginLeft: Spacing.sm,
  },
});
