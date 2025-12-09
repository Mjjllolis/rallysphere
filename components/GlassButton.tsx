// components/GlassButton.tsx
import React from 'react';
import { TouchableOpacity, StyleSheet, Text, ActivityIndicator, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
  isReady?: boolean;
}

export default function GlassButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  isReady = false,
}: GlassButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[styles.container, isDisabled && styles.containerDisabled]}
    >
      <BlurView
        intensity={variant === 'primary' ? 60 : 40}
        tint="light"
        style={styles.blur}
      >
        {isReady && !isDisabled ? (
          <LinearGradient
            colors={['#10b981', '#059669', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.readyGradient}
          >
            <View style={styles.content}>
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  {icon && <View style={styles.iconContainer}>{icon}</View>}
                  <Text style={styles.title}>{title}</Text>
                </>
              )}
            </View>
          </LinearGradient>
        ) : (
          <View style={[
            styles.content,
            variant === 'primary' && styles.contentPrimary,
          ]}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                {icon && <View style={styles.iconContainer}>{icon}</View>}
                <Text style={[styles.title, !isReady && styles.titleDisabled]}>{title}</Text>
              </>
            )}
          </View>
        )}
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerDisabled: {
    opacity: 0.5,
  },
  blur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
  },
  contentPrimary: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  readyGradient: {
    borderRadius: 16,
  },
  iconContainer: {
    marginRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
  },
  titleDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
