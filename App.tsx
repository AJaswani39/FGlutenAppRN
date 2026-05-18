import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { Colors, applyTheme } from './src/theme/colors';
import { getMapsApiKey } from './src/context/restaurantState';

// Keep splash screen visible while we load theme from storage
SplashScreen.preventAutoHideAsync();

if (__DEV__ && !getMapsApiKey()) {
  console.warn('[FGluten] MAPS_API_KEY is missing. Add GCP_API_KEY to your .env file.');
}

export default function App() {
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);

  useEffect(() => {
    async function initTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem('@fgluten_theme');
        const systemDark = Appearance.getColorScheme() === 'dark';
        const isDark = savedTheme ? savedTheme === 'dark' : systemDark;
        applyTheme(isDark);
      } catch (err) {
        // Fallback to dark
        applyTheme(true);
      } finally {
        setIsThemeLoaded(true);
        SplashScreen.hideAsync();
      }
    }
    initTheme();
  }, []);

  if (!isThemeLoaded) {
    return null;
  }

  // ─── DYNAMIC IMPORTS ──────────────────────────────────────────────────────────
  // By requiring these *after* applyTheme() is called, all static StyleSheet.create
  // calls inside these files will capture the correct Light/Dark Colors values.
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { GestureHandlerRootView } = require('react-native-gesture-handler');
  const { StatusBar } = require('expo-status-bar');
  const { NetworkBanner } = require('./src/components/NetworkBanner');
  const { AppErrorBoundary } = require('./src/components/AppErrorBoundary');
  const { AppProviders } = require('./src/context/AppProviders');
  const AppNavigator = require('./src/navigation/AppNavigator').default;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
        <StatusBar style={Colors.background === '#0D1117' ? 'light' : 'dark'} backgroundColor={Colors.background} />
        <NetworkBanner />
        <AppErrorBoundary>
          <AppProviders>
            <AppNavigator />
          </AppProviders>
        </AppErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
