// components/AppHeader.tsx
import React from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  rightActions?: React.ReactNode;
  transparent?: boolean;
}

export default function AppHeader({
  title,
  showBack = false,
  rightActions,
  transparent = false
}: AppHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const headerHeight = 60 + insets.top;

  return (
    <View style={[styles.container, { height: headerHeight }]}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />

      {/* Blur Background */}
      {transparent && (
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Solid Background */}
      {!transparent && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surface }]} />
      )}

      {/* Header Content */}
      <View style={[styles.content, { paddingTop: insets.top }]}>
        <View style={styles.leftSection}>
          {showBack && (
            <IconButton
              icon="arrow-left"
              size={24}
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
            />
          )}
        </View>

        <View style={styles.centerSection}>
          <Text
            variant="titleLarge"
            style={[styles.title, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        <View style={styles.rightSection}>
          {rightActions}
        </View>
      </View>

      {/* Bottom border */}
      <View
        style={[
          styles.bottomBorder,
          {
            backgroundColor: theme.dark
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(0,0,0,0.1)'
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    zIndex: 100,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  leftSection: {
    width: 56,
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 56,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
