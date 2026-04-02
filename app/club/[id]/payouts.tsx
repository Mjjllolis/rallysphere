// app/club/[id]/payouts.tsx - Stripe Connect Payouts Management
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth, useThemeToggle } from '../../_layout';
import { getClub } from '../../../lib/firebase';
import type { Club } from '../../../lib/firebase';
import StripeConnectSetup from '../../../components/StripeConnectSetup';

export default function ClubPayoutsScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

  const loadClubData = async () => {
    try {
      setLoading(true);
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      } else {
        Alert.alert('Error', 'Club not found');
        router.back();
      }
    } catch (error) {
      // console.error('Error loading club data:', error);
      Alert.alert('Error', 'Failed to load club information');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !club) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.background, { backgroundColor: theme.colors.background }]} />
        </View>
        <LinearGradient
          colors={isDark ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(27, 54, 93, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.loadingContainer}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>Loading...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isAdmin = user ? club.admins.includes(user.uid) : false;

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.background, { backgroundColor: theme.colors.background }]} />
        </View>
        <LinearGradient
          colors={isDark ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(27, 54, 93, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.backButtonBlur}>
                <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
              </BlurView>
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Manage Payouts</Text>
            </View>
          </View>
          <View style={styles.errorContainer}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>Only club admins can manage payouts</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.background, { backgroundColor: theme.colors.background }]} />
      </View>

      <LinearGradient
        colors={isDark ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(27, 54, 93, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
            </BlurView>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Manage Payouts</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club?.name}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
        >
          <StripeConnectSetup
            club={club}
            isAdmin={isAdmin}
            onStatusChange={loadClubData}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  backButtonBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
