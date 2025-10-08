import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  backgroundColor?: string;
}

export default function BackButton({
  onPress,
  color = 'white',
  backgroundColor = 'rgba(255,255,255,0.2)'
}: BackButtonProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.backButton, { backgroundColor }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name="arrow-left" size={24} color={color} />
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
