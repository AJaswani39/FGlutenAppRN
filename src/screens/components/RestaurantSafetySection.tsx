import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontSize, FontWeight, Radius, Spacing } from '../../theme/colors';
import { ThemeColors } from '../../context/ThemeContext';
import { RestaurantSafetyScore, MenuSafetyLevel } from '../../services/menuSafety';

interface Props {
  safetyScore: RestaurantSafetyScore;
  colors: ThemeColors;
}

function getSafetyMeta(level: MenuSafetyLevel, colors: ThemeColors) {
  if (level === 'safe') return { icon: '✅', color: colors.success, bg: colors.successBg };
  if (level === 'caution') return { icon: '⚠️', color: colors.warning, bg: colors.warningBg };
  if (level === 'unsafe') return { icon: '❌', color: colors.error, bg: colors.errorBg };
  return { icon: '❓', color: colors.textSecondary, bg: colors.surfaceElevated };
}

export default function RestaurantSafetySection({ safetyScore, colors }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const safety = getSafetyMeta(safetyScore.level, colors);
  const numericScore = safetyScore.level === 'unknown' ? null : safetyScore.score;

  return (
    <View style={[styles.card, { backgroundColor: safety.bg }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.value, { color: safety.color }]}>
            {numericScore == null ? '?' : numericScore}
            {numericScore == null ? null : <Text style={styles.max}>/100</Text>}
          </Text>
          <Text style={[styles.title, { color: safety.color }]}>
            {safety.icon} {safetyScore.title}
          </Text>
        </View>
        <View style={[styles.meter, { borderColor: safety.color }]}>
          <View style={[styles.meterFill, { width: `${numericScore ?? 0}%`, backgroundColor: safety.color }]} />
        </View>
      </View>
      <Text style={styles.summary}>{safetyScore.summary}</Text>
      {safetyScore.reasons.length > 0 && (
        <View style={styles.reasons}>
          {safetyScore.reasons.map((reason) => (
            <View key={reason} style={styles.reason}>
              <Text style={[styles.reasonDot, { color: safety.color }]}>•</Text>
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.sm },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    value: { fontSize: 32, fontWeight: FontWeight.extraBold },
    max: { fontSize: FontSize.sm, color: colors.textMuted },
    title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: Spacing.xs },
    meter: { width: 64, height: 64, borderRadius: Radius.full, borderWidth: 6, overflow: 'hidden', justifyContent: 'flex-end' },
    meterFill: { height: '100%' },
    summary: { color: colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20 },
    reasons: { gap: Spacing.xs },
    reason: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
    reasonDot: { fontSize: FontSize.md, lineHeight: 20 },
    reasonText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, lineHeight: 18 },
  });
}
