import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemeColors, useTheme } from '../../context/ThemeContext';
import { Restaurant } from '../../types/restaurant';
import { MenuAnalysisResult } from '../../services/menuSafety';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  restaurant: Restaurant;
  analysis: MenuAnalysisResult;
  allergens: string[];
}

const CARD_WIDTH = 1080; // Instagram Story / Post standard width
const CARD_HEIGHT = 1350; // 4:5 aspect ratio

export default function SafetyScorecard({ restaurant, analysis, allergens }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safetyColor =
    analysis.overallSafety === 'safe'
      ? colors.success
      : analysis.overallSafety === 'caution'
      ? colors.warning
      : colors.error;

  return (
    <View style={styles.card}>
      {/* Background Decor */}
      <View style={styles.topBlur} />
      <View style={styles.bottomBlur} />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoCircle}>
            <Ionicons name="leaf" size={40} color={colors.primary} />
          </View>
          <Text style={styles.brandName}>FGLUTEN AI</Text>
        </View>
        <Text style={styles.verifiedTag}>OFFICIALLY VERIFIED SAFETY CARD</Text>
      </View>

      <View style={styles.mainContent}>
        <Text style={styles.restaurantName} numberOfLines={2}>
          {restaurant.name}
        </Text>
        <Text style={styles.restaurantAddress} numberOfLines={1}>
          {restaurant.address}
        </Text>

        <View style={styles.scoreContainer}>
          <View style={[styles.scoreCircle, { borderColor: safetyColor }]}>
            <Text style={[styles.scoreValue, { color: safetyColor }]}>{analysis.score}</Text>
            <Text style={styles.scoreLabel}>SAFETY SCORE</Text>
          </View>
          <View style={styles.statusBox}>
            <Text style={[styles.statusText, { color: safetyColor }]}>
              {analysis.overallSafety.toUpperCase()}
            </Text>
            <Text style={styles.statusDescription}>{analysis.summary}</Text>
          </View>
        </View>

        {allergens.length > 0 && (
          <View style={styles.allergenPills}>
            {allergens.map((a) => (
              <View key={a} style={styles.allergenPill}>
                <Text style={styles.allergenPillText}>{a.toUpperCase()} SAFE</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={styles.sectionTitle}>RECOMMENDED DISHES</Text>
          </View>
          <View style={styles.itemsList}>
            {(analysis.safeItems ?? []).slice(0, 5).map((item, i) => (
              <Text key={i} style={styles.itemText}>
                • {item}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Scanned via FGluten AI • fgluten.io</Text>
        <Text style={styles.disclaimer}>
          Analysis based on AI menu scanning. Always verify with staff.
        </Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: colors.background,
      padding: 80,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    topBlur: {
      position: 'absolute',
      top: -200,
      right: -200,
      width: 600,
      height: 600,
      borderRadius: 300,
      backgroundColor: colors.primary,
      opacity: 0.1,
    },
    bottomBlur: {
      position: 'absolute',
      bottom: -200,
      left: -200,
      width: 600,
      height: 600,
      borderRadius: 300,
      backgroundColor: colors.success,
      opacity: 0.05,
    },
    header: {
      alignItems: 'center',
      gap: 20,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
    },
    logoCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    brandName: {
      color: colors.textPrimary,
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: 4,
    },
    verifiedTag: {
      color: colors.primary,
      fontSize: 24,
      fontWeight: 'bold',
      letterSpacing: 2,
      borderWidth: 2,
      borderColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 8,
      borderRadius: 8,
    },
    mainContent: {
      flex: 1,
      justifyContent: 'center',
      gap: 40,
    },
    restaurantName: {
      color: colors.textPrimary,
      fontSize: 84,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 96,
    },
    restaurantAddress: {
      color: colors.textSecondary,
      fontSize: 32,
      textAlign: 'center',
      marginTop: -20,
    },
    scoreContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 60,
      marginVertical: 40,
    },
    scoreCircle: {
      width: 240,
      height: 240,
      borderRadius: 120,
      borderWidth: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    scoreValue: {
      fontSize: 100,
      fontWeight: '900',
    },
    scoreLabel: {
      color: colors.textMuted,
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: -10,
    },
    statusBox: {
      flex: 1,
      gap: 12,
    },
    statusText: {
      fontSize: 56,
      fontWeight: '900',
    },
    statusDescription: {
      color: colors.textSecondary,
      fontSize: 28,
      lineHeight: 38,
    },
    allergenPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 20,
    },
    allergenPill: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 40,
    },
    allergenPillText: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: 'bold',
    },
    section: {
      backgroundColor: colors.surface,
      padding: 48,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
      marginBottom: 24,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 32,
      fontWeight: 'bold',
      letterSpacing: 1,
    },
    itemsList: {
      gap: 16,
    },
    itemText: {
      color: colors.textSecondary,
      fontSize: 36,
      fontWeight: '500',
    },
    footer: {
      alignItems: 'center',
      gap: 12,
    },
    footerText: {
      color: colors.primary,
      fontSize: 28,
      fontWeight: 'bold',
    },
    disclaimer: {
      color: colors.textMuted,
      fontSize: 20,
      textAlign: 'center',
    },
  });
}
