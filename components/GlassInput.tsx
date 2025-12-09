// components/GlassInput.tsx
import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps, Text } from 'react-native';
import { IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';

interface GlassInputProps extends TextInputProps {
  label: string;
  icon?: string;
  error?: string;
}

export default function GlassInput({ label, icon, error, style, ...props }: GlassInputProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <BlurView intensity={40} tint="light" style={styles.blur}>
          <View style={styles.inputContainer}>
            {icon && (
              <View style={styles.iconContainer}>
                <IconButton icon={icon} size={20} iconColor="white" />
              </View>
            )}
            <TextInput
              style={[styles.input, icon && styles.inputWithIcon]}
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              {...props}
            />
          </View>
        </BlurView>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
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
  inputWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginTop: 4,
    marginLeft: 4,
  },
});
