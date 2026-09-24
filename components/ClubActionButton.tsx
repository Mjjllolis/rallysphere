// components/ClubActionButton.tsx - Soft blue pill/circle with a subtle glass rim (club header join/share)
import React from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

type Variant = 'primary' | 'secondary';

type Props = {
  onPress?: () => void;
  disabled?: boolean;
  isDark: boolean;
  // primary: solid soft-blue fill (main action). secondary: translucent
  // blue tint (supporting actions like share, or an already-joined state).
  variant?: Variant;
  // Square buttons render as a circle (icon-only); otherwise a pill.
  circle?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children: React.ReactNode;
};

// Tones built around the club page's address blue (#60A5FA).
const palette = {
  primary: {
    // Flat solid fill painted on the shell itself — no clipped gradient
    // layers, which blur the rounded corners.
    light: { fill: ['#62A3F0', '#62A3F0'] as const, rim: '#8DBCF5', glow: 0 },
    dark: { fill: ['#548ED2', '#548ED2'] as const, rim: '#6FA1DC', glow: 0 },
  },
  secondary: {
    light: { fill: ['rgba(96,165,250,0.16)', 'rgba(96,165,250,0.12)'] as const, rim: 'rgba(96,165,250,0.35)', glow: 0.5 },
    dark: { fill: ['rgba(96,165,250,0.18)', 'rgba(96,165,250,0.12)'] as const, rim: 'rgba(147,197,253,0.28)', glow: 0.1 },
  },
};

// Text/icon color to pair with each variant.
export const clubActionForeground = (variant: Variant, isDark: boolean) =>
  variant === 'primary' ? '#F5F9FF' : isDark ? '#BFDBFE' : '#3B82F6';

export default function ClubActionButton({
  onPress,
  disabled,
  isDark,
  variant = 'primary',
  circle,
  size = 36,
  style,
  accessibilityLabel,
  children,
}: Props) {
  const radius = size / 2;
  const tone = palette[variant][isDark ? 'dark' : 'light'];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <View
        style={[
          styles.shell,
          { height: size, borderRadius: radius, borderColor: tone.rim },
          variant === 'primary' ? { backgroundColor: tone.fill[0] } : styles.clipped,
          circle ? { width: size } : styles.pill,
        ]}
      >
        {variant === 'secondary' && (
          <>
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={tone.fill} style={StyleSheet.absoluteFill} />
            {/* Faint light along the top edge that fades into the fill */}
            <LinearGradient
              pointerEvents="none"
              colors={[`rgba(255,255,255,${tone.glow})`, 'rgba(255,255,255,0)']}
              style={[styles.glowTop, { height: size * 0.45 }]}
            />
          </>
        )}
        <View style={styles.content}>{children}</View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipped: {
    overflow: 'hidden',
  },
  pill: {
    paddingHorizontal: 16,
  },
  glowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
