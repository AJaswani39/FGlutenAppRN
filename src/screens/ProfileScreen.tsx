import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../theme/colors';
import { useRestaurants } from '../context/RestaurantContext';

export default function ProfileScreen() {
  const { useMiles, strictCeliac, setUseMiles, setStrictCeliac, uiState } = useRestaurants();

  const stats = React.useMemo(() => {
    const restaurants = uiState.restaurants;
    let safe = 0, tryCount = 0, avoid = 0, scanned = 0;
    for (const r of restaurants) {
      if (r.favoriteStatus === 'safe') safe++;
      if (r.favoriteStatus === 'try') tryCount++;
      if (r.favoriteStatus === 'avoid') avoid++;
      if (r.menuScanStatus === 'SUCCESS') scanned++;
    }
    return { safe, try: tryCount, avoid, scanned, total: restaurants.length };
  }, [uiState.restaurants]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🌾</Text>
        </View>
        <View>
          <Text style={styles.profileName}>Guest User</Text>
          <Text style={styles.profileSub}>Gluten-Free Explorer</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard value={stats.total} label="Restaurants" color={Colors.info} />
        <StatCard value={stats.safe} label="Safe" color={Colors.success} />
        <StatCard value={stats.try} label="To Try" color={Colors.warning} />
        <StatCard value={stats.avoid} label="Avoid" color={Colors.error} />
      </View>

      {/* Settings */}
      <Section title="Preferences">
        <SettingRow
          icon="📏"
          title="Use Miles"
          subtitle="Show distances in miles instead of kilometers"
          value={useMiles}
          onToggle={() => setUseMiles(!useMiles)}
        />
        <Divider />
        <SettingRow
          icon="🧬"
          title="Strict Celiac Mode"
          subtitle="Only show restaurants with confirmed GF evidence or highly rated GF options"
          value={strictCeliac}
          onToggle={() => setStrictCeliac(!strictCeliac)}
        />
      </Section>

      {/* Scan stats */}
      <Section title="AI Menu Scanning">
        <View style={styles.scanCard}>
          <View style={styles.scanStatRow}>
            <Text style={styles.scanStatLabel}>Restaurants in cache</Text>
            <Text style={styles.scanStatValue}>{stats.total}</Text>
          </View>
          <View style={styles.scanStatRow}>
            <Text style={styles.scanStatLabel}>Menus scanned</Text>
            <Text style={[styles.scanStatValue, { color: Colors.primary }]}>{stats.scanned}</Text>
          </View>
        </View>
        <Text style={styles.scanNote}>
          FGlutenApp automatically scans restaurant websites to find gluten-free menu evidence.
          Scans expire after 3 days and refresh automatically.
        </Text>
      </Section>

      {/* About */}
      <Section title="About">
        <View style={styles.aboutCard}>
          <Text style={styles.aboutText}>
            🌾  <Text style={styles.appName}>FGlutenApp</Text>
          </Text>
          <Text style={styles.aboutSub}>React Native Edition</Text>
          <Text style={styles.aboutDesc}>
            Find gluten-free restaurant options nearby using AI-powered menu scanning,
            Google Places data, and your personal favorites tracking.
          </Text>
          <View style={styles.featureList}>
            {[
              '📍 Location-based restaurant search',
              '🤖 AI menu analysis for GF evidence',
              '❤️ Mark restaurants as Safe / Try / Avoid',
              '🔍 Smart filters by distance, rating, and hours',
              '💾 Offline cache with 3-day scan TTL',
            ].map((f, i) => (
              <Text key={`feature-${f.slice(0, 10)}-${i}`} style={styles.featureItem}>{f}</Text>
            ))}
          </View>
        </View>
      </Section>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={[statStyles.card, { borderTopColor: color }]}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={settingStyles.row}>
      <Text style={settingStyles.icon}>{icon}</Text>
      <View style={settingStyles.text}>
        <Text style={settingStyles.title}>{title}</Text>
        <Text style={settingStyles.subtitle}>{subtitle}</Text>
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

function Divider() {
  return <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28 },
  profileName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  profileSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  scanCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  scanStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanStatLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  scanStatValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  scanNote: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aboutText: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  appName: { color: Colors.primary },
  aboutSub: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  aboutDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  featureList: { gap: 6 },
  featureItem: { color: Colors.textSecondary, fontSize: FontSize.sm },
});

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 3,
  },
  value: { fontSize: FontSize.xl, fontWeight: FontWeight.extraBold },
  label: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
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

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  icon: { fontSize: 20 },
  text: { flex: 1 },
  title: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.medium },
  subtitle: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
});
