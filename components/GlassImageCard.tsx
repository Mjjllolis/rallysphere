// components/GlassImageCard.tsx
import React, { useEffect, useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useThemeToggle } from '../app/_layout';

interface GlassImageCardProps {
  imageUri: string | null;
  onImageSelected: (uri: string) => void;
  onColorsExtracted?: (colors: string[], imageUri?: string) => void;
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
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [themeIndex, setThemeIndex] = useState(0);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  // Dynamic height based on actual image aspect ratio
  const CARD_WIDTH = 350; // Approximate card width after padding
  const cardHeight = imageAspectRatio
    ? (CARD_WIDTH / imageAspectRatio) + 4 // Add 4px to account for border/rounding
    : CARD_WIDTH * 1.4; // Default 5:7 ratio when no image

  useEffect(() => {
    if (imageUri) {
      // Get image dimensions to calculate aspect ratio
      Image.getSize(
        imageUri,
        (width, height) => {
          setImageAspectRatio(width / height);
        },
        (error) => {
          console.error('Error getting image size:', error);
          setImageAspectRatio(null);
        }
      );

      if (onColorsExtracted) {
        // Cycle through gradient themes when image changes
        const newIndex = (themeIndex + 1) % GRADIENT_THEMES.length;
        setThemeIndex(newIndex);
        onColorsExtracted(GRADIENT_THEMES[newIndex], imageUri);
      }
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
        allowsEditing: false,
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
          {isDark ? (
            <BlurView intensity={40} tint="light" style={[styles.blur, { borderColor: theme.colors.outline }]}>
              <View style={[styles.imageContainer, { height: cardHeight, backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.image} />
                    <View style={styles.overlay}>
                      <BlurView intensity={20} tint="light" style={[styles.editButton, { borderColor: theme.colors.outline }]}>
                        <IconButton icon="pencil" size={24} iconColor={theme.colors.onSurface} />
                      </BlurView>
                    </View>
                  </>
                ) : (
                  <View style={styles.placeholder}>
                    <View style={[styles.placeholderIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                      <IconButton icon="camera-plus" size={48} iconColor={theme.colors.onSurface} />
                    </View>
                    <Text style={[styles.placeholderText, { color: theme.colors.onSurface }]}>{placeholder}</Text>
                    <Text style={[styles.placeholderHint, { color: theme.colors.onSurfaceVariant }]}>Image will adapt to size</Text>
                  </View>
                )}
              </View>
            </BlurView>
          ) : (
            <View style={[styles.blur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
              <View style={[styles.imageContainer, { height: cardHeight }]}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.image} />
                    <View style={styles.overlay}>
                      <View style={[styles.editButton, { borderColor: theme.colors.outline, backgroundColor: 'rgba(255,255,255,0.9)' }]}>
                        <IconButton icon="pencil" size={24} iconColor={theme.colors.onSurface} />
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.placeholder}>
                    <View style={[styles.placeholderIcon, { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
                      <IconButton icon="camera-plus" size={48} iconColor={theme.colors.onSurfaceVariant} />
                    </View>
                    <Text style={[styles.placeholderText, { color: theme.colors.onSurface }]}>{placeholder}</Text>
                    <Text style={[styles.placeholderHint, { color: theme.colors.onSurfaceVariant }]}>Image will adapt to size</Text>
                  </View>
                )}
              </View>
            </View>
          )}
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
    overflow: 'hidden',
  },
  imageContainer: {
    overflow: 'hidden',
    borderRadius: 20,
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
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  placeholderHint: {
    fontSize: 14,
  },
});
