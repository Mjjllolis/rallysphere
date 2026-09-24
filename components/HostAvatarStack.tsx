// components/HostAvatarStack.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Image as ExpoImage } from 'expo-image';

export interface HostAvatar {
  id: string;
  name: string;
  logo?: string;
}

interface HostAvatarStackProps {
  hosts: HostAvatar[];
  size?: number;
  /** Ring color that separates overlapping circles - match the surface behind them */
  ringColor?: string;
  /** Draw the separating ring (off where it would read as a border, e.g. home feed cards) */
  showRing?: boolean;
  /** Fraction of the avatar diameter that overlaps the previous one */
  overlap?: number;
  maxVisible?: number;
}

/**
 * Overlapping circular club logos, primary host first (on top), with a
 * "+N" bubble when there are more hosts than maxVisible.
 */
export default function HostAvatarStack({
  hosts,
  size = 24,
  ringColor,
  showRing = true,
  overlap = 0.35,
  maxVisible = 3,
}: HostAvatarStackProps) {
  const theme = useTheme();
  const ring = ringColor ?? theme.colors.background;
  const visible = hosts.slice(0, maxVisible);
  const extra = hosts.length - visible.length;
  const offset = -Math.round(size * overlap);

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: showRing ? 2 : 0,
    borderColor: ring,
  };

  return (
    <View style={styles.row}>
      {visible.map((host, i) => {
        const position = { marginLeft: i === 0 ? 0 : offset, zIndex: maxVisible + 1 - i };
        return host.logo ? (
          <ExpoImage
            key={host.id}
            source={{ uri: host.logo }}
            style={[circle, position]}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`${host.name} logo`}
          />
        ) : (
          <View
            key={host.id}
            style={[circle, styles.centered, position, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: size * 0.42, fontWeight: '600' }}>
              {host.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        );
      })}
      {extra > 0 && (
        <View style={[circle, styles.centered, { marginLeft: offset, backgroundColor: theme.colors.primary }]}>
          <Text style={{ color: theme.colors.onPrimary, fontSize: size * 0.38, fontWeight: '700' }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

/** "A", "A & B", or "A, B & C" */
export function formatHostNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
