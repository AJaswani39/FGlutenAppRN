import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';
import { useSettings } from '../context/SettingsContext';
import { Restaurant } from '../types/restaurant';
import { formatDistance } from '../util/formatters';

import RestaurantDetailModal from './components/RestaurantDetailModal';
import { getRestaurantListKey } from '../util/restaurantUtils';
import { Ionicons, StateMessage } from '../components/ui';

export default function MapScreen() {
  const { uiState, loadNearbyRestaurants } = useRestaurants();
  const { useMiles } = useSettings();
  const [previewRestaurant, setPreviewRestaurant] = useState<Restaurant | null>(null);
  const [detailRestaurant, setDetailRestaurant] = useState<Restaurant | null>(null);

  const restaurants = uiState.restaurants;
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

  if (!initialRegion || restaurants.length === 0) {
    return (
      <View style={stateStyles.container}>
        <StateMessage
          icon={uiState.status === 'permission_required' ? 'navigate-circle' : 'map'}
          title={uiState.status === 'permission_required' ? 'Location needed' : 'Map is empty'}
          message={uiState.message ?? 'Search nearby restaurants to show them on the map.'}
          actionLabel={uiState.status === 'permission_required' ? 'Enable Location' : 'Find Restaurants'}
          onAction={loadNearbyRestaurants}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={uiState.userLatitude != null && uiState.userLongitude != null}
        showsMyLocationButton
      >
        {restaurants.map((restaurant) => (
          <Marker
            key={getRestaurantListKey(restaurant)}
            coordinate={{
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
            }}
            title={restaurant.name}
            description={restaurant.address}
            pinColor={markerColor(restaurant)}
            onPress={() => setPreviewRestaurant(restaurant)}
          />
        ))}
      </MapView>

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
