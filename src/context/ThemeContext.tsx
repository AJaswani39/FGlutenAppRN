import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { DarkColors, LightColors, applyTheme } from '../theme/colors';

const THEME_STORAGE_KEY = '@fgluten_theme';

export type ThemeColors = typeof DarkColors;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  setTheme: (nextIsDark: boolean) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function getInitialThemePreference(savedTheme: string | null): boolean {
  if (savedTheme === 'dark') return true;
  if (savedTheme === 'light') return false;
  return Appearance.getColorScheme() === 'dark';
}

export function ThemeProvider({
  children,
  initialIsDark,
}: {
  children: React.ReactNode;
  initialIsDark: boolean;
}) {
  const [isDark, setIsDark] = useState(initialIsDark);

  const setTheme = useCallback(async (nextIsDark: boolean) => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? 'dark' : 'light');
    applyTheme(nextIsDark);
    setIsDark(nextIsDark);
  }, []);

  const toggleTheme = useCallback(async () => {
    await setTheme(!isDark);
  }, [isDark, setTheme]);

  const value = useMemo(
    () => ({
      colors: isDark ? DarkColors : LightColors,
      isDark,
      setTheme,
      toggleTheme,
    }),
    [isDark, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
