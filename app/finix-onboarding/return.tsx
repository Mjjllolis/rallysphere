// app/finix-onboarding/return.tsx — Hosted onboarding return handler
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator, useTheme, Card } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { getSubMerchantStatus } from '../../lib/finix';
import { updateClub, getClub } from '../../lib/firebase';

export default function FinixOnboardingReturn() {
  const theme = useTheme();
  const { clubId, identityId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      verifyOnboarding();
    }
  }, [clubId]);

  const verifyOnboarding = async () => {
    try {
      const clubResult = await getClub(clubId as string);
      if (!clubResult.success || !clubResult.club) {
        setError('Club not found');
        setLoading(false);
        setTimeout(() => handleContinue(), 2000);
        return;
      }

      const club = clubResult.club;
      const lookupIdentityId = (identityId as string) || club.finixIdentityId;
      if (!lookupIdentityId && !club.finixMerchantId) {
        setError('No payout application found for this club');
        setLoading(false);
        setTimeout(() => handleContinue(), 2000);
        return;
      }

      const statusResult = await getSubMerchantStatus({
        identityId: lookupIdentityId,
        merchantId: club.finixMerchantId,
        clubId: club.id,
      });

      if (statusResult.success && statusResult.isComplete) {
        await updateClub(clubId as string, {
          finixMerchantId: statusResult.merchantId || club.finixMerchantId,
          finixMerchantAccountActive: true,
          finixOnboardingComplete: true,
          finixOnboardingStatus: 'APPROVED',
        });
        setSuccess(true);
        setTimeout(() => handleContinue(), 3000);
      } else if (statusResult.success) {
        setPending(true);
        setTimeout(() => handleContinue(), 3500);
      } else {
        setError(statusResult.error || 'Could not verify onboarding status');
        setTimeout(() => handleContinue(), 2500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify onboarding status');
      setTimeout(() => handleContinue(), 2500);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (clubId) {
      router.replace(`/club/${clubId}`);
    } else {
      router.replace('/(tabs)/clubs');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          {success ? (
            <>
              <View style={styles.successIcon}>
                <Text style={{ fontSize: 64 }}>✓</Text>
              </View>
              <Text variant="headlineSmall" style={[styles.title, { color: '#4CAF50' }]}>
                Setup Complete!
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Your club is now ready to accept payments and receive payouts.
              </Text>
              <Text variant="bodySmall" style={[styles.subtitle, { opacity: 0.6, fontStyle: 'italic' }]}>
                Returning to club page...
              </Text>
              <Button mode="contained" onPress={handleContinue} style={styles.button}>
                Go to Club Now
              </Button>
            </>
          ) : pending ? (
            <>
              <View style={styles.infoIcon}>
                <Text style={{ fontSize: 64 }}>⏳</Text>
              </View>
              <Text variant="headlineSmall" style={styles.title}>
                Application Submitted
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Finix is reviewing your application. You'll be able to accept payments once it's approved (usually 1–2 business days).
              </Text>
              <Button mode="contained" onPress={handleContinue} style={styles.button}>
                Return to Club
              </Button>
            </>
          ) : error ? (
            <>
              <View style={styles.errorIcon}>
                <Text style={{ fontSize: 64 }}>✕</Text>
              </View>
              <Text variant="titleLarge" style={styles.title}>Setup Issue</Text>
              <Text variant="bodyMedium" style={styles.subtitle}>{error}</Text>
              <Button mode="contained" onPress={handleContinue} style={styles.button}>
                Return to Club
              </Button>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text variant="titleLarge" style={styles.title}>
                Verifying your account...
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                This only takes a moment.
              </Text>
            </>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { padding: 20 },
  content: { alignItems: 'center', gap: 16 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(76, 175, 80, 0.1)', justifyContent: 'center', alignItems: 'center' },
  errorIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(244, 67, 54, 0.1)', justifyContent: 'center', alignItems: 'center' },
  infoIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(33, 150, 243, 0.1)', justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  subtitle: { textAlign: 'center', opacity: 0.8, marginBottom: 16 },
  button: { minWidth: 200 },
});
