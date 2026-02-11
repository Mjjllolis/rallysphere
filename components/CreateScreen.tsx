// components/CreateScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

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

  const handleColorsExtracted = (colors: string[], imageUri?: string) => {
    setBackgroundColors(colors);
    if (imageUri) {
      setBackgroundImage(imageUri);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
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

          {/* Header */}
          <View style={styles.headerContainer}>
            <View style={styles.headerContent}>
              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
              >
                <IconButton icon="close" size={24} iconColor="rgba(255, 255, 255, 0.8)" style={{ margin: 0 }} />
              </TouchableOpacity>

              {/* Type Selector Dropdown */}
              <View style={styles.typeSelectorWrapper}>
                <TouchableOpacity
                  style={styles.typeSelector}
                  onPress={() => setDropdownVisible(!dropdownVisible)}
                >
                  <Text style={styles.typeSelectorText}>{selectedType}</Text>
                  <IconButton
                    icon={dropdownVisible ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    iconColor="white"
                    style={{ margin: 0 }}
                  />
                </TouchableOpacity>

                {/* Dropdown Menu */}
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
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeSelectorWrapper: {
    flex: 1,
    alignItems: 'center',
    marginRight: 40, // Balance for close button
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeSelectorText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'white',
    marginRight: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  dropdownAbsolute: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -70,
    marginTop: 8,
    width: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  dropdownAbsoluteContent: {
    paddingVertical: 4,
  },
  dropdownAbsoluteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
    color: 'rgba(255, 255, 255, 0.8)',
  },
  dropdownAbsoluteItemTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  checkmarkContainer: {
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
