// components/GlassTagInput.tsx
import React, { useState, useRef, useCallback } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';
import { useScrollContext } from '../contexts/ScrollContext';

interface GlassTagInputProps {
  label: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
}

export default function GlassTagInput({
  label,
  tags,
  onTagsChange,
  placeholder = 'Type and press return to add tags...',
}: GlassTagInputProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<View>(null);
  const scrollContext = useScrollContext();

  const handleFocus = useCallback(() => {
    if (scrollContext) {
      scrollContext.scrollToInput(containerRef);
    }
  }, [scrollContext]);

  const handleSubmitEditing = () => {
    const newTag = inputValue.trim();
    if (newTag && !tags.includes(newTag)) {
      onTagsChange([...tags, newTag]);
    }
    setInputValue('');
  };

  const removeTag = (indexToRemove: number) => {
    onTagsChange(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <View ref={containerRef} style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>

      {/* Tag Display Area */}
      {tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsScrollView}
          contentContainerStyle={styles.tagsContainer}
        >
          {tags.map((tag, index) => (
            isDark ? (
              <BlurView key={index} intensity={40} tint="light" style={[styles.tagBlur, { borderColor: theme.colors.outline }]}>
                <View style={styles.tag}>
                  <Text style={[styles.tagText, { color: theme.colors.onSurface }]}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconButton icon="close-circle" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.removeIcon} />
                  </TouchableOpacity>
                </View>
              </BlurView>
            ) : (
              <View key={index} style={[styles.tagBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
                <View style={styles.tag}>
                  <Text style={[styles.tagText, { color: theme.colors.onSurface }]}>{tag}</Text>
                  <TouchableOpacity onPress={() => removeTag(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconButton icon="close-circle" size={16} iconColor={theme.colors.onSurfaceVariant} style={styles.removeIcon} />
                  </TouchableOpacity>
                </View>
              </View>
            )
          ))}
        </ScrollView>
      )}

      {/* Input Field */}
      {isDark ? (
        <BlurView intensity={40} tint="light" style={[styles.inputBlur, { borderColor: theme.colors.outline }]}>
          <View style={styles.inputContainer}>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={handleSubmitEditing}
              onFocus={handleFocus}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.onSurfaceDisabled}
              style={[styles.input, { color: theme.colors.onSurface }]}
              autoCapitalize="words"
              returnKeyType="done"
              blurOnSubmit={false}
            />
          </View>
        </BlurView>
      ) : (
        <View style={[styles.inputBlur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.inputContainer}>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={handleSubmitEditing}
              onFocus={handleFocus}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.onSurfaceDisabled}
              style={[styles.input, { color: theme.colors.onSurface }]}
              autoCapitalize="words"
              returnKeyType="done"
              blurOnSubmit={false}
            />
          </View>
        </View>
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
  tagsScrollView: {
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tagBlur: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 4,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  removeIcon: {
    margin: 0,
    padding: 0,
  },
  inputBlur: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
});
