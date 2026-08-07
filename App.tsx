import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { applyTheme } from './src/theme/colors';
import { getMapsApiKey } from './src/context/restaurantState';
import { CustomSplashScreen } from './src/components/CustomSplashScreen';
import { ThemeProvider, getInitialThemePreference, useTheme } from './src/context/ThemeContext';

// Keep splash screen visible while we load theme from storage
void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  if (__DEV__) {
    console.warn('[FGluten] Failed to keep native splash visible:', error);
  }
});

if (__DEV__ && !getMapsApiKey()) {
  console.warn('[FGluten] MAPS_API_KEY is missing. Add GCP_API_KEY to your .env file.');
}

type BootStage = 'init' | 'animating' | 'ready';

export default function App() {
  const [bootStage, setBootStage] = useState<BootStage>('init');
  const [initialIsDark, setInitialIsDark] = useState(true);

  useEffect(() => {
    async function initTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem('@fgluten_theme');
        const isDark = getInitialThemePreference(savedTheme);
        setInitialIsDark(isDark);
        applyTheme(isDark);
      } catch (err) {
        // Fallback to dark
        applyTheme(true);
        setInitialIsDark(true);
      } finally {
        // Theme is loaded, proceed to custom JS splash animation
        setBootStage('animating');
        // We can now safely hide the native splash screen, transitioning instantly 
        // to our custom JS splash screen which matches the newly loaded theme!
        void SplashScreen.hideAsync().catch((error: unknown) => {
          if (__DEV__) {
            console.warn('[FGluten] Failed to hide native splash:', error);
          }
        });
      }
    }
    initTheme();
  }, []);

  if (bootStage === 'init') {
    return null; // Native splash screen is still visible
  }

  if (bootStage === 'animating') {
    return <CustomSplashScreen onFinish={() => setBootStage('ready')} />;
  }

  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { GestureHandlerRootView } = require('react-native-gesture-handler');
  const { StatusBar } = require('expo-status-bar');
  const { NetworkBanner } = require('./src/components/NetworkBanner');
  const { AppErrorBoundary } = require('./src/components/AppErrorBoundary');
  const { AppProviders } = require('./src/context/AppProviders');
  const AppNavigator = require('./src/navigation/AppNavigator').default;

  return (
    <ThemeProvider initialIsDark={initialIsDark}>
      <SafeAreaProvider>
        <ThemedAppShell
          GestureHandlerRootView={GestureHandlerRootView}
          StatusBar={StatusBar}
          NetworkBanner={NetworkBanner}
          AppErrorBoundary={AppErrorBoundary}
          AppProviders={AppProviders}
          AppNavigator={AppNavigator}
        />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function ThemedAppShell({
  GestureHandlerRootView,
  StatusBar,
  NetworkBanner,
  AppErrorBoundary,
  AppProviders,
  AppNavigator,
}: {
  GestureHandlerRootView: React.ComponentType<{ style: object; children: React.ReactNode }>;
  StatusBar: React.ComponentType<{ style: 'light' | 'dark'; backgroundColor: string }>;
  NetworkBanner: React.ComponentType;
  AppErrorBoundary: React.ComponentType<{ children: React.ReactNode }>;
  AppProviders: React.ComponentType<{ children: React.ReactNode }>;
  AppNavigator: React.ComponentType;
}) {
  const { colors, isDark } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <NetworkBanner />
      <AppErrorBoundary>
        <AppProviders>
          <AppNavigator />
        </AppProviders>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
