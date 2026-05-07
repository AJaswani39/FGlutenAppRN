import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform } from 'react-native';
import { Colors, FontSize } from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import RestaurantListScreen from '../screens/RestaurantListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MapScreen from '../screens/MapScreen';
import SavedPlacesScreen from '../screens/SavedPlacesScreen';
import { RootTabParamList } from '../types/navigation';
import { IconName, Ionicons } from '../components/ui';

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[iconStyles.container, focused && iconStyles.containerActive]}>
      <Ionicons
        name={name}
        size={20}
        color={focused ? Colors.primary : Colors.tabInactive}
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
            title: 'FGlutenApp',
            tabBarLabel: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="home" focused={focused} />
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
              <TabIcon name="restaurant" focused={focused} />
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
            <TabIcon name="map" focused={focused} />
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
            <TabIcon name="heart" focused={focused} />
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
            <TabIcon name="settings" focused={focused} />
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
  containerActive: {
    backgroundColor: Colors.primaryLight,
  },
});
