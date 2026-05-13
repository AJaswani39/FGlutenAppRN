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
import { formatDistance } from '../../util/formatters';

import { getGfConfidenceLevel, isSameRestaurantIdentity } from '../../util/restaurantUtils';
import { useRestaurants } from '../../context/RestaurantContext';
import { useSettings } from '../../context/SettingsContext';
import { logger } from '../../util/logger';
import { IconName, Ionicons } from '../../components/ui';
import { getRestaurantSafetyScore, MenuSafetyLevel } from '../../services/menuSafety';
import { getDiningChecklist } from '../../services/diningChecklist';
import { getCuisineRiskHints } from '../../services/cuisineRiskHints';
import MenuAnalysisSheet from './MenuAnalysisSheet';

interface Props {
  restaurant: Restaurant;
  useMiles: boolean;
  onClose: () => void;
}

export default function RestaurantDetailModal({ restaurant: initial, useMiles, onClose }: Props) {
  const { uiState, savedRestaurants, setFavoriteStatus, requestMenuRescan } = useRestaurants();
  const { strictCeliac } = useSettings();
  const [showAI, setShowAI] = useState(false);

  if (!initial) return null;

  // Keep the displayed restaurant in sync with ViewModel updates
  const restaurant =
    uiState.restaurants.find((r) => isSameRestaurantIdentity(r, initial)) ??
    savedRestaurants.find((r) => isSameRestaurantIdentity(r, initial)) ??
    initial;

  const dist = formatDistance(restaurant.distanceMeters, useMiles);

  const safeMenuUrl = getSafeExternalUrl(restaurant.menuUrl);
  const confidence = confidenceMeta(restaurant);
  const safetyScore = getRestaurantSafetyScore(restaurant, { strictCeliac });
  const safety = safetyMeta(safetyScore.level);
  const diningChecklist = getDiningChecklist(restaurant, {
    strictCeliac,
    safetyLevel: safetyScore.level,
  });
  const cuisineRiskHints = getCuisineRiskHints(restaurant);

  const mapsUrl = Platform.select({
    ios: `maps://app?daddr=${restaurant.latitude},${restaurant.longitude}`,
    android: `geo:${restaurant.latitude},${restaurant.longitude}?q=${encodeURIComponent(restaurant.name)}`,
  });

  const openMaps = () => {
    if (mapsUrl) {
      void Linking.openURL(mapsUrl).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to open maps link: ${message}`);
      });
    }
  };

  const openMenu = () => {
    if (safeMenuUrl) {
      void Linking.openURL(safeMenuUrl).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to open menu link: ${message}`);
      });
    }
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

  const buildAiText = (): string | null => {
    if (restaurant.rawMenuText) return restaurant.rawMenuText;
    if (restaurant.gfMenu.length > 0) return restaurant.gfMenu.join('\n');
    return null;
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

          <Section title="Safety Score">
            <View style={[styles.safetyScoreCard, { backgroundColor: safety.bg }]}>
              <View style={styles.safetyScoreHeader}>
                <View>
                  <Text style={[styles.safetyScoreValue, { color: safety.color }]}>
                    {safetyScore.score}
                    <Text style={styles.safetyScoreMax}>/100</Text>
                  </Text>
                  <Text style={[styles.safetyScoreTitle, { color: safety.color }]}>
                    {safety.icon} {safetyScore.title}
                  </Text>
                </View>
                <View style={[styles.safetyMeter, { borderColor: safety.color }]}>
                  <View
                    style={[
                      styles.safetyMeterFill,
                      {
                        width: `${safetyScore.score}%`,
                        backgroundColor: safety.color,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.safetyScoreSummary}>{safetyScore.summary}</Text>
              {safetyScore.reasons.length > 0 && (
                <View style={styles.safetyReasons}>
                  {safetyScore.reasons.map((reason) => (
                    <View key={reason} style={styles.safetyReason}>
                      <Text style={[styles.safetyReasonDot, { color: safety.color }]}>•</Text>
                      <Text style={styles.safetyReasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Section>

          <Section title="Ask Before You Eat">
            <View style={styles.checklistCard}>
              {diningChecklist.map((item) => (
                <View key={item.id} style={styles.checklistItem}>
                  <View
                    style={[
                      styles.checklistPriority,
                      {
                        backgroundColor: item.priority === 'high' ? Colors.warningBg : Colors.infoBg,
                        borderColor: item.priority === 'high' ? Colors.warning : Colors.info,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.priority === 'high' ? 'alert-circle' : 'chatbubble-ellipses'}
                      size={15}
                      color={item.priority === 'high' ? Colors.warning : Colors.info}
                    />
                  </View>
                  <View style={styles.checklistTextGroup}>
                    <Text style={styles.checklistQuestion}>{item.question}</Text>
                    <Text style={styles.checklistNote}>{item.note}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Cuisine Risk Hints">
            <View style={styles.riskHintsGrid}>
              {cuisineRiskHints.map((hint) => {
                const color = hint.tone === 'warning' ? Colors.warning : Colors.info;
                const bg = hint.tone === 'warning' ? Colors.warningBg : Colors.infoBg;
                return (
                  <View key={hint.id} style={styles.riskHintCard}>
                    <View style={styles.riskHintHeader}>
                      <View style={[styles.riskHintIcon, { backgroundColor: bg, borderColor: color }]}>
                        <Ionicons
                          name={hint.tone === 'warning' ? 'warning' : 'information-circle'}
                          size={15}
                          color={color}
                        />
                      </View>
                      <Text style={styles.riskHintLabel}>{hint.label}</Text>
                    </View>
                    <Text style={styles.riskHintText}>{hint.risk}</Text>
                    <Text style={[styles.riskHintAsk, { color }]}>Ask: {hint.saferAsk}</Text>
                  </View>
                );
              })}
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
                icon="map"
                label="Open in Maps"
                onPress={openMaps}
                disabled={!mapsUrl}
                primary
              />
              <ActionButton
                icon="globe"
                label="View Menu"
                onPress={openMenu}
                disabled={!safeMenuUrl}
              />
              <ActionButton
                icon="scan"
                label="Rescan Menu"
                onPress={handleRescan}
                disabled={!restaurant.placeId || restaurant.menuScanStatus === 'FETCHING'}
              />
              <ActionButton
                icon="sparkles"
                label="AI Analysis"
                onPress={() => setShowAI(true)}
                disabled={!buildAiText()}
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
          menuText={buildAiText() ?? ''}
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

function safetyMeta(level: MenuSafetyLevel) {
  if (level === 'safe') {
    return { icon: '✅', color: Colors.success, bg: Colors.successBg };
  }
  if (level === 'caution') {
    return { icon: '⚠️', color: Colors.warning, bg: Colors.warningBg };
  }
  if (level === 'unsafe') {
    return { icon: '❌', color: Colors.error, bg: Colors.errorBg };
  }

  return { icon: '❓', color: Colors.textSecondary, bg: Colors.surfaceElevated };
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
  icon: IconName;
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
      <Ionicons
        name={icon}
        size={17}
        color={disabled ? Colors.textMuted : primary ? Colors.primary : Colors.textSecondary}
      />
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
  safetyScoreCard: {
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  safetyScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  safetyScoreValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extraBold,
  },
  safetyScoreMax: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  safetyScoreTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    marginTop: 2,
  },
  safetyMeter: {
    flex: 1,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  safetyMeterFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  safetyScoreSummary: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  safetyReasons: {
    marginTop: Spacing.sm,
    gap: 4,
  },
  safetyReason: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  safetyReasonDot: {
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  safetyReasonText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  checklistCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  checklistPriority: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checklistTextGroup: {
    flex: 1,
  },
  checklistQuestion: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    lineHeight: 19,
  },
  checklistNote: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 17,
    marginTop: 3,
  },
  riskHintsGrid: {
    gap: Spacing.sm,
  },
  riskHintCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  riskHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  riskHintIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskHintLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  riskHintText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  riskHintAsk: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    lineHeight: 17,
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
  label: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  primaryLabel: { color: Colors.primary },
  disabledLabel: { color: Colors.textMuted },
  pressedBtn: { opacity: 0.75 },
});
