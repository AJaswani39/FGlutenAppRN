import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AppProviders } from './src/context/AppProviders';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme/colors';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { NetworkBanner } from './src/components/NetworkBanner';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getMapsApiKey } from './src/context/restaurantState';

if (__DEV__ && !getMapsApiKey()) {
  console.warn('[FGluten] MAPS_API_KEY is missing. Add GCP_API_KEY to your .env file.');
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" backgroundColor={Colors.background} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1117' },
});
