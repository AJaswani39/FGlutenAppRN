import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { AppProviders } from './src/context/AppProviders';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme/colors';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <AppProviders>
        <AppNavigator />
      </AppProviders>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1117' },
});
