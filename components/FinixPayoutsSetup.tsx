import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Card, Button, Text, ActivityIndicator, useTheme, Chip, Divider } from 'react-native-paper';
import { createSubMerchantAccount, getSubMerchantStatus } from '../lib/stripe';
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
    if (club.braintreeMerchantAccountId) {
      checkStatus();
    }
  }, [club.braintreeMerchantAccountId]);

  const checkStatus = async () => {
    if (!club.braintreeMerchantAccountId) return;

    setChecking(true);
    try {
      const result = await getSubMerchantStatus(club.braintreeMerchantAccountId);

      if (result.success) {
        setAccountStatus(result);

        if (result.status === 'active' && !club.braintreeMerchantAccountActive) {
          await updateClub(club.id, {
            braintreeMerchantAccountActive: true,
            braintreeMerchantAccountStatus: 'active',
          });
          onStatusChange?.();
          Alert.alert('Success!', 'Your payout account is now active and ready to receive payments!');
        }
      }
    } catch (error) {
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
      const result = await createSubMerchantAccount(
        club.id,
        club.contactEmail || '',
        club.name
      );

      if (result.success && result.merchantAccountId) {
        await updateClub(club.id, {
          braintreeMerchantAccountId: result.merchantAccountId,
          braintreeMerchantAccountStatus: result.status || 'pending',
        });

        onStatusChange?.();

        Alert.alert(
          'Payout Account Created',
          'Your payout account has been submitted for review. You will be able to receive payments once it is approved (usually within 1-2 business days).',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Setup Error',
          result.error || 'Failed to create payout account. Please try again.'
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to set up payouts');
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = () => {
    if (!club.braintreeMerchantAccountId) {
      return <Chip icon="alert-circle" mode="outlined" textStyle={{ color: theme.colors.error }}>Not Connected</Chip>;
    }

    if (club.braintreeMerchantAccountActive) {
      return <Chip icon="check-circle" mode="outlined" textStyle={{ color: theme.colors.success }}>Active</Chip>;
    }

    return <Chip icon="clock" mode="outlined" textStyle={{ color: theme.colors.primary }}>Pending Approval</Chip>;
  };

  const getStatusDetails = () => {
    if (!accountStatus) return null;

    return (
      <View style={styles.statusDetails}>
        <Text variant="bodySmall" style={{ marginBottom: 8 }}>Account Details:</Text>
        <View style={styles.statusRow}>
          <Text variant="bodySmall">Status:</Text>
          <Text variant="bodySmall" style={{ color: accountStatus.status === 'active' ? theme.colors.success : theme.colors.primary }}>
            {accountStatus.status ? accountStatus.status.charAt(0).toUpperCase() + accountStatus.status.slice(1) : 'Unknown'}
          </Text>
        </View>
        {accountStatus.merchantAccountId && (
          <View style={styles.statusRow}>
            <Text variant="bodySmall">Account ID:</Text>
            <Text variant="bodySmall">{accountStatus.merchantAccountId}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Payouts</Text>
          {getStatusChip()}
        </View>

        <Divider style={styles.divider} />

        <Text variant="bodyMedium" style={styles.description}>
          {club.braintreeMerchantAccountActive
            ? 'Your club is ready to receive payments! Users can purchase tickets to your paid events.'
            : club.braintreeMerchantAccountId
            ? 'Your payout account is pending approval. You will be able to receive payments once it is approved.'
            : 'Set up your payout account to receive revenue from paid events. All compliance and verification is handled securely.'}
        </Text>

        {club.braintreeMerchantAccountId && accountStatus && getStatusDetails()}

        <View style={[styles.benefits, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
          <Text variant="labelMedium" style={{ fontWeight: 'bold', marginBottom: 10, color: theme.colors.primary }}>
            Benefits
          </Text>
          {[
            { icon: '💸', text: 'Weekly bank deposits directly to your account' },
            { icon: '💰', text: 'Keep 100% of ticket price — processing fee is paid by the buyer' },
            { icon: '🔒', text: 'Identity verified securely by Braintree' },
            { icon: '📊', text: 'Full transaction history in your dashboard' },
          ].map((item, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{item.icon}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {!club.braintreeMerchantAccountActive && !club.braintreeMerchantAccountId && (
            <Button
              mode="contained"
              onPress={handleSetupPayouts}
              loading={loading}
              disabled={loading || !isAdmin}
              icon="bank"
              style={styles.button}
            >
              Set Up Payouts
            </Button>
          )}

          {club.braintreeMerchantAccountId && (
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
    marginBottom: 12,
    lineHeight: 20,
  },
  benefits: {
    marginTop: 4,
    marginBottom: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  benefitIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  statusDetails: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
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
