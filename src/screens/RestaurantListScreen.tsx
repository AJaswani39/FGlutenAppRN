import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useFilters } from '../context/FiltersContext';
import { useSettings } from '../context/SettingsContext';
import { MenuScanProgress, Restaurant, RestaurantFilters } from '../types/restaurant';
import RestaurantDetailModal from './components/RestaurantDetailModal';
import { RestaurantCardSkeleton } from '../components/Skeleton';
import { useDebounce } from '../hooks/useDebounce';
import { getRestaurantListKey } from '../util/restaurantUtils';
import { IconButton, Ionicons, StateMessage } from '../components/ui';
import { RestaurantSummaryCard } from '../components/RestaurantSummaryCard';

export default function RestaurantListScreen() {
  const { uiState, loadNearbyRestaurants } = useRestaurants();
  const { filters, setFilters } = useFilters();
  const { useMiles } = useSettings();

  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInputText, setSearchInputText] = useState(filters.searchQuery);
  const searchInputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    setSearchInputText(filters.searchQuery);
  }, [filters.searchQuery]);

  const debouncedSetFilters = useDebounce((text: string) => {
    setFilters({ searchQuery: text });
  }, 300);

  const { status, restaurants, message } = uiState;
  const hasResults = restaurants.length > 0;
  const isLoading = status === 'loading';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNearbyRestaurants();
    } finally {
      setRefreshing(false);
    }
  }, [loadNearbyRestaurants]);

  const handleRestaurantPress = useCallback((restaurant: Restaurant) => {
    Keyboard.dismiss();
    setSelectedRestaurant(restaurant);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerPanel}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={Colors.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search restaurants or menu evidence"
              placeholderTextColor={Colors.textMuted}
              value={searchInputText}
              onChangeText={(text) => {
                setSearchInputText(text);
                debouncedSetFilters(text);
              }}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="search"
              blurOnSubmit
            />
            {searchInputText.length > 0 ? (
              <Pressable
                onPress={() => {
                  setSearchInputText('');
                  debouncedSetFilters('');
                  setFilters({ searchQuery: '' });
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <IconButton
            icon="options"
            label="Toggle filters"
            active={showFilters}
            onPress={() => setShowFilters((value) => !value)}
          />
          <IconButton
            icon="refresh"
            label="Refresh nearby restaurants"
            onPress={loadNearbyRestaurants}
            disabled={isLoading}
          />
        </View>

        {showFilters ? (
          <FilterPanel filters={filters} setFilters={setFilters} useMiles={useMiles} />
        ) : null}

        <View style={styles.resultSummary}>
          <Text style={styles.resultTitle}>Explore results</Text>
          <Text style={styles.resultMeta}>
            {hasResults
              ? `${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} found`
              : message ?? 'Find restaurants near you'}
          </Text>
        </View>
      </View>

      {uiState.scanProgress ? <ScanProgressBanner progress={uiState.scanProgress} /> : null}

      {isLoading && !hasResults ? (
        <View style={styles.loadingContainer}>
          {Array.from({ length: 5 }).map((_, index) => (
            <RestaurantCardSkeleton key={index} />
          ))}
        </View>
      ) : null}

      {!isLoading && (!hasResults || status === 'permission_required' || status === 'error' || status === 'idle') ? (
        <StateMessage
          icon={status === 'permission_required' ? 'navigate-circle' : status === 'success' ? 'search' : 'restaurant'}
          title={stateTitle(status)}
          message={message ?? stateFallbackMessage(status)}
          actionLabel={status === 'permission_required' ? 'Enable Location' : status === 'success' ? 'Refresh Results' : 'Find Restaurants'}
          onAction={loadNearbyRestaurants}
        />
      ) : null}

      {hasResults ? (
        <FlatList
          data={restaurants}
          keyExtractor={(restaurant, index) => getRestaurantListKey(restaurant, index)}
          renderItem={({ item }) => (
            <RestaurantSummaryCard
              restaurant={item}
              useMiles={useMiles}
              onPress={() => handleRestaurantPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={Keyboard.dismiss}
        />
      ) : null}

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

function ScanProgressBanner({ progress }: { progress: MenuScanProgress }) {
  const text = progress.active
    ? `Scanning menus ${progress.completed}/${progress.total}`
    : `Menu scans complete ${progress.completed}/${progress.total}`;

  return (
    <View style={[styles.scanBanner, !progress.active && styles.scanBannerDone]}>
      {progress.active ? <ActivityIndicator size="small" color={Colors.info} /> : null}
      <Ionicons
        name={progress.active ? 'scan' : 'checkmark-circle'}
        size={16}
        color={progress.active ? Colors.info : Colors.success}
      />
      <Text style={[styles.scanBannerText, !progress.active && styles.scanBannerDoneText]}>{text}</Text>
    </View>
  );
}

function FilterPanel({
  filters,
  setFilters,
  useMiles,
}: {
  filters: RestaurantFilters;
  setFilters: (partial: Partial<RestaurantFilters>) => void;
  useMiles: boolean;
}) {
  const maxKm = useMiles ? 12 : 20;

  return (
    <ScrollView style={filterStyles.panel} showsVerticalScrollIndicator={false}>
      <View style={filterStyles.row}>
        <FilterChip label="GF Only" active={filters.gfOnly} onToggle={() => setFilters({ gfOnly: !filters.gfOnly })} />
        <FilterChip
          label="Open Now"
          active={filters.openNowOnly}
          onToggle={() => setFilters({ openNowOnly: !filters.openNowOnly })}
        />
        <FilterChip
          label="Distance"
          active={filters.sortMode === 'distance'}
          onToggle={() => setFilters({ sortMode: 'distance' })}
        />
        <FilterChip label="Name" active={filters.sortMode === 'name'} onToggle={() => setFilters({ sortMode: 'name' })} />
      </View>

      <StepperRow
        label={`Max distance: ${
          filters.maxDistanceMeters <= 0
            ? 'Any'
            : useMiles
            ? `${Math.round(filters.maxDistanceMeters / 1609.34)} mi`
            : `${Math.round(filters.maxDistanceMeters / 1000)} km`
        }`}
        onDecrease={() =>
          setFilters({
            maxDistanceMeters: Math.max(0, filters.maxDistanceMeters - (useMiles ? 1609.34 : 1000)),
          })
        }
        onIncrease={() =>
          setFilters({
            maxDistanceMeters: Math.min(
              maxKm * (useMiles ? 1609.34 : 1000),
              filters.maxDistanceMeters + (useMiles ? 1609.34 : 1000)
            ),
          })
        }
        onReset={filters.maxDistanceMeters > 0 ? () => setFilters({ maxDistanceMeters: 0 }) : undefined}
      />

      <StepperRow
        label={`Min rating: ${filters.minRating <= 0 ? 'Any' : `${filters.minRating.toFixed(1)} stars`}`}
        onDecrease={() => setFilters({ minRating: Math.max(0, filters.minRating - 0.5) })}
        onIncrease={() => setFilters({ minRating: Math.min(5, filters.minRating + 0.5) })}
        onReset={filters.minRating > 0 ? () => setFilters({ minRating: 0 }) : undefined}
      />
    </ScrollView>
  );
}

function FilterChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <Pressable style={[filterStyles.chip, active && filterStyles.chipActive]} onPress={onToggle}>
      <Text style={[filterStyles.chipText, active && filterStyles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StepperRow({
  label,
  onDecrease,
  onIncrease,
  onReset,
}: {
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset?: () => void;
}) {
  return (
    <View style={filterStyles.sliderRow}>
      <Text style={filterStyles.label}>{label}</Text>
      <View style={filterStyles.stepRow}>
        <StepButton icon="remove" onPress={onDecrease} label="Decrease" />
        <StepButton icon="add" onPress={onIncrease} label="Increase" />
        {onReset ? <StepButton icon="close" onPress={onReset} label="Reset" danger /> : null}
      </View>
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  label,
  danger,
}: {
  icon: 'add' | 'remove' | 'close';
  onPress: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <Pressable style={filterStyles.stepBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={danger ? Colors.error : Colors.textPrimary} />
    </Pressable>
  );
}

function stateTitle(status: string): string {
  if (status === 'permission_required') return 'Location needed';
  if (status === 'success') return 'No matches found';
  if (status === 'error') return 'Could not load restaurants';
  return 'Ready to search';
}

function stateFallbackMessage(status: string): string {
  if (status === 'idle') return 'Find nearby restaurants to start scanning for gluten-free evidence.';
  if (status === 'success') return 'No restaurants match your current search or filters.';
  return 'Something went wrong.';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  resultSummary: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  resultTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  resultMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 3,
  },
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xl },
  loadingContainer: { padding: Spacing.md },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.infoBg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
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
});

const filterStyles = StyleSheet.create({
  panel: {
    maxHeight: 210,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  label: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginRight: Spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.primary },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  stepRow: { flexDirection: 'row', gap: 6 },
  stepBtn: {
    width: 32,
    height: 32,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
