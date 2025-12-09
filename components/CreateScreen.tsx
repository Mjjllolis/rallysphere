// components/CreateScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  StatusBar,
  Animated,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import EventForm from './forms/EventForm';
import PostForm from './forms/PostForm';
import ClubForm from './forms/ClubForm';

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

  const scaleAnim = useRef(new Animated.Value(0)).current;

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

  const handleTypeSelect = (type: CreateType) => {
    setSelectedType(type);
    setDropdownVisible(false);
  };

  const handleColorsExtracted = (colors: string[]) => {
    setBackgroundColors(colors);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Black Background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>

        {/* Subtle Radial Gradient Overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgRadialGradient id="colorGradient" cx="50%" cy="40%">
                <Stop offset="0%" stopColor={backgroundColors[0]} stopOpacity="0.25" />
                <Stop offset="30%" stopColor={backgroundColors[1]} stopOpacity="0.15" />
                <Stop offset="60%" stopColor={backgroundColors[2]} stopOpacity="0.08" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </SvgRadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#colorGradient)" />
          </Svg>
        </View>

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />

            <View style={styles.headerContent}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <BlurView intensity={40} tint="dark" style={styles.closeButtonBlur}>
                  <IconButton icon="close" size={24} iconColor="white" />
                </BlurView>
              </TouchableOpacity>

              {/* Type Selector Dropdown */}
              <View>
                <TouchableOpacity
                  style={styles.typeSelector}
                  onPress={() => setDropdownVisible(!dropdownVisible)}
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
                        {(['Event', 'Post', 'Club'] as CreateType[]).map((type, index) => (
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

              <View style={styles.placeholder} />
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
            showsVerticalScrollIndicator={false}
            bounces={true}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  dragHandle: {
    width: 36,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  closeButton: {
    width: 40,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  closeButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeButtonGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
  },
  typeSelector: {
    borderRadius: 20,
    overflow: 'hidden',
    minWidth: 140,
  },
  typeSelectorBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  typeSelectorText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    marginRight: 4,
  },
  placeholder: {
    width: 40,
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
    marginLeft: -80, // Half of width (160/2)
    marginTop: 8,
    width: 160,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownAbsoluteBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  dropdownAbsoluteContent: {
    paddingVertical: 4,
  },
  dropdownAbsoluteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownAbsoluteItemLast: {
    borderBottomWidth: 0,
  },
  dropdownAbsoluteItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownAbsoluteItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  dropdownAbsoluteItemTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  checkIcon: {
    margin: 0,
    padding: 0,
  },
});
