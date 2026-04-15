import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Colors, Spacing, Radius } from '../theme/colors';
import { useFilters } from '../context/FiltersContext';

export default function FilterScreen() {
  const { filters, setFilters } = useFilters();

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Filter Options</Text>
        <SettingRow
          label="GF Only"
          value={filters.gfOnly}
          onToggle={() => setFilters({ gfOnly: !filters.gfOnly })}
          description="Only show restaurants with gluten-free options"
        />
        <SettingRow
          label="Open Now"
          value={filters.openNowOnly}
          onToggle={() => setFilters({ openNowOnly: !filters.openNowOnly })}
          description="Only show restaurants currently open"
        />
        <SettingRow
          label="Min Rating"
          value={filters.minRating}
          onToggle={() => setFilters({ minRating: filters.minRating >= 4.0 ? 0 : 4.0 })}
          description={`Minimum rating: ${filters.minRating === 0 ? 'Any' : filters.minRating.toFixed(1)}★`}
        />
      </View>
    </View>
  );
}

function SettingRow({ label, value, onToggle, description }: any) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primaryLight }}
        thumbColor={value ? Colors.primary : Colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingContent: { flex: 1, marginRight: Spacing.md },
  settingLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.medium },
  settingDescription: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
});