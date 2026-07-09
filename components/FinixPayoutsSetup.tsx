import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme, Chip, Divider } from 'react-native-paper';
// The onboarding wizard is embedded directly on this screen (no navigation) so
// the three payout stages are visible without an extra "continue" tap.
import { getSubMerchantStatus } from '../lib/finix';
import { updateClub } from '../lib/firebase';
import type { Club } from '../lib/firebase';
import FinixOnboardingWizard from './FinixOnboardingWizard';

interface FinixPayoutsSetupProps {
  club: Club;
  isAdmin: boolean;
  acceptedByUid?: string;
  onStatusChange?: () => void;
}

export default function FinixPayoutsSetup({ club, isAdmin, acceptedByUid, onStatusChange }: FinixPayoutsSetupProps) {
  const theme = useTheme();
  const [checking, setChecking] = useState(false);
  const [accountStatus, setAccountStatus] = useState<any>(null);

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
        } else if (result.merchantId && !club.finixMerchantId) {
          await updateClub(club.id, {
            finixMerchantId: result.merchantId,
            finixOnboardingStatus: 'PENDING',
          });
          onStatusChange?.();
        }
      }
    } catch {
      // Non-fatal: the status chip just keeps its last known value.
    } finally {
      setChecking(false);
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
    if (club.finixMerchantId || accountStatus?.merchantId) {
      return <Chip icon="clock" mode="outlined" textStyle={{ color: theme.colors.primary }}>Pending Approval</Chip>;
    }
    return <Chip icon="file-document-edit-outline" mode="outlined" textStyle={{ color: theme.colors.primary }}>In Progress</Chip>;
  };

  const isActive = !!club.finixMerchantAccountActive || !!club.finixOnboardingComplete;

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
            : 'Complete the steps below to receive revenue from paid events. KYC verification is handled securely by Finix.'}
        </Text>

        {/* The stages live right here — no extra tap to reach them. */}
        {isAdmin ? (
          <FinixOnboardingWizard
            club={club}
            acceptedByUid={acceptedByUid}
            embedded
            themeName={theme.dark ? 'dark' : 'light'}
            onComplete={onStatusChange}
          />
        ) : (
          <Text variant="bodySmall" style={[styles.adminNote, { color: theme.colors.error }]}>
            Only club admins can manage payout settings
          </Text>
        )}

        {/* Benefits only serve as a first-run pitch — hide them once the admin has
            started onboarding (Payment Profile / identity created). */}
        {!club.finixIdentityId && !isActive && (
          <View style={[styles.benefits, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
            <Text variant="labelMedium" style={{ fontWeight: 'bold', marginBottom: 10, color: theme.colors.primary }}>
              Benefits
            </Text>
            {[
              'Bank deposits directly to your account',
              'Identity verified securely by Finix (Persona KYC)',
              'Full transaction history in your dashboard',
            ].map((text, i) => (
              <View key={i} style={styles.benefitRow}>
                <Text style={[styles.benefitIcon, { color: theme.colors.primary }]}>•</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>{text}</Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  divider: { marginVertical: 12 },
  description: { marginBottom: 16, lineHeight: 20 },
  benefits: { marginTop: 20, padding: 14, borderRadius: 10, borderWidth: 1 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  benefitIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  adminNote: { marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
});
