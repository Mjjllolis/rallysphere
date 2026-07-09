// app/club/[id]/payout-onboarding.tsx — In-app Finix merchant onboarding wizard
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, IconButton, useTheme, Card } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useAuth, useThemeToggle } from '../../_layout';
import { getClub } from '../../../lib/firebase';
import type { Club } from '../../../lib/firebase';
import FinixOnboardingWizard from '../../../components/FinixOnboardingWizard';

export default function PayoutOnboardingScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);

  const loadClubData = async () => {
    try {
      const result = await getClub(clubId);
      if (result.success && result.club) {
        setClub(result.club);
      } else {
        Alert.alert('Error', 'Club not found');
        router.back();
      }
    } catch {
      Alert.alert('Error', 'Failed to load club information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clubId) loadClubData();
  }, [clubId]);

  const isAdmin = user && club ? club.admins.includes(user.uid) : false;

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
            <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
            </BlurView>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Set Up Payouts</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club?.name}</Text>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {loading || !club ? (
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>Loading…</Text>
            ) : !isAdmin ? (
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>Only club admins can set up payouts.</Text>
            ) : (
              <Card style={styles.card}>
                <Card.Content>
                  <FinixOnboardingWizard
                    club={club}
                    acceptedByUid={user?.uid}
                    themeName={isDark ? 'dark' : 'light'}
                    onComplete={loadClubData}
                  />
                </Card.Content>
              </Card>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backButton: { borderRadius: 20, overflow: 'hidden' },
  backButtonBlur: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  card: { marginVertical: 8 },
});
