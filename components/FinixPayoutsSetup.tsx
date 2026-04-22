import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, Linking, Pressable } from 'react-native';
import { Card, Button, Text, useTheme, Chip, Divider, Checkbox } from 'react-native-paper';
import { Timestamp } from 'firebase/firestore';
import { createSubMerchantAccount, getSubMerchantStatus } from '../lib/finix';
import { updateClub } from '../lib/firebase';
import type { Club } from '../lib/firebase';

interface FinixPayoutsSetupProps {
  club: Club;
  isAdmin: boolean;
  acceptedByUid?: string;
  onStatusChange?: () => void;
}

export default function FinixPayoutsSetup({ club, isAdmin, acceptedByUid, onStatusChange }: FinixPayoutsSetupProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [tosAccepted, setTosAccepted] = useState(!!club.finixTosAcceptedAt);
  const [feesAccepted, setFeesAccepted] = useState(!!club.finixFeesAcceptedAt);

  useEffect(() => {
    if (club.finixMerchantId || club.finixIdentityId) {
      checkStatus();
    }
  }, [club.finixMerchantId, club.finixIdentityId]);

  const checkStatus = async () => {
    if (!club.finixMerchantId && !club.finixIdentityId) return;
    setChecking(true);
    try {
      const result = await getSubMerchantStatus({
        merchantId: club.finixMerchantId,
        identityId: club.finixIdentityId,
        clubId: club.id,
      });

      if (result.success) {
        setAccountStatus(result);
        if (result.isComplete && !club.finixMerchantAccountActive) {
          await updateClub(club.id, {
            finixMerchantId: result.merchantId || club.finixMerchantId,
            finixMerchantAccountActive: true,
            finixOnboardingComplete: true,
            finixOnboardingStatus: 'APPROVED',
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
    const hasStartedOnboarding = !!club.finixIdentityId;
    if (!hasStartedOnboarding && (!tosAccepted || !feesAccepted)) {
      Alert.alert('Accept Terms', 'Please review and accept the Terms of Service and fee schedule before continuing.');
      return;
    }

    setLoading(true);
    try {
      if (!club.finixTosAcceptedAt || !club.finixFeesAcceptedAt) {
        const now = Timestamp.now();
        await updateClub(club.id, {
          finixTosAcceptedAt: now,
          finixFeesAcceptedAt: now,
          finixAcceptedByUid: acceptedByUid ?? null,
        });
      }

      const result = await createSubMerchantAccount(
        club.id,
        club.contactEmail || '',
        club.name
      );

      if (result.success && result.onboardingUrl) {
        await Linking.openURL(result.onboardingUrl);
        onStatusChange?.();
      } else if (result.success && result.status === 'APPROVED') {
        Alert.alert('Already Connected', 'This club is already set up for payouts.');
      } else {
        Alert.alert('Setup Error', result.error || 'Failed to start onboarding. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to set up payouts');
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = () => {
    if (!club.finixIdentityId && !club.finixMerchantId) {
      return <Chip icon="alert-circle" mode="outlined" textStyle={{ color: theme.colors.error }}>Not Connected</Chip>;
    }
    if (club.finixMerchantAccountActive || club.finixOnboardingComplete) {
      return <Chip icon="check-circle" mode="outlined" textStyle={{ color: '#10B981' }}>Active</Chip>;
    }
    if (club.finixOnboardingDeclined) {
      return <Chip icon="close-circle" mode="outlined" textStyle={{ color: theme.colors.error }}>Declined</Chip>;
    }
    if (club.finixMerchantId) {
      return <Chip icon="clock" mode="outlined" textStyle={{ color: theme.colors.primary }}>Pending Approval</Chip>;
    }
    return <Chip icon="file-document-edit-outline" mode="outlined" textStyle={{ color: theme.colors.primary }}>Pending Submission</Chip>;
  };

  const getStatusDetails = () => {
    if (!accountStatus) return null;
    return (
      <View style={styles.statusDetails}>
        <Text variant="bodySmall" style={{ marginBottom: 8 }}>Account Details:</Text>
        <View style={styles.statusRow}>
          <Text variant="bodySmall">Status:</Text>
          <Text variant="bodySmall" style={{ color: accountStatus.isComplete ? '#10B981' : theme.colors.primary }}>
            {accountStatus.status || 'Unknown'}
          </Text>
        </View>
        {accountStatus.merchantId && (
          <View style={styles.statusRow}>
            <Text variant="bodySmall">Merchant ID:</Text>
            <Text variant="bodySmall">{accountStatus.merchantId}</Text>
          </View>
        )}
      </View>
    );
  };

  const isConnected = !!club.finixMerchantId;
  const isActive = !!club.finixMerchantAccountActive || !!club.finixOnboardingComplete;
  const hasStarted = !!club.finixIdentityId;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Payouts</Text>
          {getStatusChip()}
        </View>

        <Divider style={styles.divider} />

        <Text variant="bodyMedium" style={styles.description}>
          {isActive
            ? 'Your club is ready to receive payments! Users can purchase tickets to your paid events.'
            : club.finixMerchantId
            ? 'Your payout application is pending approval. You will be able to receive payments once Finix approves it (usually within 1–2 business days).'
            : hasStarted
            ? "You've started setup but haven't submitted your application to Finix yet. Tap Resume Setup to finish the form."
            : 'Set up your payout account to receive revenue from paid events. KYC verification is handled securely by Finix.'}
        </Text>

        {hasStarted && !isActive && club.finixTosAcceptedAt && (
          <Text variant="bodySmall" style={[styles.description, { color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }]}>
            You agreed to the Terms and fee schedule on{' '}
            {club.finixTosAcceptedAt.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}.
          </Text>
        )}

        {hasStarted && accountStatus && getStatusDetails()}

        {!hasStarted && (
          <View style={[styles.disclosures, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
            <Text variant="labelMedium" style={{ fontWeight: 'bold', marginBottom: 8 }}>Before you continue</Text>
            <Pressable style={styles.checkRow} onPress={() => setTosAccepted(!tosAccepted)}>
              <Checkbox.Android
                status={tosAccepted ? 'checked' : 'unchecked'}
                onPress={() => setTosAccepted(!tosAccepted)}
                color={theme.colors.primary}
                uncheckedColor={theme.colors.onSurfaceVariant}
              />
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
                I agree to the RallySphere Terms of Service and authorize Finix to verify my identity.
              </Text>
            </Pressable>
            <Pressable style={styles.checkRow} onPress={() => setFeesAccepted(!feesAccepted)}>
              <Checkbox.Android
                status={feesAccepted ? 'checked' : 'unchecked'}
                onPress={() => setFeesAccepted(!feesAccepted)}
                color={theme.colors.primary}
                uncheckedColor={theme.colors.onSurfaceVariant}
              />
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
                I understand RallySphere charges 10% + $0.29 per ticket/item sale. Payouts are processed by Finix.
              </Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.benefits, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
          <Text variant="labelMedium" style={{ fontWeight: 'bold', marginBottom: 10, color: theme.colors.primary }}>
            Benefits
          </Text>
          {[
            { icon: '💸', text: 'Bank deposits directly to your account' },
            { icon: '💰', text: 'Keep 100% of ticket price — service fee is paid by the buyer' },
            { icon: '🔒', text: 'Identity verified securely by Finix (Persona KYC)' },
            { icon: '📊', text: 'Full transaction history in your dashboard' },
          ].map((item, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{item.icon}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {!hasStarted && (
            <Button
              mode="contained"
              onPress={handleSetupPayouts}
              loading={loading}
              disabled={loading || !isAdmin || !tosAccepted || !feesAccepted}
              icon="bank"
              style={styles.button}
            >
              Continue to Finix
            </Button>
          )}

          {hasStarted && !isActive && (
            <Button
              mode="contained"
              onPress={handleSetupPayouts}
              loading={loading}
              disabled={loading || !isAdmin}
              icon="refresh"
              style={styles.button}
            >
              Resume Setup
            </Button>
          )}

          {isConnected && (
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
  card: { marginVertical: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  divider: { marginVertical: 12 },
  description: { marginBottom: 12, lineHeight: 20 },
  disclosures: { marginTop: 4, marginBottom: 16, padding: 14, borderRadius: 10, borderWidth: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  benefits: { marginTop: 4, marginBottom: 16, padding: 14, borderRadius: 10, borderWidth: 1 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  benefitIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  statusDetails: { marginTop: 12, marginBottom: 12, padding: 12, backgroundColor: 'rgba(0, 0, 0, 0.04)', borderRadius: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1 },
  adminNote: { marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
});
