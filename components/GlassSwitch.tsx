// components/GlassSwitch.tsx
import React from 'react';
import { View, Switch, StyleSheet, Text, SwitchProps } from 'react-native';
import { useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useThemeToggle } from '../app/_layout';

interface GlassSwitchProps extends SwitchProps {
  label: string;
  description?: string;
}

export default function GlassSwitch({ label, description, value, onValueChange, ...props }: GlassSwitchProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  return (
    <View style={styles.container}>
      {isDark ? (
        <BlurView intensity={40} tint="light" style={[styles.blur, { borderColor: theme.colors.outline }]}>
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>
              {description && <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
            </View>
            <Switch
              value={value}
              onValueChange={onValueChange}
              trackColor={{ false: 'rgba(255, 255, 255, 0.2)', true: 'rgba(255, 255, 255, 0.4)' }}
              thumbColor={value ? 'white' : 'rgba(255, 255, 255, 0.8)'}
              ios_backgroundColor="rgba(255, 255, 255, 0.2)"
              {...props}
            />
          </View>
        </BlurView>
      ) : (
        <View style={[styles.blur, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>{label}</Text>
              {description && <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{description}</Text>}
            </View>
            <Switch
              value={value}
              onValueChange={onValueChange}
              trackColor={{ false: 'rgba(0, 0, 0, 0.1)', true: theme.colors.primary }}
              thumbColor={value ? '#fff' : '#f4f4f5'}
              ios_backgroundColor="rgba(0, 0, 0, 0.1)"
              {...props}
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
    borderRadius: 16,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 16,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  textContainer: {
    flex: 1,
    marginRight: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    marginTop: 4,
  },
});
