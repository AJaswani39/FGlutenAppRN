import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { applyTheme } from './src/theme/colors';
import { getMapsApiKey } from './src/context/restaurantState';
import { CustomSplashScreen } from './src/components/CustomSplashScreen';
import { NetworkBanner } from './src/components/NetworkBanner';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { AppProviders } from './src/context/AppProviders';
import AppNavigator from './src/navigation/AppNavigator';
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
    return <CustomSplashScreen isDark={initialIsDark} onFinish={() => setBootStage('ready')} />;
  }

  return (
    <ThemeProvider initialIsDark={initialIsDark}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function AppShell() {
  const { colors, isDark } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NetworkBanner />
      <AppErrorBoundary>
        <AppProviders>
          <AppNavigator />
        </AppProviders>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
