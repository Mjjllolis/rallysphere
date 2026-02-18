import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useThemeToggle } from '../app/_layout';
import { router } from 'expo-router';

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  backgroundColor?: string;
}

export default function BackButton({
  onPress,
  color,
  backgroundColor
}: BackButtonProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const resolvedColor = color ?? theme.colors.onSurface;
  const resolvedBackgroundColor = backgroundColor ?? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)');

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.backButton, { backgroundColor: resolvedBackgroundColor }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name="arrow-left" size={24} color={resolvedColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
