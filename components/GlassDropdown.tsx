// components/GlassDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, ScrollView, Animated } from 'react-native';
import { IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';

interface GlassDropdownProps {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
  icon?: string;
}

export default function GlassDropdown({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Select...',
  icon,
}: GlassDropdownProps) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
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

  const handleSelect = (option: string) => {
    onSelect(option);
    setDropdownVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TouchableOpacity
          onPress={() => setDropdownVisible(!dropdownVisible)}
          activeOpacity={0.7}
        >
          <View style={styles.selectWrapper}>
            <BlurView intensity={40} tint="light" style={styles.blur}>
              <View style={styles.selectContainer}>
                {icon && (
                  <View style={styles.iconContainer}>
                    <IconButton icon={icon} size={20} iconColor="white" />
                  </View>
                )}
                <Text style={[styles.selectText, !value && styles.placeholderText]}>
                  {value || placeholder}
                </Text>
                <IconButton
                  icon={dropdownVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  iconColor="white"
                />
              </View>
            </BlurView>
          </View>
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
              <ScrollView
                style={styles.dropdownAbsoluteScroll}
                contentContainerStyle={styles.dropdownAbsoluteContent}
                showsVerticalScrollIndicator={false}
              >
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownAbsoluteItem,
                      value === option && styles.dropdownAbsoluteItemSelected,
                      index === options.length - 1 && styles.dropdownAbsoluteItemLast,
                    ]}
                    onPress={() => handleSelect(option)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dropdownAbsoluteItemText,
                        value === option && styles.dropdownAbsoluteItemTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                    {value === option && (
                      <View style={styles.checkmarkContainer}>
                        <IconButton icon="check" size={18} iconColor="white" style={styles.checkIcon} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </BlurView>
          </Animated.View>
        )}
      </View>

      {/* Tap Outside to Close Dropdown */}
      {dropdownVisible && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    zIndex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
    marginLeft: 4,
  },
  selectWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  selectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 4,
    minHeight: 52,
  },
  iconContainer: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -16,
  },
  selectText: {
    flex: 1,
    fontSize: 16,
    color: 'white',
  },
  placeholderText: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 998,
  },
  dropdownAbsolute: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  dropdownAbsoluteBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  dropdownAbsoluteScroll: {
    maxHeight: 240,
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
    flex: 1,
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
