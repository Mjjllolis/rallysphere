// components/GlassDropdown.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, ScrollView, Animated } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';

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
  const theme = useTheme();
  const { isDark } = useThemeToggle();
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
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>
      <TouchableOpacity
        onPress={() => setDropdownVisible(!dropdownVisible)}
        activeOpacity={0.7}
      >
        <View style={styles.selectWrapper}>
          {isDark ? (
            <BlurView intensity={40} tint="light" style={[styles.blur, { borderColor: theme.colors.outline }]}>
              <View style={styles.selectContainer}>
                {icon && (
                  <View style={styles.iconContainer}>
                    <IconButton icon={icon} size={20} iconColor={theme.colors.onSurface} />
                  </View>
                )}
                <Text style={[styles.selectText, { color: theme.colors.onSurface }, !value && { color: theme.colors.onSurfaceDisabled }]}>
                  {value || placeholder}
                </Text>
                <IconButton
                  icon={dropdownVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  iconColor={theme.colors.onSurface}
                />
              </View>
            </BlurView>
          ) : (
            <View style={[styles.blur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
              <View style={styles.selectContainer}>
                {icon && (
                  <View style={styles.iconContainer}>
                    <IconButton icon={icon} size={20} iconColor={theme.colors.onSurface} />
                  </View>
                )}
                <Text style={[styles.selectText, { color: theme.colors.onSurface }, !value && { color: theme.colors.onSurfaceDisabled }]}>
                  {value || placeholder}
                </Text>
                <IconButton
                  icon={dropdownVisible ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  iconColor={theme.colors.onSurface}
                />
              </View>
            </View>
          )}
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
          <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={[styles.dropdownBlur, { borderColor: theme.colors.outline }]}>
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
                    { borderBottomColor: theme.colors.outline },
                    value === option && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' },
                    index === options.length - 1 && styles.dropdownItemLast,
                  ]}
                  onPress={() => handleSelect(option)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      { color: theme.colors.onSurfaceVariant },
                      value === option && { color: theme.colors.onSurface, fontWeight: '600' },
                    ]}
                  >
                    {option}
                  </Text>
                  {value === option && (
                    <View style={styles.checkmarkContainer}>
                      <IconButton icon="check" size={18} iconColor={theme.colors.onSurface} style={styles.checkIcon} />
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
  },
  dropdownInline: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  dropdownBlur: {
    borderRadius: 16,
    borderWidth: 1,
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
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  checkIcon: {
    margin: 0,
    padding: 0,
  },
});
