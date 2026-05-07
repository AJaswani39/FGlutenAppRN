import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { IconName, Ionicons } from '../components/ui';

export default function SettingsScreen() {
  const { useMiles, strictCeliac, setUseMiles, setStrictCeliac } = useSettings();

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <SettingRow
          icon="speedometer"
          label="Use Miles"
          value={useMiles}
          onToggle={() => setUseMiles(!useMiles)}
          description="Show distances in miles instead of kilometers"
        />
        <SettingRow
          icon="shield-checkmark"
          label="Strict Celiac Mode"
          value={strictCeliac}
          onToggle={() => setStrictCeliac(!strictCeliac)}
          description="Only show restaurants with confirmed GF evidence or highly rated options"
        />
      </View>
    </View>
  );
}

interface SettingRowProps {
  icon: IconName;
  label: string;
  value: boolean;
  onToggle: () => void;
  description?: string;
}

function SettingRow({ icon, label, value, onToggle, description }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={19} color={Colors.primary} />
      </View>
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
  sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
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
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    marginRight: Spacing.md,
  },
  settingContent: { flex: 1, marginRight: Spacing.md },
  settingLabel: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.medium },
  settingDescription: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
});
