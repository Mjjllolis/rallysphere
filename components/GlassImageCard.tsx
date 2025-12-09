// components/GlassImageCard.tsx
import React, { useEffect, useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';

interface GlassImageCardProps {
  imageUri: string | null;
  onImageSelected: (uri: string) => void;
  onColorsExtracted?: (colors: string[]) => void;
  aspectRatio?: [number, number];
  placeholder?: string;
}

// Predefined beautiful gradient themes
const GRADIENT_THEMES = [
  ['#6366f1', '#8b5cf6', '#d946ef'], // Purple/Pink
  ['#f59e0b', '#f97316', '#ef4444'], // Orange/Red
  ['#10b981', '#14b8a6', '#06b6d4'], // Green/Teal
  ['#3b82f6', '#6366f1', '#8b5cf6'], // Blue/Purple
  ['#ec4899', '#f43f5e', '#fb923c'], // Pink/Orange
  ['#8b5cf6', '#6366f1', '#3b82f6'], // Purple/Blue
  ['#14b8a6', '#06b6d4', '#0ea5e9'], // Teal/Blue
  ['#f97316', '#fb923c', '#fbbf24'], // Orange/Yellow
];

export default function GlassImageCard({
  imageUri,
  onImageSelected,
  onColorsExtracted,
  aspectRatio = [16, 9],
  placeholder = 'Tap to add image',
}: GlassImageCardProps) {
  const [themeIndex, setThemeIndex] = useState(0);

  // Calculate dynamic height based on aspect ratio
  // Assuming width is roughly 90% of screen (accounting for padding)
  const CARD_WIDTH = 350; // Approximate card width after padding
  const cardHeight = (CARD_WIDTH * aspectRatio[1]) / aspectRatio[0];

  useEffect(() => {
    if (imageUri && onColorsExtracted) {
      // Cycle through gradient themes when image changes
      const newIndex = (themeIndex + 1) % GRADIENT_THEMES.length;
      setThemeIndex(newIndex);
      onColorsExtracted(GRADIENT_THEMES[newIndex]);
    }
  }, [imageUri]);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera roll permissions to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: aspectRatio,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
        <View style={styles.cardWrapper}>
          <BlurView intensity={40} tint="light" style={styles.blur}>
            <View style={[styles.imageContainer, { height: cardHeight }]}>
              {imageUri ? (
                <>
                  <Image source={{ uri: imageUri }} style={styles.image} />
                  <View style={styles.overlay}>
                    <BlurView intensity={20} tint="light" style={styles.editButton}>
                      <IconButton icon="pencil" size={24} iconColor="white" />
                    </BlurView>
                  </View>
                </>
              ) : (
                <View style={styles.placeholder}>
                  <View style={styles.placeholderIcon}>
                    <IconButton icon="camera-plus" size={48} iconColor="white" />
                  </View>
                  <Text style={styles.placeholderText}>{placeholder}</Text>
                  <Text style={styles.placeholderHint}>
                    {aspectRatio[0]}:{aspectRatio[1]} recommended
                  </Text>
                </View>
              )}
            </View>
          </BlurView>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  cardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  editButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  placeholderHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
