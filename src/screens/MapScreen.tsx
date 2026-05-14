import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useSettings } from '../context/SettingsContext';
import { Restaurant } from '../types/restaurant';
import { formatDistance } from '../util/formatters';

import RestaurantDetailModal from './components/RestaurantDetailModal';
import { getRestaurantListKey } from '../util/restaurantUtils';
import { Ionicons, StateMessage } from '../components/ui';
import { ScanProgressBanner } from '../components/ScanProgressBanner';
import { distanceBetween } from '../util/geoUtils';

export default function MapScreen() {
  const { uiState, loadNearbyRestaurants } = useRestaurants();
  const { useMiles } = useSettings();
  const [previewRestaurant, setPreviewRestaurant] = useState<Restaurant | null>(null);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

  const restaurants = uiState.restaurants;

  const showSearchButton = useMemo(() => {
    if (!mapRegion || !uiState.userLatitude || !uiState.userLongitude) return false;
    if (uiState.status === 'loading') return false;

    const dist = distanceBetween(
      mapRegion.latitude,
      mapRegion.longitude,
      uiState.userLatitude,
      uiState.userLongitude
    );

    // Show if map center has moved more than 3km from current search center
    return dist > 3000;
  }, [mapRegion, uiState.status, uiState.userLatitude, uiState.userLongitude]);

  const initialRegion = useMemo<Region | null>(() => {
    if (uiState.userLatitude != null && uiState.userLongitude != null) {
      return {
        latitude: uiState.userLatitude,
        longitude: uiState.userLongitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }

    const first = restaurants[0];
    if (!first) return null;

    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [restaurants, uiState.userLatitude, uiState.userLongitude]);

  if (uiState.status === 'loading' && restaurants.length === 0) {
    return (
      <View style={stateStyles.container}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={stateStyles.message}>Finding restaurants near you...</Text>
      </View>
    );
  }

  if (!initialRegion) {
    return (
      <View style={stateStyles.container}>
        <StateMessage
          icon={uiState.status === 'permission_required' ? 'navigate-circle' : 'map'}
          title={uiState.status === 'permission_required' ? 'Location needed' : 'Map is empty'}
          message={uiState.message ?? 'Search nearby restaurants to show them on the map.'}
          actionLabel={uiState.status === 'permission_required' ? 'Enable Location' : 'Find Restaurants'}
          onAction={() => loadNearbyRestaurants()}
        />
      </View>
    );
  }

  const hasNoResults = uiState.status === 'success' && restaurants.length === 0;

  return (
    <View style={styles.container}>
      {uiState.scanProgress ? <ScanProgressBanner progress={uiState.scanProgress} /> : null}
      
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation={uiState.userLatitude != null && uiState.userLongitude != null}
        showsMyLocationButton
        onPress={() => setPreviewRestaurant(null)}
        onRegionChangeComplete={setMapRegion}
      >
        {restaurants.map((restaurant, index) => {
          if (restaurant.latitude == null || restaurant.longitude == null) return null;
          
          return (
            <Marker
              key={getRestaurantListKey(restaurant, index)}
              coordinate={{
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
              }}
              title={restaurant.name}
              description={restaurant.address}
              pinColor={markerColor(restaurant)}
              onPress={() => setPreviewRestaurant(restaurant)}
            />
          );
        })}
      </MapView>

      {hasNoResults && (
        <View style={styles.noResultsOverlay}>
          <Ionicons name="alert-circle" size={16} color={Colors.textSecondary} />
          <Text style={styles.noResultsText}>No restaurants found in this area</Text>
        </View>
      )}

      {showSearchButton && (
        <Pressable 
          style={styles.searchAreaBtn} 
          onPress={() => loadNearbyRestaurants({ latitude: mapRegion!.latitude, longitude: mapRegion!.longitude })}
        >
          <Ionicons name="search" size={16} color={Colors.textInverse} />
          <Text style={styles.searchAreaBtnText}>Search this area</Text>
        </Pressable>
      )}

      <View style={styles.summaryBar}>
        <View style={styles.summaryTitleRow}>
          <Ionicons name="map" size={18} color={Colors.primary} />
          <Text style={styles.summaryTitle}>{restaurants.length} mapped</Text>
        </View>
        <Text style={styles.summaryText} numberOfLines={1}>
          Current Explore filters are applied
        </Text>
      </View>

      {previewRestaurant ? (
        <Pressable style={styles.previewCard} onPress={() => setDetailRestaurant(previewRestaurant)}>
          <Text style={styles.previewName} numberOfLines={1}>{previewRestaurant.name}</Text>
          <Text style={styles.previewMeta} numberOfLines={1}>
            {previewMeta(previewRestaurant, useMiles)}
          </Text>
        </Pressable>
      ) : null}

      {detailRestaurant ? (
        <RestaurantDetailModal
          restaurant={detailRestaurant}
          useMiles={useMiles}
          onClose={() => setDetailRestaurant(null)}
        />
      ) : null}
    </View>
  );
}

function markerColor(restaurant: Restaurant): string {
  if (restaurant.favoriteStatus === 'safe') return Colors.success;
  if (restaurant.favoriteStatus === 'try') return Colors.warning;
  if (restaurant.favoriteStatus === 'avoid') return Colors.error;
  if (restaurant.gfMenu.length > 0 || restaurant.hasGFMenu) return Colors.primary;
  return Colors.info;
}

function previewMeta(restaurant: Restaurant, useMiles: boolean): string {
  const parts = [
    formatDistance(restaurant.distanceMeters, useMiles),

    restaurant.rating != null ? `${restaurant.rating.toFixed(1)} stars` : '',
    restaurant.openNow === true ? 'Open' : restaurant.openNow === false ? 'Closed' : '',
  ].filter(Boolean);

  return parts.join(' · ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { flex: 1 },
  summaryBar: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    opacity: 0.95,
  },
  searchAreaBtn: {
    position: 'absolute',
    top: Spacing.xl * 2, // Push below summary bar
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    gap: Spacing.xs,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  searchAreaBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  noResultsOverlay: {
    position: 'absolute',
    top: Spacing.xl * 2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
  },
  noResultsText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  summaryTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  previewCard: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  previewName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  previewMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
});

const stateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 13,
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
