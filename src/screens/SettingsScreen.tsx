import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { IconName, Ionicons } from '../components/ui';

export default function SettingsScreen() {
  const { 
    useMiles, strictCeliac, dairyFree, nutFree, soyFree,
    setUseMiles, setStrictCeliac, setDairyFree, setNutFree, setSoyFree 
  } = useSettings();
  const { colors, isDark, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleThemeToggle = async () => {
    try {
      await setTheme(!isDark);
    } catch (error) {
      if (!isMounted.current) return;

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
          colors={colors}
          styles={styles}
          icon="moon"
          label="Dark Mode"
          value={isDark}
          onToggle={handleThemeToggle}
        />
        <SettingRow
          colors={colors}
          styles={styles}
          icon="speedometer"
          label="Use Miles"
          value={useMiles}
          onToggle={() => setUseMiles(!useMiles)}
          description="Show distances in miles instead of kilometers"
        />
        <SettingRow
          colors={colors}
          styles={styles}
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
          colors={colors}
          styles={styles}
          icon="water"
          label="Dairy-Free"
          value={dairyFree}
          onToggle={() => setDairyFree(!dairyFree)}
          description="Highlight items without dairy/lactose"
        />
        <SettingRow
          colors={colors}
          styles={styles}
          icon="nutrition"
          label="Nut-Free"
          value={nutFree}
          onToggle={() => setNutFree(!nutFree)}
          description="Flag peanuts and tree nuts"
        />
        <SettingRow
          colors={colors}
          styles={styles}
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
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  icon: IconName;
  label: string;
  value: boolean;
  onToggle: () => void;
  description?: string;
}

function SettingRow({ colors, styles, icon, label, value, onToggle, description }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? <Text style={styles.settingDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: Spacing.md },
    section: { marginBottom: Spacing.lg },
    sectionTitle: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingIcon: {
      width: 38,
      height: 38,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryLight,
      marginRight: Spacing.md,
    },
    settingContent: { flex: 1, marginRight: Spacing.md },
    settingLabel: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.medium },
    settingDescription: { color: colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  });
}
