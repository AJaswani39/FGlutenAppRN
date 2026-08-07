import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { IconName, Ionicons } from '../components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

export default function SettingsScreen() {
  const { 
    useMiles, strictCeliac, dairyFree, nutFree, soyFree,
    setUseMiles, setStrictCeliac, setDairyFree, setNutFree, setSoyFree 
  } = useSettings();

  const [isDark, setIsDark] = useState(Colors.background === '#0D1117');
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleThemeToggle = async () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    try {
      await AsyncStorage.setItem('@fgluten_theme', newIsDark ? 'dark' : 'light');
      if (!isMounted.current) return;

      Alert.alert(
        'Theme Changed',
        'The app needs to reload to apply the new theme.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Reload Now', onPress: () => Updates.reloadAsync().catch(() => {}) }
        ]
      );
    } catch (error) {
      if (!isMounted.current) return;

      setIsDark(!newIsDark);
      Alert.alert(
        'Theme Not Saved',
        'Could not save your theme preference. Please try again.'
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <SettingRow
          icon="moon"
          label="Dark Mode"
          value={isDark}
          onToggle={handleThemeToggle}
          description="Requires an app reload to apply."
        />
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dietary Preferences</Text>
        <SettingRow
          icon="water"
          label="Dairy-Free"
          value={dairyFree}
          onToggle={() => setDairyFree(!dairyFree)}
          description="Highlight items without dairy/lactose"
        />
        <SettingRow
          icon="nutrition"
          label="Nut-Free"
          value={nutFree}
          onToggle={() => setNutFree(!nutFree)}
          description="Flag peanuts and tree nuts"
        />
        <SettingRow
          icon="flask"
          label="Soy-Free"
          value={soyFree}
          onToggle={() => setSoyFree(!soyFree)}
          description="Highlight items without soy/lecithin"
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
