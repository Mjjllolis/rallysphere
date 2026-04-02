// components/GlassInput.tsx
import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps, Text } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';

interface GlassInputProps extends TextInputProps {
  label: string;
  icon?: string;
  error?: string;
  compact?: boolean;
}

export default function GlassInput({ label, icon, error, style, compact, ...props }: GlassInputProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const isMultiline = props.multiline;

  return (
    <View style={[styles.container, isMultiline && styles.containerMultiline, style]}>
      <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>
      <View style={styles.inputWrapper}>
        {isDark ? (
          <BlurView intensity={40} tint="light" style={[styles.blur, { borderColor: theme.colors.outline }]}>
            <View style={[styles.inputContainer, isMultiline && styles.inputContainerMultiline]}>
              {icon && (
                <View style={[styles.iconContainer, compact && styles.iconContainerCompact]}>
                  <IconButton icon={icon} size={20} iconColor={theme.colors.onSurface} style={compact ? { margin: 0, padding: 0 } : undefined} />
                </View>
              )}
              <TextInput
                style={[styles.input, icon && styles.inputWithIcon, isMultiline && styles.inputMultiline, { color: theme.colors.onSurface }]}
                placeholderTextColor={theme.colors.onSurfaceDisabled}
                {...props}
              />
            </View>
          </BlurView>
        ) : (
          <View style={[styles.blur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={[styles.inputContainer, isMultiline && styles.inputContainerMultiline]}>
              {icon && (
                <View style={[styles.iconContainer, compact && styles.iconContainerCompact]}>
                  <IconButton icon={icon} size={20} iconColor={theme.colors.onSurface} style={compact ? { margin: 0, padding: 0 } : undefined} />
                </View>
              )}
              <TextInput
                style={[styles.input, icon && styles.inputWithIcon, isMultiline && styles.inputMultiline, { color: theme.colors.onSurface }]}
                placeholderTextColor={theme.colors.onSurfaceDisabled}
                {...props}
              />
            </View>
          </View>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  containerMultiline: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainerMultiline: {
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerCompact: {
    width: 32,
    marginLeft: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputMultiline: {
    height: 100,
    minHeight: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    marginLeft: 4,
  },
});
