import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  ScrollView,
} from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';
import type { ResponseType } from '../lib/firebase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PICKER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.4);

interface ResponseTypePickerProps {
  visible: boolean;
  currentType: ResponseType | null;
  onSelect: (type: ResponseType) => void;
  onDismiss: () => void;
}

interface ResponseTypeOption {
  value: ResponseType;
  label: string;
  icon: string;
  description: string;
}

const RESPONSE_TYPES: ResponseTypeOption[] = [
  {
    value: 'text',
    label: 'Text',
    icon: 'text-box-outline',
    description: 'Short text answer',
  },
  {
    value: 'long_text',
    label: 'Long Text',
    icon: 'text-box-multiple-outline',
    description: 'Multiline text area',
  },
  {
    value: 'phone',
    label: 'Phone Number',
    icon: 'phone',
    description: 'Formatted phone input',
  },
  {
    value: 'email',
    label: 'Email',
    icon: 'email-outline',
    description: 'Email address input',
  },
  {
    value: 'number',
    label: 'Number',
    icon: 'numeric',
    description: 'Numeric input',
  },
  {
    value: 'date',
    label: 'Date',
    icon: 'calendar',
    description: 'Date picker',
  },
  {
    value: 'single_choice',
    label: 'Single Choice',
    icon: 'radiobox-marked',
    description: 'Pick one option',
  },
  {
    value: 'multiple_choice',
    label: 'Multiple Choice',
    icon: 'checkbox-marked-outline',
    description: 'Pick multiple options',
  },
];

export default function ResponseTypePicker({
  visible,
  currentType,
  onSelect,
  onDismiss,
}: ResponseTypePickerProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const slideAnim = useRef(new Animated.Value(PICKER_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: PICKER_HEIGHT,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = (type: ResponseType) => {
    onSelect(type);
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
            backgroundColor: 'rgba(0,0,0,0.5)',
          },
        ]}
      >
        <TouchableOpacity style={styles.backdropTouchable} onPress={onDismiss} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: PICKER_HEIGHT,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {isDark ? (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: isDark ? 'rgba(20,30,48,0.95)' : theme.colors.surface,
              borderTopColor: theme.colors.outline,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text
              variant="titleLarge"
              style={[styles.title, { color: theme.colors.onSurface }]}
            >
              Response Type
            </Text>
            <IconButton
              icon="close"
              size={24}
              iconColor={theme.colors.onSurfaceVariant}
              onPress={onDismiss}
              style={styles.closeButton}
            />
          </View>

          {/* Options */}
          <ScrollView
            style={styles.optionsList}
            contentContainerStyle={styles.optionsListContent}
            showsVerticalScrollIndicator={false}
          >
            {RESPONSE_TYPES.map((option, index) => {
              const isSelected = currentType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionItem,
                    {
                      borderColor: theme.colors.outline,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(96, 165, 250, 0.15)'
                          : 'rgba(37, 99, 235, 0.08)'
                        : 'transparent',
                    },
                    index === RESPONSE_TYPES.length - 1 && styles.optionItemLast,
                  ]}
                  onPress={() => handleSelect(option.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIconContainer}>
                    <IconButton
                      icon={option.icon}
                      size={24}
                      iconColor={
                        isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant
                      }
                      style={{ margin: 0 }}
                    />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text
                      variant="bodyLarge"
                      style={[
                        styles.optionLabel,
                        {
                          color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                          fontWeight: isSelected ? '600' : '500',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.optionDescription, { color: theme.colors.onSurfaceVariant }]}
                    >
                      {option.description}
                    </Text>
                  </View>
                  {isSelected && (
                    <IconButton
                      icon="check-circle"
                      size={20}
                      iconColor={theme.colors.primary}
                      style={{ margin: 0 }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTouchable: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  sheetContent: {
    flex: 1,
    borderTopWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontWeight: '700',
  },
  closeButton: {
    margin: 0,
  },
  optionsList: {
    flex: 1,
  },
  optionsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  optionItemLast: {
    marginBottom: 0,
  },
  optionIconContainer: {
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    marginBottom: 2,
  },
  optionDescription: {
    lineHeight: 18,
  },
});
