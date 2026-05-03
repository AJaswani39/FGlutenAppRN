import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/colors';
import { Restaurant, FavoriteStatus } from '../../types/restaurant';
import { SettingsManager } from '../../util/SettingsManager';
import { getGfConfidenceLevel } from '../../util/restaurantUtils';
import { useRestaurants } from '../../context/RestaurantContext';
import MenuAnalysisSheet from './MenuAnalysisSheet';

interface Props {
  restaurant: Restaurant;
  useMiles: boolean;
  onClose: () => void;
}

export default function RestaurantDetailModal({ restaurant: initial, useMiles, onClose }: Props) {
  const { uiState, savedRestaurants, setFavoriteStatus, requestMenuRescan } = useRestaurants();
  const [showAI, setShowAI] = useState(false);

  // Keep the displayed restaurant in sync with ViewModel updates
  const restaurant =
    uiState.restaurants.find((r) => r.placeId === initial.placeId) ??
    savedRestaurants.find((r) => r.placeId === initial.placeId) ??
    initial;

  const dist = SettingsManager.formatDistance(restaurant.distanceMeters, useMiles);
  const safeMenuUrl = getSafeExternalUrl(restaurant.menuUrl);
  const confidence = confidenceMeta(restaurant);

  const openMaps = () => {
    const url = Platform.select({
      ios: `maps://app?daddr=${restaurant.latitude},${restaurant.longitude}`,
      android: `geo:${restaurant.latitude},${restaurant.longitude}?q=${encodeURIComponent(restaurant.name)}`,
    });
    if (url) Linking.openURL(url);
  };

  const openMenu = () => {
    if (safeMenuUrl) Linking.openURL(safeMenuUrl);
  };

  const handleFav = (status: FavoriteStatus) => {
    if (restaurant.favoriteStatus === status) {
      setFavoriteStatus(restaurant, null);
    } else {
      setFavoriteStatus(restaurant, status);
    }
  };

  const handleRescan = () => {
    requestMenuRescan(restaurant);
  };

  const buildAiText = (): string => {
    if (restaurant.rawMenuText) return restaurant.rawMenuText;
    if (restaurant.gfMenu.length > 0) return restaurant.gfMenu.join('\n');
    return `Menu scan results for ${restaurant.name}`;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Handle + close */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Name & address */}
          <Text style={styles.name}>{restaurant.name}</Text>
          <Text style={styles.address}>{restaurant.address}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            {restaurant.rating != null && (
              <MetaPill bg={Colors.surfaceElevated}>
                ⭐ {restaurant.rating.toFixed(1)}
              </MetaPill>
            )}
            {restaurant.openNow != null && (
              <MetaPill
                bg={restaurant.openNow ? Colors.successBg : Colors.errorBg}
                color={restaurant.openNow ? Colors.success : Colors.error}
              >
                {restaurant.openNow ? '🟢 Open' : '🔴 Closed'}
              </MetaPill>
            )}
            {dist !== '' && (
              <MetaPill bg={Colors.surfaceElevated}>📍 {dist}</MetaPill>
            )}
          </View>

          {/* GF status */}
          <Section title="Gluten-Free Status">
            <View style={[styles.gfCard, { backgroundColor: confidence.bg }]}>
              <Text style={[styles.gfCardTitle, { color: confidence.color }]}>
                {confidence.icon} {confidence.title}
              </Text>
              <Text style={styles.gfCardBody}>{confidence.description}</Text>
            </View>
          </Section>

          {/* Menu scan status */}
          <Section title="Menu Scan">
            <View style={styles.scanRow}>
              <Text style={styles.scanStatus}>{menuStatusText(restaurant)}</Text>
              {restaurant.menuScanStatus === 'FETCHING' && (
                <ActivityIndicator size="small" color={Colors.primary} />
              )}
            </View>

            {restaurant.gfMenu.length > 0 && (
              <View style={styles.menuItems}>
                {restaurant.gfMenu.map((item, i) => (
                  <View key={`${item}-${i}`} style={styles.menuItem}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.menuItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* Favorite toggle */}
          <Section title="My Status">
            <View style={styles.favRow}>
              <FavButton
                label="✅ Safe"
                status="safe"
                current={restaurant.favoriteStatus}
                onPress={() => handleFav('safe')}
              />
              <FavButton
                label="⚠️ Try"
                status="try"
                current={restaurant.favoriteStatus}
                onPress={() => handleFav('try')}
              />
              <FavButton
                label="❌ Avoid"
                status="avoid"
                current={restaurant.favoriteStatus}
                onPress={() => handleFav('avoid')}
              />
            </View>
          </Section>

          {/* Action buttons */}
          <Section title="Actions">
            <View style={styles.actionsGrid}>
              <ActionButton
                icon="🗺️"
                label="Open in Maps"
                onPress={openMaps}
                primary
              />
              <ActionButton
                icon="🌐"
                label="View Menu"
                onPress={openMenu}
                disabled={!safeMenuUrl}
              />
              <ActionButton
                icon="🔍"
                label="Rescan Menu"
                onPress={handleRescan}
                disabled={!restaurant.placeId || restaurant.menuScanStatus === 'FETCHING'}
              />
              <ActionButton
                icon="🤖"
                label="AI Analysis"
                onPress={() => setShowAI(true)}
                primary
              />
            </View>
          </Section>
        </ScrollView>
      </View>

      {/* AI Analysis Sheet */}
      {showAI && (
        <MenuAnalysisSheet
          restaurantName={restaurant.name}
          menuText={buildAiText()}
          onClose={() => setShowAI(false)}
        />
      )}
    </Modal>
  );
}

function getSafeExternalUrl(url: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  return trimmed;
}

function confidenceMeta(restaurant: Restaurant) {
  const level = getGfConfidenceLevel(restaurant);
  switch (level) {
    case 'confirmed':
      return {
        icon: '✅',
        title: 'Confirmed GF evidence',
        description:
          restaurant.gfMenu.length >= 3
            ? 'Multiple gluten-free menu references were found during the latest scan.'
            : 'Gluten-free menu evidence was found during the latest scan.',
        color: Colors.success,
        bg: Colors.successBg,
      };
    case 'name_match':
      return {
        icon: '🌾',
        title: 'Name suggests GF',
        description: 'The restaurant name suggests gluten-free options, but menu evidence is not confirmed yet.',
        color: Colors.warning,
        bg: Colors.warningBg,
      };
    case 'no_evidence':
      return {
        icon: '🔎',
        title: 'No GF evidence found',
        description: 'The menu scan completed, but no specific gluten-free items or claims were found.',
        color: Colors.textSecondary,
        bg: Colors.surfaceElevated,
      };
    case 'unavailable':
      return {
        icon: '⚠️',
        title: 'Menu evidence unavailable',
        description: 'The app could not inspect a menu for this restaurant. Ask staff before relying on it.',
        color: Colors.warning,
        bg: Colors.warningBg,
      };
    default:
      return {
        icon: '⏳',
        title: 'Awaiting menu scan',
        description: 'The app has not finished checking this restaurant for gluten-free menu evidence.',
        color: Colors.info,
        bg: Colors.infoBg,
      };
  }
}

function menuStatusText(r: Restaurant): string {
  switch (r.menuScanStatus) {
    case 'FETCHING': return '🔄 Scanning menu…';
    case 'SUCCESS':
      return r.gfMenu.length > 0
        ? `✅ Scanned — ${r.gfMenu.length} GF item${r.gfMenu.length !== 1 ? 's' : ''} found`
        : '✅ Scanned — no specific GF items found';
    case 'NO_WEBSITE': return '🌐 No website found';
    case 'FAILED': return '⚠️ Could not load menu';
    default: return '⏳ Not yet scanned';
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function MetaPill({
  children,
  bg,
  color,
}: {
  children: React.ReactNode;
  bg: string;
  color?: string;
}) {
  return (
    <View style={[pillStyles.pill, { backgroundColor: bg }]}>
      <Text style={[pillStyles.text, color ? { color } : {}]}>{children}</Text>
    </View>
  );
}

function FavButton({
  label,
  status,
  current,
  onPress,
}: {
  label: string;
  status: FavoriteStatus;
  current: FavoriteStatus;
  onPress: () => void;
}) {
  const active = current === status;
  return (
    <Pressable
      style={[
        favStyles.btn,
        active && {
          backgroundColor:
            status === 'safe'
              ? Colors.successBg
              : status === 'try'
              ? Colors.warningBg
              : Colors.errorBg,
          borderColor:
            status === 'safe'
              ? Colors.success
              : status === 'try'
              ? Colors.warning
              : Colors.error,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          favStyles.label,
          active && {
            color:
              status === 'safe'
                ? Colors.success
                : status === 'try'
                ? Colors.warning
                : Colors.error,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        actionStyles.btn,
        primary && actionStyles.primaryBtn,
        disabled && actionStyles.disabledBtn,
        pressed && !disabled && actionStyles.pressedBtn,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={actionStyles.icon}>{icon}</Text>
      <Text style={[actionStyles.label, primary && actionStyles.primaryLabel, disabled && actionStyles.disabledLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
  },
  closeBtn: {
    position: 'absolute',
    right: Spacing.md,
    width: 32,
    height: 32,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeBtnText: { color: Colors.textSecondary, fontSize: 13 },
  content: { padding: Spacing.md, paddingBottom: 60 },
  name: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  address: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  gfCard: {
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  gfCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  gfCardBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  scanStatus: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  menuItems: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  menuItem: { flexDirection: 'row', gap: Spacing.sm },
  bulletDot: { color: Colors.primary, fontSize: FontSize.md, lineHeight: 20 },
  menuItemText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  favRow: { flexDirection: 'row', gap: Spacing.sm },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});

const sectionStyles = StyleSheet.create({
  container: { marginBottom: Spacing.lg },
  title: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
});

const pillStyles = StyleSheet.create({
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  text: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});

const favStyles = StyleSheet.create({
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});

const actionStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: '47%',
  },
  primaryBtn: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  disabledBtn: { opacity: 0.4 },
  icon: { fontSize: 16 },
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  primaryLabel: { color: Colors.primary },
  disabledLabel: { color: Colors.textMuted },
  pressedBtn: { opacity: 0.75 },
});
