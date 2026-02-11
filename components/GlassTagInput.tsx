// components/GlassTagInput.tsx
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';

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
  const [inputValue, setInputValue] = useState('');

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
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Tag Display Area */}
      {tags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsScrollView}
          contentContainerStyle={styles.tagsContainer}
        >
          {tags.map((tag, index) => (
            <BlurView key={index} intensity={40} tint="light" style={styles.tagBlur}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity
                  onPress={() => removeTag(index)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <IconButton
                    icon="close-circle"
                    size={16}
                    iconColor="rgba(255, 255, 255, 0.8)"
                    style={styles.removeIcon}
                  />
                </TouchableOpacity>
              </View>
            </BlurView>
          ))}
        </ScrollView>
      )}

      {/* Input Field */}
      <BlurView intensity={40} tint="light" style={styles.inputBlur}>
        <View style={styles.inputContainer}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={handleSubmitEditing}
            placeholder={placeholder}
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </View>
      </BlurView>
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: 'white',
  },
  removeIcon: {
    margin: 0,
    padding: 0,
  },
  inputBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: 'white',
    paddingVertical: 12,
  },
});
