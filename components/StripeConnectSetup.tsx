import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, Linking } from 'react-native';
import { Card, Button, Text, ActivityIndicator, useTheme, Chip, Divider } from 'react-native-paper';
import { createStripeConnectAccount, checkStripeAccountStatus } from '../lib/stripe';
import { updateClub } from '../lib/firebase';
import type { Club } from '../lib/firebase';

interface StripeConnectSetupProps {
  club: Club;
  isAdmin: boolean;
  onStatusChange?: () => void;
}

export default function StripeConnectSetup({ club, isAdmin, onStatusChange }: StripeConnectSetupProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accountStatus, setAccountStatus] = useState<any>(null);

  useEffect(() => {
    // Check status on mount if account exists
    if (club.stripeAccountId) {
      checkStatus();
    }
  }, [club.stripeAccountId]);

  const checkStatus = async () => {
    if (!club.stripeAccountId) return;

    setChecking(true);
    try {
      const result = await checkStripeAccountStatus(club.stripeAccountId);

      if (result.success) {
        setAccountStatus(result);

        // Update club if status has changed
        if (result.isComplete && !club.stripeOnboardingComplete) {
          await updateClub(club.id, {
            stripeOnboardingComplete: true,
            stripeAccountStatus: 'active',
          });
          onStatusChange?.();
          Alert.alert('Success!', 'Your Stripe account is now active and ready to receive payments!');
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
      Alert.alert('Error', 'Failed to check account status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleSetupPayouts = async () => {
    if (!isAdmin) {
      Alert.alert('Permission Denied', 'Only club admins can set up payouts.');
      return;
    }

    setLoading(true);

    try {
      console.log('=== STRIPE CONNECT SETUP ===');
      console.log('Club ID:', club.id);
      console.log('Club Email:', club.contactEmail);
      console.log('Club Name:', club.name);

      const result = await createStripeConnectAccount(
        club.id,
        club.contactEmail || '',
        club.name
      );

      console.log('Stripe Connect Result:', result);

      if (result.success && result.onboardingUrl) {
        // Open Stripe onboarding in browser
        const supported = await Linking.canOpenURL(result.onboardingUrl);

        if (supported) {
          await Linking.openURL(result.onboardingUrl);

          Alert.alert(
            'Continue in Browser',
            'Complete the Stripe onboarding process in your browser. When finished, return here to check your account status.',
            [{ text: 'OK', onPress: () => {
              // Trigger parent refresh
              onStatusChange?.();
            }}]
          );
        } else {
          Alert.alert('Error', 'Cannot open onboarding link');
        }
      } else {
        // Show detailed error to user
        const errorMsg = result.error || 'Failed to start onboarding';
        console.error('Stripe Connect Error:', errorMsg);
        Alert.alert(
          'Connection Error',
          errorMsg + '\n\nPlease make sure:\n• You are logged in\n• Firebase Functions are deployed\n• Stripe keys are configured'
        );
      }
    } catch (error: any) {
      console.error('Error setting up Stripe:', error);
      Alert.alert('Error', error.message || 'Failed to set up payouts');
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = () => {
    if (!club.stripeAccountId) {
      return <Chip icon="alert-circle" mode="outlined" textStyle={{ color: theme.colors.error }}>Not Connected</Chip>;
    }

    if (club.stripeOnboardingComplete) {
      return <Chip icon="check-circle" mode="outlined" textStyle={{ color: '#4CAF50' }}>Active</Chip>;
    }

    return <Chip icon="clock" mode="outlined" textStyle={{ color: theme.colors.primary }}>Pending Setup</Chip>;
  };

  const getStatusDetails = () => {
    if (!accountStatus) return null;

    return (
      <View style={styles.statusDetails}>
        <Text variant="bodySmall" style={{ marginBottom: 8 }}>Account Details:</Text>
        <View style={styles.statusRow}>
          <Text variant="bodySmall">Charges Enabled:</Text>
          <Text variant="bodySmall" style={{ color: accountStatus.chargesEnabled ? '#4CAF50' : theme.colors.error }}>
            {accountStatus.chargesEnabled ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text variant="bodySmall">Payouts Enabled:</Text>
          <Text variant="bodySmall" style={{ color: accountStatus.payoutsEnabled ? '#4CAF50' : theme.colors.error }}>
            {accountStatus.payoutsEnabled ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text variant="bodySmall">Details Submitted:</Text>
          <Text variant="bodySmall" style={{ color: accountStatus.detailsSubmitted ? '#4CAF50' : theme.colors.error }}>
            {accountStatus.detailsSubmitted ? 'Yes' : 'No'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Stripe Payouts</Text>
          {getStatusChip()}
        </View>

        <Divider style={styles.divider} />

        <Text variant="bodyMedium" style={styles.description}>
          {club.stripeOnboardingComplete
            ? 'Your club is ready to receive payments! Users can purchase tickets to your paid events.'
            : 'Connect your Stripe account to receive payouts from paid events. Stripe handles all compliance and verification securely.'}
        </Text>

        {club.stripeAccountId && accountStatus && getStatusDetails()}

        <View style={styles.benefits}>
          <Text variant="bodySmall" style={{ fontWeight: 'bold', marginBottom: 8 }}>
            Benefits:
          </Text>
          <Text variant="bodySmall">• Automatic payouts after each ticket sale</Text>
          <Text variant="bodySmall">• 90% of ticket revenue goes to your club</Text>
          <Text variant="bodySmall">• Secure identity verification by Stripe</Text>
          <Text variant="bodySmall">• Full transparency on all transactions</Text>
        </View>

        <View style={styles.actions}>
          {!club.stripeOnboardingComplete && (
            <Button
              mode="contained"
              onPress={handleSetupPayouts}
              loading={loading}
              disabled={loading || !isAdmin}
              icon="bank"
              style={styles.button}
            >
              {club.stripeAccountId ? 'Continue Setup' : 'Connect Stripe'}
            </Button>
          )}

          {club.stripeAccountId && (
            <Button
              mode="outlined"
              onPress={checkStatus}
              loading={checking}
              disabled={checking}
              icon="refresh"
              style={styles.button}
            >
              Check Status
            </Button>
          )}
        </View>

        {!isAdmin && (
          <Text variant="bodySmall" style={[styles.adminNote, { color: theme.colors.error }]}>
            Only club admins can manage payout settings
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  divider: {
    marginVertical: 12,
  },
  description: {
    marginBottom: 16,
    lineHeight: 20,
  },
  benefits: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
  },
  statusDetails: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
  adminNote: {
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
