// components/GlassButton.tsx
import React from 'react';
import { TouchableOpacity, StyleSheet, Text, ActivityIndicator, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeToggle } from '../app/_layout';

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
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[styles.container, isDisabled && styles.containerDisabled]}
    >
      {isReady && !isDisabled ? (
        <LinearGradient
          colors={['#10b981', '#059669', '#047857']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.blur, { borderColor: '#059669' }]}
        >
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                {icon && <View style={styles.iconContainer}>{icon}</View>}
                <Text style={[styles.title, { color: '#fff' }]}>{title}</Text>
              </>
            )}
          </View>
        </LinearGradient>
      ) : isDark ? (
        <BlurView
          intensity={variant === 'primary' ? 60 : 40}
          tint="light"
          style={[styles.blur, { borderColor: theme.colors.outline }]}
        >
          <View style={[
            styles.content,
            variant === 'primary' && { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
          ]}>
            {loading ? (
              <ActivityIndicator color={theme.colors.onSurface} />
            ) : (
              <>
                {icon && <View style={styles.iconContainer}>{icon}</View>}
                <Text style={[styles.title, { color: theme.colors.onSurfaceDisabled }]}>{title}</Text>
              </>
            )}
          </View>
        </BlurView>
      ) : (
        <View style={[styles.blur, { borderColor: theme.colors.outline, backgroundColor: variant === 'primary' ? theme.colors.primary : theme.colors.surfaceVariant }]}>
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator color={variant === 'primary' ? theme.colors.onPrimary : theme.colors.onSurface} />
            ) : (
              <>
                {icon && <View style={styles.iconContainer}>{icon}</View>}
                <Text style={[styles.title, { color: variant === 'primary' ? theme.colors.onPrimary : theme.colors.onSurfaceDisabled }]}>{title}</Text>
              </>
            )}
          </View>
        </View>
      )}
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
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
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
  },
});
