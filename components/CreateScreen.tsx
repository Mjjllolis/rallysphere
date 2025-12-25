// components/CreateScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Pressable,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import EventForm from './forms/EventForm';
import PostForm from './forms/PostForm';
import ClubForm from './forms/ClubForm';
import IOSModal from './IOSModal';
import { useScrollTracking } from '../hooks/useScrollTracking';

type CreateType = 'Event' | 'Post' | 'Club';

interface CreateScreenProps {
  visible: boolean;
  onClose: () => void;
  initialType?: CreateType;
}

export default function CreateScreen({ visible, onClose, initialType = 'Event' }: CreateScreenProps) {
  const [selectedType, setSelectedType] = useState<CreateType>(initialType);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [backgroundColors, setBackgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  // Scroll tracking for modal gesture control
  const { scrollHandlers, shouldAllowGesture, shouldBounce, reset: resetScrollState } = useScrollTracking();

  useEffect(() => {
    if (dropdownVisible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [dropdownVisible]);

  // Reset scroll state when modal opens
  useEffect(() => {
    if (visible) {
      resetScrollState();
    }
  }, [visible, resetScrollState]);

  const handleTypeSelect = (type: CreateType) => {
    setSelectedType(type);
    setDropdownVisible(false);
  };

  const handleColorsExtracted = (colors: string[], imageUri?: string) => {
    setBackgroundColors(colors);
    if (imageUri) {
      setBackgroundImage(imageUri);
    }
  };

  return (
    <IOSModal
      visible={visible}
      onClose={onClose}
      onShouldAllowGesture={shouldAllowGesture}
    >
      <View style={styles.container}>
        {/* Background Image or Black Background */}
        {backgroundImage ? (
          <>
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: backgroundImage }} style={styles.backgroundImage} blurRadius={0} />
            </View>
            {/* Frosted Glass Overlay */}
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <>
            {/* Black Background */}
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.blackBackground} />
            </View>

            {/* Subtle Gradient Overlay */}
            <LinearGradient
              colors={[
                `rgba(${parseInt(backgroundColors[0].slice(1, 3), 16)}, ${parseInt(backgroundColors[0].slice(3, 5), 16)}, ${parseInt(backgroundColors[0].slice(5, 7), 16)}, 0.25)`,
                `rgba(${parseInt(backgroundColors[1].slice(1, 3), 16)}, ${parseInt(backgroundColors[1].slice(3, 5), 16)}, ${parseInt(backgroundColors[1].slice(5, 7), 16)}, 0.15)`,
                `rgba(${parseInt(backgroundColors[2].slice(1, 3), 16)}, ${parseInt(backgroundColors[2].slice(3, 5), 16)}, ${parseInt(backgroundColors[2].slice(5, 7), 16)}, 0.08)`,
                'rgba(0, 0, 0, 0)'
              ]}
              locations={[0, 0.3, 0.6, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        )}

        <SafeAreaView style={styles.safeArea} edges={['top']}>

          {/* Header - Fixed swipeable area */}
          <View style={styles.headerContainer}>
            {/* Semi-transparent swipe zone background - captures touches for swipe gesture */}
            <Pressable style={styles.headerSwipeZone} />

            <View style={styles.headerContent}>
              {/* Type Selector Dropdown */}
              <View>
                <TouchableOpacity
                  style={styles.typeSelector}
                  onPress={() => setDropdownVisible(!dropdownVisible)}
                  delayLongPress={0}
                >
                  <BlurView intensity={60} tint="dark" style={styles.typeSelectorBlur}>
                    <Text style={styles.typeSelectorText}>{selectedType}</Text>
                    <IconButton
                      icon={dropdownVisible ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      iconColor="white"
                    />
                  </BlurView>
                </TouchableOpacity>

                {/* Absolute Positioned Dropdown Menu */}
                {dropdownVisible && (
                  <Animated.View
                    style={[
                      styles.dropdownAbsolute,
                      {
                        transform: [{ scale: scaleAnim }],
                        opacity: scaleAnim,
                      },
                    ]}
                  >
                    <BlurView intensity={90} tint="dark" style={styles.dropdownAbsoluteBlur}>
                      <View style={styles.dropdownAbsoluteContent}>
                        {(['Club', 'Event', 'Post'] as CreateType[]).map((type, index) => (
                          <TouchableOpacity
                            key={type}
                            style={[
                              styles.dropdownAbsoluteItem,
                              selectedType === type && styles.dropdownAbsoluteItemSelected,
                              index === 2 && styles.dropdownAbsoluteItemLast,
                            ]}
                            onPress={() => handleTypeSelect(type)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.dropdownAbsoluteItemText,
                                selectedType === type && styles.dropdownAbsoluteItemTextSelected,
                              ]}
                            >
                              {type}
                            </Text>
                            {selectedType === type && (
                              <View style={styles.checkmarkContainer}>
                                <IconButton icon="check" size={18} iconColor="white" style={styles.checkIcon} />
                              </View>
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </BlurView>
                  </Animated.View>
                )}
              </View>
            </View>
          </View>

          {/* Tap Outside to Close Dropdown */}
          {dropdownVisible && (
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setDropdownVisible(false)}
            />
          )}

          {/* Form Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            indicatorStyle="white"
            bounces={shouldBounce}
            alwaysBounceVertical={false}
            overScrollMode="never"
            scrollEnabled={true}
            {...scrollHandlers}
          >
            {selectedType === 'Event' && (
              <EventForm onColorsExtracted={handleColorsExtracted} onSuccess={onClose} />
            )}
            {selectedType === 'Post' && (
              <PostForm onColorsExtracted={handleColorsExtracted} onSuccess={onClose} />
            )}
            {selectedType === 'Club' && (
              <ClubForm onColorsExtracted={handleColorsExtracted} onSuccess={onClose} />
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </IOSModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 16,
    position: 'relative',
  },
  headerSwipeZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  typeSelectorWrapper: {
    position: 'relative',
    zIndex: 1000,
  },
  typeSelector: {
    borderRadius: 18,
    overflow: 'hidden',
    minWidth: 120,
    maxWidth: 120,
  },
  typeSelectorBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    height: 36,
  },
  typeSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginRight: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  // Absolute Positioned Dropdown Styles
  dropdownAbsolute: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -60, // Half of width (120/2)
    marginTop: 8,
    width: 120,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownAbsoluteBlur: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  dropdownAbsoluteContent: {
    paddingVertical: 2,
  },
  dropdownAbsoluteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 36,
  },
  dropdownAbsoluteItemLast: {
    borderBottomWidth: 0,
  },
  dropdownAbsoluteItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownAbsoluteItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    flex: 1,
  },
  dropdownAbsoluteItemTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  checkmarkContainer: {
    marginLeft: 4,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIcon: {
    margin: 0,
    padding: 0,
  },
});
