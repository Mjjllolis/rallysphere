// components/ActivityIndicator.tsx
// Drop-in replacement for react-native-paper's ActivityIndicator.
// Paper draws its ring as two clipped half-circles (borderRadius + overflow: hidden),
// which renders as two detached arcs on the current React Native / iOS. This draws a
// single SVG arc and rotates it, so there is nothing to clip.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from 'react-native-paper';

type Props = Omit<ViewProps, 'style'> & {
  animating?: boolean;
  color?: string;
  size?: 'small' | 'large' | number;
  hidesWhenStopped?: boolean;
  style?: StyleProp<ViewStyle>;
};

const NAMED_SIZES = { small: 20, large: 36 };
const ARC_FRACTION = 0.7;

export function ActivityIndicator({
  animating = true,
  color,
  size = 'small',
  hidesWhenStopped = true,
  style,
  ...viewProps
}: Props) {
  const theme = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animating) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animating, spin]);

  if (!animating && hidesWhenStopped) return null;

  const px = typeof size === 'number' ? size : NAMED_SIZES[size];
  const strokeWidth = Math.max(2, px / 10);
  const radius = (px - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: animating }}
      {...viewProps}
      style={[{ width: px, height: px }, style]}
    >
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <Svg width={px} height={px}>
          <Circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            stroke={color ?? theme.colors.primary}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference * ARC_FRACTION} ${circumference}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default ActivityIndicator;
