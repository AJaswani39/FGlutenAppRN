import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { Colors, FontSize } from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import RestaurantListScreen from '../screens/RestaurantListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FilterScreen from '../screens/FilterScreen';
import { RootTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={iconStyles.container}>
      <Text style={[iconStyles.emoji, focused && iconStyles.emojiActive]}>{emoji}</Text>
      {focused && <Text style={iconStyles.dot}>•</Text>}
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
      }}
    >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: '🌾 FGlutenApp',
            tabBarLabel: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon emoji="🏠" focused={focused} />
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
              <TabIcon emoji="🍽️" focused={focused} />
            ),
          }}
        />
      <Tab.Screen
        name="Filter"
        component={FilterScreen}
        options={{
          title: 'Filters',
          tabBarLabel: 'Filter',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⚙️" focused={focused} />
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
            <TabIcon emoji="⚙️" focused={focused} />
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
    minWidth: 28,
  },
  emoji: {
    fontSize: 18,
    opacity: 0.8,
  },
  emojiActive: {
    opacity: 1,
  },
  dot: {
    color: Colors.primary,
    fontSize: 10,
    lineHeight: 10,
    marginTop: -1,
  },
});
