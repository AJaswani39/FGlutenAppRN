import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Radius } from '../theme/colors';

interface Props {
  onFinish: () => void;
}

export function CustomSplashScreen({ onFinish }: Props) {
  const progress = useSharedValue(0);
  const finishTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Animate progress bar from 0 to 100% over 1.2 seconds
    progress.value = withTiming(
      1,
      { duration: 1200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
      (finished) => {
        if (finished) {
          // Add a tiny pause at 100% before firing onFinish
          finishTimeout.current = setTimeout(() => {
            runOnJS(onFinish)();
            finishTimeout.current = null;
          }, 150);
        }
      }
    );

    return () => {
      if (finishTimeout.current) {
        clearTimeout(finishTimeout.current);
        finishTimeout.current = null;
      }
    };
  }, []);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value * 100}%`,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.brandText}>FGluten</Text>
        <Text style={styles.tagline}>Safe dining, simplified</Text>
      </View>

      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, progressStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  brandText: {
    color: Colors.primary,
    fontSize: FontSize.display,
    fontWeight: FontWeight.extraBold,
    letterSpacing: 2,
    marginBottom: 8,
  },
  tagline: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.5,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 80,
    width: '60%',
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
});
