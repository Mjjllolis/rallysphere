// components/GlassSwitch.tsx
import React from 'react';
import { View, Switch, StyleSheet, Text, SwitchProps } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassSwitchProps extends SwitchProps {
  label: string;
  description?: string;
}

export default function GlassSwitch({ label, description, value, onValueChange, ...props }: GlassSwitchProps) {
  return (
    <View style={styles.container}>
      <BlurView intensity={40} tint="light" style={styles.blur}>
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.label}>{label}</Text>
            {description && <Text style={styles.description}>{description}</Text>}
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: 'white',
  },
  description: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
});
