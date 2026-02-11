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

      {/* Inline Dropdown Menu - Pushes content down */}
      {dropdownVisible && (
        <Animated.View
          style={[
            styles.dropdownInline,
            {
              transform: [{ scale: scaleAnim }],
              opacity: scaleAnim,
            },
          ]}
        >
          <BlurView intensity={90} tint="dark" style={styles.dropdownBlur}>
            <ScrollView
              style={styles.dropdownScroll}
              contentContainerStyle={styles.dropdownContent}
              showsVerticalScrollIndicator={false}
            >
              {options.map((option, index) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.dropdownItem,
                    value === option && styles.dropdownItemSelected,
                    index === options.length - 1 && styles.dropdownItemLast,
                  ]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      value === option && styles.dropdownItemTextSelected,
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
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
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
  dropdownInline: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  dropdownBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownContent: {
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
  },
  dropdownItemTextSelected: {
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
