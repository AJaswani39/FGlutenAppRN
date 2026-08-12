import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { FontSize, FontWeight, Radius, Spacing } from '../../theme/colors';
import { ThemeColors } from '../../context/ThemeContext';
import { Restaurant } from '../../types/restaurant';

interface Props {
  restaurant: Restaurant;
  colors: ThemeColors;
}

function getMenuStatusText(restaurant: Restaurant): string {
  switch (restaurant.menuScanStatus) {
    case 'FETCHING': return '🔄 Scanning menu…';
    case 'SUCCESS':
      return restaurant.gfMenu.length > 0
        ? `✅ Scanned — ${restaurant.gfMenu.length} GF item${restaurant.gfMenu.length !== 1 ? 's' : ''} found`
        : '✅ Scanned — no specific GF items found';
    case 'NO_MENU_CONTENT': return '⚠️ Page loaded — no menu content found';
    case 'JS_ONLY': return '🌐 Menu requires an interactive website';
    case 'NO_WEBSITE': return '🌐 No website found';
    case 'FAILED': return '⚠️ Could not load menu';
    default: return '⏳ Not yet scanned';
  }
}

export default function RestaurantMenuEvidence({ restaurant, colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <View style={styles.statusRow}>
        <Text style={styles.status}>{getMenuStatusText(restaurant)}</Text>
        {restaurant.menuScanStatus === 'FETCHING' && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
      {restaurant.gfMenu.length > 0 && (
        <View style={styles.items}>
          {restaurant.gfMenu.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.item}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    status: { color: colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
    items: { marginTop: Spacing.sm, gap: Spacing.xs },
    item: { flexDirection: 'row', gap: Spacing.sm },
    bullet: { color: colors.primary, fontSize: FontSize.md, lineHeight: 20 },
    itemText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  });
}
