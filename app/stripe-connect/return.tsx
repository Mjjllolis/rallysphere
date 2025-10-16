// app/stripe-connect/return.tsx - Stripe Connect onboarding return handler
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, ActivityIndicator, useTheme, Card } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { checkStripeAccountStatus } from '../../lib/stripe';
import { updateClub, getClub } from '../../lib/firebase';

export default function StripeConnectReturn() {
  const theme = useTheme();
  const { clubId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      verifyOnboarding();
    }
  }, [clubId]);

  const verifyOnboarding = async () => {
    try {
      // Get club to find stripe account ID
      const clubResult = await getClub(clubId as string);

      if (!clubResult.success || !clubResult.club) {
        setError('Club not found');
        setLoading(false);
        return;
      }

      const club = clubResult.club;

      if (!club.stripeAccountId) {
        setError('No Stripe account found for this club');
        setLoading(false);
        return;
      }

      // Check if onboarding is complete
      const statusResult = await checkStripeAccountStatus(club.stripeAccountId);

      if (statusResult.success && statusResult.isComplete) {
        // Update club status in Firestore
        await updateClub(clubId as string, {
          stripeOnboardingComplete: true,
          stripeAccountStatus: 'active',
        });

        setSuccess(true);
      } else {
        setError('Onboarding not complete. Please finish the setup process.');
      }
    } catch (err: any) {
      console.error('Error verifying onboarding:', err);
      setError(err.message || 'Failed to verify onboarding status');
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
          {loading ? (
            <>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text variant="titleLarge" style={styles.title}>
                Verifying Setup...
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Please wait while we verify your Stripe account
              </Text>
            </>
          ) : success ? (
            <>
              <View style={styles.successIcon}>
                <Text style={{ fontSize: 64 }}>✓</Text>
              </View>
              <Text variant="headlineSmall" style={[styles.title, { color: '#4CAF50' }]}>
                Setup Complete!
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Your club is now ready to accept payments and receive payouts through Stripe.
              </Text>
              <Button
                mode="contained"
                onPress={handleContinue}
                style={styles.button}
              >
                Go to Club
              </Button>
            </>
          ) : (
            <>
              <View style={styles.errorIcon}>
                <Text style={{ fontSize: 64 }}>⚠️</Text>
              </View>
              <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.error }]}>
                Setup Incomplete
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                {error || 'There was an issue completing your setup. Please try again.'}
              </Text>
              <Button
                mode="outlined"
                onPress={handleContinue}
                style={styles.button}
              >
                Return to Club
              </Button>
            </>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    padding: 20,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: 16,
  },
  button: {
    minWidth: 200,
  },
});
