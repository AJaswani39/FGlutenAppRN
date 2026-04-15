import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { Colors, FontSize } from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import RestaurantListScreen from '../screens/RestaurantListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FilterScreen from '../screens/FilterScreen';
import RestaurantDetailScreen from '../screens/RestaurantDetailScreen';
import { RootTabParamList, RootStackParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={iconStyles.container}>
      <Text style={[iconStyles.emoji, focused && iconStyles.emojiActive]}>{emoji}</Text>
      {focused && <Text style={iconStyles.dot}>•</Text>}
    </View>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function FilterStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Filters" component={FilterScreen} />
    </Stack.Navigator>
  );
}

function DetailStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="RestaurantDetail" component={RestaurantDetailScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AppTabs" component={TabNavigator} />
        <Stack.Screen name="Details" component={DetailStack} />
      </Stack.Navigator>
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
            <TabIcon emoji="🏠" label="Home" focused={focused} />
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
            <TabIcon emoji="🍽️" label="Explore" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Filter"
        component={FilterStack}
        options={{
          title: 'Filter',
          tabBarLabel: 'Filter',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⚙️" label="Filter" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⚙️" label="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
