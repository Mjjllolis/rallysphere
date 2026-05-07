// components/ImageCropScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { useThemeToggle } from '../app/_layout';
import {
  getImageDimensions,
  calculateCropRegion,
  cropImage,
} from '../hooks/useImageCrop';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// No side padding - edge to edge
const CROP_PADDING = 0;
const HEADER_HEIGHT = 160; // Space for header + title + safe area
const FOOTER_HEIGHT = 60; // Space for footer hint

const MIN_SCALE = 1.0;
const MAX_SCALE = 4.0;

interface ImageCropScreenProps {
  visible: boolean;
  imageUri: string | null;
  aspectRatio?: [number, number];
  onCropComplete: (croppedUri: string) => void;
  onCancel: () => void;
  onChangeImage?: () => void;
}

export default function ImageCropScreen({
  visible,
  imageUri,
  aspectRatio = [4, 5],
  onCropComplete,
  onCancel,
  onChangeImage,
}: ImageCropScreenProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const insets = useSafeAreaInsets();

  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Calculate crop frame dimensions - maximize the crop area
  const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT;
  const cropFrameWidth = SCREEN_WIDTH - CROP_PADDING * 2;
  const cropFrameHeightFromWidth = cropFrameWidth * (aspectRatio[1] / aspectRatio[0]);

  // Use the smaller of the two to fit in available space
  const cropFrameHeight = Math.min(cropFrameHeightFromWidth, availableHeight);
  const actualCropFrameWidth = cropFrameHeight * (aspectRatio[0] / aspectRatio[1]);

  // Calculate initial scale to cover crop frame
  const initialScale = useMemo(() => {
    if (imageSize.width <= 1 || imageSize.height <= 1) return 1;
    const scaleX = actualCropFrameWidth / imageSize.width;
    const scaleY = cropFrameHeight / imageSize.height;
    return Math.max(scaleX, scaleY);
  }, [imageSize, actualCropFrameWidth, cropFrameHeight]);

  // Displayed size at initial scale
  const displayedWidth = imageSize.width * initialScale;
  const displayedHeight = imageSize.height * initialScale;

  // Gesture values
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset when image changes
  useEffect(() => {
    if (visible && imageUri) {
      setIsReady(false);

      Image.getSize(
        imageUri,
        (width, height) => {
          setImageSize({ width, height });

          // Reset gesture values
          scale.value = 1;
          savedScale.value = 1;
          translateX.value = 0;
          translateY.value = 0;
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;

          setIsReady(true);
        },
        () => {
          setIsReady(false);
        }
      );
    } else {
      setIsReady(false);
    }
  }, [visible, imageUri]);

  // Calculate bounds for translation
  const getBounds = (currentScale: number) => {
    'worklet';
    const scaledWidth = displayedWidth * currentScale;
    const scaledHeight = displayedHeight * currentScale;
    const maxX = Math.max(0, (scaledWidth - actualCropFrameWidth) / 2);
    const maxY = Math.max(0, (scaledHeight - cropFrameHeight) / 2);
    return { maxX, maxY };
  };

  // Clamp value between min and max
  const clamp = (value: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(value, min), max);
  };

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      const bounds = getBounds(scale.value);
      const newX = savedTranslateX.value + event.translationX;
      const newY = savedTranslateY.value + event.translationY;
      translateX.value = clamp(newX, -bounds.maxX, bounds.maxX);
      translateY.value = clamp(newY, -bounds.maxY, bounds.maxY);
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      const newScale = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
      scale.value = newScale;

      // Adjust translation to stay within bounds
      const bounds = getBounds(newScale);
      translateX.value = clamp(translateX.value, -bounds.maxX, bounds.maxX);
      translateY.value = clamp(translateY.value, -bounds.maxY, bounds.maxY);
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  // Animated style for the image
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Handle crop
  const handleCrop = async () => {
    if (!imageUri || isProcessing || !isReady) return;

    setIsProcessing(true);
    try {
      const cropData = calculateCropRegion(
        imageSize.width,
        imageSize.height,
        displayedWidth,
        displayedHeight,
        actualCropFrameWidth,
        cropFrameHeight,
        scale.value,
        translateX.value,
        translateY.value
      );

      const croppedUri = await cropImage(imageUri, cropData, 800, 0.8);
      onCropComplete(croppedUri);
    } catch (error) {
      onCropComplete(imageUri);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.container, { backgroundColor: '#000', paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {/* Header - X button top right */}
            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Crop Event Image</Text>
                <Text style={styles.subtitle}>
                  Recommended 4:5 aspect ratio for best display
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onCancel}
                disabled={isProcessing}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Crop Area */}
            <View style={styles.cropContainer}>
              {!isReady ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <View style={[styles.cropWrapper, { width: actualCropFrameWidth, height: cropFrameHeight }]}>
                  {/* Image with gestures */}
                  <GestureDetector gesture={composedGesture}>
                    <Animated.View style={styles.imageWrapper}>
                      <Animated.Image
                        source={{ uri: imageUri }}
                        style={[
                          {
                            width: displayedWidth,
                            height: displayedHeight,
                          },
                          animatedImageStyle,
                        ]}
                        resizeMode="cover"
                      />
                    </Animated.View>
                  </GestureDetector>

                  {/* Grid overlay - stationary */}
                  <View style={styles.gridOverlay} pointerEvents="none">
                    {/* Vertical lines */}
                    <View style={[styles.gridLine, styles.gridLineV1]} />
                    <View style={[styles.gridLine, styles.gridLineV2]} />
                    {/* Horizontal lines */}
                    <View style={[styles.gridLine, styles.gridLineH1]} />
                    <View style={[styles.gridLine, styles.gridLineH2]} />
                  </View>
                </View>
              )}
            </View>

            {/* Footer - Change Image left, Done right */}
            <View style={styles.footer}>
              {onChangeImage ? (
                <TouchableOpacity
                  style={styles.changeImageButton}
                  onPress={onChangeImage}
                  disabled={isProcessing}
                >
                  <Text style={styles.changeImageText}>Change Image</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.changeImageButton} />
              )}

              <TouchableOpacity
                style={styles.doneButton}
                onPress={handleCrop}
                disabled={isProcessing || !isReady}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.doneText}>Done</Text>
                )}
              </TouchableOpacity>
            </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 40,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cropContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropWrapper: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridLineV1: {
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridLineV2: {
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
  },
  gridLineH1: {
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
  },
  gridLineH2: {
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  changeImageButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  changeImageText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
