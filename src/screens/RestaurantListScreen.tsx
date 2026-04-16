import React, { useState, useCallback, useRef } from 'react';
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
  Linking,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useFilters } from '../context/FiltersContext';
import { useSettings } from '../context/SettingsContext';
import { Restaurant, RestaurantFilters } from '../types/restaurant';
import { SettingsManager } from '../util/SettingsManager';
import RestaurantDetailModal from './components/RestaurantDetailModal';
import { RestaurantCardSkeleton } from '../components/Skeleton';
import { useDebounce } from '../hooks/useDebounce';

type ViewMode = 'list' | 'map';

export default function RestaurantListScreen() {
  const { uiState, loadNearbyRestaurants } = useRestaurants();
  const { filters, setFilters } = useFilters();
  const { useMiles } = useSettings();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInputText, setSearchInputText] = useState(filters.searchQuery);

  const searchInputRef = useRef<TextInput>(null);

  // Sync local state with external filter changes
  React.useEffect(() => {
    setSearchInputText(filters.searchQuery);
  }, [filters.searchQuery]);

  const debouncedSetFilters = useDebounce((t: string) => {
    setFilters({ searchQuery: t });
  }, 300);

  const { status, restaurants, message } = uiState;
  const hasResults = restaurants.length > 0;
  const isLoading = status === 'loading';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNearbyRestaurants();
    setRefreshing(false);
  }, [loadNearbyRestaurants]);

  const handleRestaurantPress = useCallback((r: Restaurant) => {
    Keyboard.dismiss();
    setSelectedRestaurant(r);
  }, []);

  return (
    <View style={styles.container}>
      {/* ── Search bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search restaurants or menu items…"
            placeholderTextColor={Colors.textMuted}
            value={searchInputText}
            onChangeText={(t) => {
              setSearchInputText(t);
              debouncedSetFilters(t);
            }}
            onSubmitEditing={() => Keyboard.dismiss()}
            returnKeyType="search"
            blurOnSubmit
          />
          {searchInputText.length > 0 && (
            <Pressable
              onPress={() => {
                setSearchInputText('');
                debouncedSetFilters('');
                setFilters({ searchQuery: '' });
              }}
            >
              <Text style={styles.clearSearch}>✕</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
          onPress={() => setShowFilters((v) => !v)}
        >
          <Text style={styles.filterBtnText}>⚙️</Text>
        </Pressable>
      </View>

      {/* ── Filter panel ── */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          useMiles={useMiles}
        />
      )}

      {/* ── View toggle ── */}
      <View style={styles.toggleRow}>
        <ToggleButton
          label="📋  List"
          active={viewMode === 'list'}
          onPress={() => setViewMode('list')}
        />
        <ToggleButton
          label="🗺️  Map"
          active={viewMode === 'map'}
          onPress={() => setViewMode('map')}
        />
        <Pressable
          style={styles.refreshBtn}
          onPress={loadNearbyRestaurants}
        >
          <Text style={styles.refreshBtnText}>↻</Text>
        </Pressable>
      </View>

      {/* ── Results count ── */}
      {(hasResults || (status === 'success' && message)) && (
        <Text style={styles.resultsCount}>
          {hasResults
            ? `${restaurants.length} restaurant${restaurants.length !== 1 ? 's' : ''} found`
            : message}
        </Text>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && !hasResults && (
        <View style={styles.loadingContainer}>
          {Array.from({ length: 5 }).map((_, i) => (
            <RestaurantCardSkeleton key={i} />
          ))}
        </View>
      )}

      {/* ── Permission / Error state ── */}
      {!isLoading && (!hasResults || status === 'permission_required' || status === 'error' || status === 'idle') && (
        <StateMessage
          status={status}
          message={message}
          onAction={loadNearbyRestaurants}
        />
      )}

      {/* ── List view ── */}
      {hasResults && viewMode === 'list' && (
        <FlatList
          data={restaurants}
          keyExtractor={(r) => r.placeId || `${r.name}-${r.address}`}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              useMiles={useMiles}
              onPress={() => handleRestaurantPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={Keyboard.dismiss}
        />
      )}

      {/* ── Map placeholder (react-native-maps requires native build) ── */}
      {hasResults && viewMode === 'map' && (
        <MapPlaceholder
          restaurants={restaurants}
          userLat={uiState.userLatitude}
          userLng={uiState.userLongitude}
          useMiles={useMiles}
          onRestaurantPress={handleRestaurantPress}
        />
      )}

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

// ── RestaurantCard ───────────────────────────────────────────────────────────

function RestaurantCard({
  restaurant: r,
  useMiles,
  onPress,
}: {
  restaurant: Restaurant;
  useMiles: boolean;
  onPress: () => void;
}) {
  const isGF = r.hasGFMenu || r.gfMenu.length > 0;
  const dist = SettingsManager.formatDistance(r.distanceMeters, useMiles);

  return (
    <Pressable style={cardStyles.card} onPress={onPress}>
      {/* Header row */}
      <View style={cardStyles.headerRow}>
        <Text style={cardStyles.name} numberOfLines={1}>
          {r.name}
        </Text>
        {isGF && (
          <View style={cardStyles.gfBadge}>
            <Text style={cardStyles.gfBadgeText}>GF</Text>
          </View>
        )}
      </View>

      <Text style={cardStyles.address} numberOfLines={1}>
        {r.address}
      </Text>

      {/* Meta row */}
      <View style={cardStyles.metaRow}>
        {r.rating != null && (
          <MetaPill icon="⭐" text={r.rating.toFixed(1)} />
        )}
        {r.openNow != null && (
          <MetaPill
            icon={r.openNow ? '🟢' : '🔴'}
            text={r.openNow ? 'Open' : 'Closed'}
            color={r.openNow ? Colors.success : Colors.error}
          />
        )}
        {dist && <MetaPill icon="📍" text={dist} />}
        <ScanStatusPill status={r.menuScanStatus} gfCount={r.gfMenu.length} />
      </View>

      {/* Favorite badge */}
      {r.favoriteStatus && (
        <View
          style={[
            cardStyles.favBadge,
            {
              backgroundColor:
                r.favoriteStatus === 'safe'
                  ? Colors.successBg
                  : r.favoriteStatus === 'try'
                  ? Colors.warningBg
                  : Colors.errorBg,
            },
          ]}
        >
          <Text
            style={[
              cardStyles.favText,
              {
                color:
                  r.favoriteStatus === 'safe'
                    ? Colors.success
                    : r.favoriteStatus === 'try'
                    ? Colors.warning
                    : Colors.error,
              },
            ]}
          >
            {r.favoriteStatus === 'safe'
              ? '✅ Marked Safe'
              : r.favoriteStatus === 'try'
              ? '⚠️ Want to Try'
              : '❌ Avoid'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function MetaPill({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={cardStyles.pill}>
      <Text style={cardStyles.pillIcon}>{icon}</Text>
      <Text style={[cardStyles.pillText, color ? { color } : {}]}>{text}</Text>
    </View>
  );
}

function ScanStatusPill({
  status,
  gfCount,
}: {
  status: Restaurant['menuScanStatus'];
  gfCount: number;
}) {
  if (status === 'NOT_STARTED' || status === 'NO_WEBSITE') return null;
  if (status === 'FETCHING')
    return (
      <View style={cardStyles.pill}>
        <ActivityIndicator size="small" color={Colors.info} style={{ marginRight: 3 }} />
        <Text style={[cardStyles.pillText, { color: Colors.info }]}>Scanning…</Text>
      </View>
    );
  if (status === 'SUCCESS')
    return (
      <View style={[cardStyles.pill, { backgroundColor: Colors.successBg }]}>
        <Text style={[cardStyles.pillText, { color: Colors.success }]}>
          🔬 {gfCount} item{gfCount !== 1 ? 's' : ''}
        </Text>
      </View>
    );
  if (status === 'FAILED')
    return (
      <View style={cardStyles.pill}>
        <Text style={[cardStyles.pillText, { color: Colors.textMuted }]}>Scan failed</Text>
      </View>
    );
  return null;
}

// ── FilterPanel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  setFilters,
  useMiles,
}: {
  filters: RestaurantFilters;
  setFilters: (p: Partial<RestaurantFilters>) => void;
  useMiles: boolean;
}) {
  const maxKm = useMiles ? 12 : 20;

  return (
    <ScrollView style={filterStyles.panel} showsVerticalScrollIndicator={false}>
      {/* Toggle chips */}
      <View style={filterStyles.row}>
        <FilterChip
          label="GF Only"
          active={filters.gfOnly}
          onToggle={() => setFilters({ gfOnly: !filters.gfOnly })}
        />
        <FilterChip
          label="Open Now"
          active={filters.openNowOnly}
          onToggle={() => setFilters({ openNowOnly: !filters.openNowOnly })}
        />
      </View>

      {/* Sort */}
      <View style={filterStyles.row}>
        <Text style={filterStyles.label}>Sort by:</Text>
        <FilterChip
          label="Distance"
          active={filters.sortMode === 'distance'}
          onToggle={() => setFilters({ sortMode: 'distance' })}
        />
        <FilterChip
          label="Name"
          active={filters.sortMode === 'name'}
          onToggle={() => setFilters({ sortMode: 'name' })}
        />
      </View>

      {/* Distance slider (manual +/- for RN expo go compat) */}
      <View style={filterStyles.sliderRow}>
        <Text style={filterStyles.label}>
          Max distance:{' '}
          {filters.maxDistanceMeters <= 0
            ? 'Any'
            : useMiles
            ? `${Math.round(filters.maxDistanceMeters / 1609.34)} mi`
            : `${Math.round(filters.maxDistanceMeters / 1000)} km`}
        </Text>
        <View style={filterStyles.stepRow}>
          <Pressable
            style={filterStyles.stepBtn}
            onPress={() =>
              setFilters({
                maxDistanceMeters: Math.max(
                  0,
                  filters.maxDistanceMeters - (useMiles ? 1609.34 : 1000)
                ),
              })
            }
          >
            <Text style={filterStyles.stepBtnText}>−</Text>
          </Pressable>
          <Pressable
            style={filterStyles.stepBtn}
            onPress={() =>
              setFilters({
                maxDistanceMeters: Math.min(
                  maxKm * (useMiles ? 1609.34 : 1000),
                  filters.maxDistanceMeters + (useMiles ? 1609.34 : 1000)
                ),
              })
            }
          >
            <Text style={filterStyles.stepBtnText}>+</Text>
          </Pressable>
          {filters.maxDistanceMeters > 0 && (
            <Pressable
              style={filterStyles.stepBtn}
              onPress={() => setFilters({ maxDistanceMeters: 0 })}
            >
              <Text style={[filterStyles.stepBtnText, { color: Colors.error }]}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Min rating */}
      <View style={filterStyles.sliderRow}>
        <Text style={filterStyles.label}>
          Min rating: {filters.minRating <= 0 ? 'Any' : `${filters.minRating.toFixed(1)} ★`}
        </Text>
        <View style={filterStyles.stepRow}>
          <Pressable
            style={filterStyles.stepBtn}
            onPress={() => setFilters({ minRating: Math.max(0, filters.minRating - 0.5) })}
          >
            <Text style={filterStyles.stepBtnText}>−</Text>
          </Pressable>
          <Pressable
            style={filterStyles.stepBtn}
            onPress={() => setFilters({ minRating: Math.min(5, filters.minRating + 0.5) })}
          >
            <Text style={filterStyles.stepBtnText}>+</Text>
          </Pressable>
          {filters.minRating > 0 && (
            <Pressable
              style={filterStyles.stepBtn}
              onPress={() => setFilters({ minRating: 0 })}
            >
              <Text style={[filterStyles.stepBtnText, { color: Colors.error }]}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={[filterStyles.chip, active && filterStyles.chipActive]}
      onPress={onToggle}
    >
      <Text style={[filterStyles.chipText, active && filterStyles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── MapPlaceholder ─────────────────────────────────────────────────────────

function MapPlaceholder({
  restaurants,
  userLat,
  userLng,
  useMiles,
  onRestaurantPress,
}: {
  restaurants: Restaurant[];
  userLat: number | null;
  userLng: number | null;
  useMiles: boolean;
  onRestaurantPress: (r: Restaurant) => void;
}) {
  const openInMaps = (r: Restaurant) => {
    const url = Platform.select({
      ios: `maps://app?daddr=${r.latitude},${r.longitude}`,
      android: `geo:${r.latitude},${r.longitude}?q=${encodeURIComponent(r.name)}`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <View style={mapStyles.container}>
      <View style={mapStyles.header}>
        <Text style={mapStyles.headerText}>📍 {restaurants.length} locations</Text>
        {userLat && (
          <Text style={mapStyles.headerSub}>
            Your location: {userLat.toFixed(4)}, {userLng?.toFixed(4)}
          </Text>
        )}
      </View>
      <FlatList
        data={restaurants}
        keyExtractor={(r) => r.placeId || `${r.name}-${r.address}`}
        renderItem={({ item: r }) => (
          <Pressable
            style={mapStyles.row}
            onPress={() => onRestaurantPress(r)}
          >
            <View style={mapStyles.pin}>
              <Text style={mapStyles.pinText}>📍</Text>
            </View>
            <View style={mapStyles.rowContent}>
              <Text style={mapStyles.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={mapStyles.dist}>
                {SettingsManager.formatDistance(r.distanceMeters, useMiles)}
              </Text>
            </View>
            <Pressable
              style={mapStyles.dirBtn}
              onPress={(event) => {
                event.stopPropagation();
                openInMaps(r);
              }}
            >
              <Text style={mapStyles.dirText}>Navigate</Text>
            </Pressable>
          </Pressable>
        )}
        contentContainerStyle={{ padding: Spacing.md }}
        showsVerticalScrollIndicator={false}
      />
      <Text style={mapStyles.note}>
        💡 Full map view available in production build (react-native-maps)
      </Text>
    </View>
  );
}

// ── StateMessage ────────────────────────────────────────────────────────────

function StateMessage({
  status,
  message,
  onAction,
}: {
  status: string;
  message: string | null;
  onAction: () => void;
}) {
  const isPermission = status === 'permission_required';
  const isIdle = status === 'idle';
  const isEmptySuccess = status === 'success';

  return (
    <View style={stateStyles.container}>
      <Text style={stateStyles.emoji}>
        {isPermission ? '📍' : isIdle ? '🌾' : isEmptySuccess ? '🔎' : '⚠️'}
      </Text>
      <Text style={stateStyles.message}>
        {message ??
          (isIdle
            ? 'Tap the button below to find restaurants near you.'
            : isEmptySuccess
            ? 'No restaurants match your current search.'
            : 'Something went wrong.')}
      </Text>
      <Pressable style={stateStyles.button} onPress={onAction}>
        <Text style={stateStyles.buttonText}>
          {isPermission ? 'Enable Location' : isEmptySuccess ? 'Refresh Results' : 'Find Restaurants'}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Toggle button ────────────────────────────────────────────────────────────

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchRow: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  clearSearch: { color: Colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
  filterBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  filterBtnText: { fontSize: 18 },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  toggleBtnTextActive: { color: Colors.textInverse },
  refreshBtn: {
    width: 36,
    height: 36,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refreshBtnText: { color: Colors.primary, fontSize: 20, fontWeight: FontWeight.bold },
  resultsCount: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  listContent: { padding: Spacing.md, paddingTop: 0 },
  loadingContainer: {
    padding: Spacing.md,
  },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.md },
});

const cardStyles = StyleSheet.create({
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
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    marginRight: 8,
  },
  gfBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gfBadgeText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  address: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  pillIcon: { fontSize: 11 },
  pillText: { color: Colors.textSecondary, fontSize: FontSize.xs },
  favBadge: {
    marginTop: Spacing.sm,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  favText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
});

const filterStyles = StyleSheet.create({
  panel: {
    maxHeight: 200,
    backgroundColor: Colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginRight: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.textInverse },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  stepRow: { flexDirection: 'row', gap: 6 },
  stepBtn: {
    width: 32,
    height: 32,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepBtnText: { color: Colors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold },
});

const mapStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  headerSub: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
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
  pin: {
    width: 36,
    height: 36,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  pinText: { fontSize: 18 },
  rowContent: { flex: 1 },
  name: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  dist: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  dirBtn: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dirText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  note: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    padding: Spacing.md,
    paddingTop: 0,
  },
});

const stateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emoji: { fontSize: 52 },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 23,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 13,
    marginTop: Spacing.sm,
  },
  buttonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },
});
