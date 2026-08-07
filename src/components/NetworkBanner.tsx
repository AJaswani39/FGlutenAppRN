import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, FontWeight, Spacing } from '../theme/colors';
import { ThemeColors, useTheme } from '../context/ThemeContext';
import { Ionicons } from './ui';

export function NetworkBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const insets = useSafeAreaInsets();
  const [animation] = useState(new Animated.Value(0));
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected === null) return;

      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setIsConnected(connected);

      Animated.timing(animation, {
        toValue: connected ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      unsubscribe();
      animation.stopAnimation();
    };
  }, [animation]);

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 0],
  });

  return (
    <Animated.View
      pointerEvents={isConnected ? 'none' : 'auto'}
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, Spacing.md),
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons name="cloud-offline" size={20} color={colors.textInverse} />
      <Text style={styles.text}>No internet connection. AI disabled.</Text>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.error,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: Spacing.md,
      zIndex: 9999,
      elevation: 9999,
    },
    text: {
      color: colors.textInverse,
      fontWeight: FontWeight.bold,
      fontSize: FontSize.sm,
      marginLeft: Spacing.sm,
    },
  });
}
