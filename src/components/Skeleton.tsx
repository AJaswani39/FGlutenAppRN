import React from 'react';
import { View, StyleSheet, Animated, Easing, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../theme/colors';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, style }: SkeletonProps) {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, opacity },
        style,
      ]}
    />
  );
}

export function RestaurantCardSkeleton() {
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.headerRow}>
        <Skeleton width="70%" height={18} />
        <Skeleton width={40} height={20} style={{ borderRadius: 10 }} />
      </View>
      <View style={{ marginTop: 4 }}>
        <Skeleton width="100%" height={14} />
      </View>
      <View style={cardStyles.metaRow}>
        <Skeleton width={60} height={22} style={{ borderRadius: 11 }} />
        <Skeleton width={70} height={22} style={{ borderRadius: 11 }} />
        <Skeleton width={80} height={22} style={{ borderRadius: 11 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
  },
});

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
});
