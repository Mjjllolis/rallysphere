import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserRallyCredits, confirmAllPendingCredits } from '../lib/firebase';
import type { UserRallyCredits } from '../lib/firebase';

interface RallyCreditsDisplayProps {
  userId: string;
  clubId: string;
  onPress?: () => void;
  compact?: boolean;
}

export default function RallyCreditsDisplay({
  userId,
  clubId,
  onPress,
  compact = false,
}: RallyCreditsDisplayProps) {
  const [credits, setCredits] = useState<UserRallyCredits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCredits();
  }, [userId, clubId]);

  const loadCredits = async () => {
    try {
      setLoading(true);

      // First, try to confirm any pending credits for events user has been checked into
      await confirmAllPendingCredits(userId);

      // Then load the (potentially updated) credits
      const result = await getUserRallyCredits(userId);
      if (result.success && result.credits) {
        setCredits(result.credits);
      }
    } catch (error) {
      console.error('Error loading rally credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const clubCredits = credits?.clubCredits?.[clubId] || 0;
  const pendingCredits = credits?.pendingClubCredits?.[clubId] || 0;

  if (loading) {
    return (
      <View style={compact ? styles.compactContainer : styles.container}>
        <ActivityIndicator size="small" color="#FFD700" />
      </View>
    );
  }

  const Container = onPress ? TouchableOpacity : View;

  if (compact) {
    return (
      <Container
        style={styles.compactContainer}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
      >
        <LinearGradient
          colors={['rgba(255, 215, 0, 0.2)', 'rgba(255, 165, 0, 0.2)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactGradient}
        >
          <View style={styles.compactContent}>
            <Text style={styles.compactIcon}>⭐</Text>
            <Text style={styles.compactAmount}>{clubCredits.toLocaleString()}</Text>
            {pendingCredits > 0 && (
              <View style={styles.compactPendingBadge}>
                <Text style={styles.compactPendingText}>+{pendingCredits}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Container>
    );
  }

  return (
    <Container
      style={styles.container}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      <LinearGradient
        colors={['rgba(255, 215, 0, 0.2)', 'rgba(255, 165, 0, 0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⭐</Text>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.amount}>{clubCredits.toLocaleString()}</Text>
            <Text style={styles.label}>Rally Credits</Text>
            {pendingCredits > 0 && (
              <Text style={styles.pendingLabel}>({pendingCredits} pending)</Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 16,
  },
  textContainer: {
    flex: 1,
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  pendingLabel: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '500',
    marginTop: 2,
  },
  // Compact styles
  compactContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  compactGradient: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  compactIcon: {
    fontSize: 12,
  },
  compactAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
  },
  compactPendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  compactPendingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
  },
});
