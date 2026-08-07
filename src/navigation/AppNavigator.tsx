import React, { useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform } from 'react-native';
import { FontSize } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/HomeScreen';
import RestaurantListScreen from '../screens/RestaurantListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MapScreen from '../screens/MapScreen';
import SavedPlacesScreen from '../screens/SavedPlacesScreen';
import { RootTabParamList } from '../types/navigation';
import { IconName, Ionicons } from '../components/ui';

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ name, focused, colors }: { name: IconName; focused: boolean; colors: ThemeColors }) {
  return (
    <View style={[iconStyles.container, focused && { backgroundColor: colors.primaryLight }]}>
      <Ionicons
        name={name}
        size={20}
        color={focused ? colors.primary : colors.tabInactive}
      />
    </View>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}

function TabNavigator() {
  const { colors } = useTheme();
  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerTitleStyle: { fontWeight: '700' as const },
      headerShadowVisible: false,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 84 : 64,
        paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        paddingTop: 8,
      },
      tabBarShowLabel: true,
      tabBarLabelStyle: {
        fontSize: FontSize.xs,
      },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.tabInactive,
    }),
    [colors]
  );

  return (
    <Tab.Navigator
      screenOptions={screenOptions}
    >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'FGlutenApp',
            tabBarLabel: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="home" focused={focused} colors={colors} />
            ),
          }}
        />
      <Tab.Screen
        name="Restaurants"
        component={RestaurantListScreen}
          options={{
            title: 'Find Restaurants',
            tabBarLabel: 'Explore',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="restaurant" focused={focused} colors={colors} />
            ),
          }}
        />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Map',
          tabBarLabel: 'Map',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="map" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedPlacesScreen}
        options={{
          title: 'Saved Places',
          tabBarLabel: 'Saved',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="heart" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="settings" focused={focused} colors={colors} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const iconStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 28,
    borderRadius: 14,
  },
});
