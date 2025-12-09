// app/profile/subscription.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { Text, Button, Card, Divider, useTheme, Chip, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../_layout';
import {
  getUserProfile,
  getUserProSubscription,
  createUserProSubscription,
  cancelUserProSubscription,
} from '../../lib/firebase';
import type { UserProfile, UserProSubscription } from '../../lib/firebase';

export default function UserSubscriptionScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<UserProSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const userProfile = await getUserProfile(user.uid);
      setProfile(userProfile);

      const subResult = await getUserProSubscription(user.uid);
      if (subResult.success && subResult.subscription) {
        setSubscription(subResult.subscription);
      }
    } catch (error) {
      console.error('Error loading subscription data:', error);
      Alert.alert('Error', 'Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!user) return;

    setActionLoading(true);
    try {
      const result = await createUserProSubscription(user.uid, user.email || '');
      if (result.success && result.sessionUrl) {
        // Open Stripe Checkout in browser
        await Linking.openURL(result.sessionUrl);
      } else {
        Alert.alert('Error', result.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    Alert.alert(
      'Cancel Pro Membership',
      'Are you sure you want to cancel your Pro membership? You will lose access to Pro features at the end of your billing period.',
      [
        { text: 'Keep Pro', style: 'cancel' },
        {
          text: 'Cancel Membership',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const result = await cancelUserProSubscription(user.uid);
              if (result.success) {
                Alert.alert('Success', 'Your Pro membership has been canceled. You will retain access until the end of your billing period.');
                await loadData();
              } else {
                Alert.alert('Error', result.error || 'Failed to cancel membership');
              }
            } catch (error) {
              console.error('Error canceling subscription:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text variant="bodyLarge">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPro = profile?.isPro && profile?.proSubscriptionStatus === 'active';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Button icon="arrow-left" onPress={() => router.back()}>
            Back
          </Button>
          <Text variant="headlineMedium" style={styles.headerTitle}>
            Pro Membership
          </Text>
        </View>

        {/* Current Status */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusHeader}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Current Status
              </Text>
              {isPro ? (
                <Chip icon="crown" style={styles.proChip} textStyle={styles.proChipText}>
                  PRO
                </Chip>
              ) : (
                <Chip style={styles.freeChip}>FREE</Chip>
              )}
            </View>

            <Divider style={styles.divider} />

            {isPro && subscription ? (
              <View style={styles.subscriptionDetails}>
                <List.Item
                  title="Billing Period"
                  description={`${formatDate(subscription.currentPeriodStart)} - ${formatDate(
                    subscription.currentPeriodEnd
                  )}`}
                  left={(props) => <List.Icon {...props} icon="calendar" />}
                />
                <List.Item
                  title="Status"
                  description={subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                  left={(props) => <List.Icon {...props} icon="information" />}
                />
                {subscription.cancelAtPeriodEnd && (
                  <View style={styles.cancelNotice}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                      ⚠️ Your membership will be canceled at the end of the billing period
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.upgradeSection}>
                <Text variant="bodyLarge" style={styles.upgradeText}>
                  Upgrade to Pro to unlock exclusive features and show your premium status with a
                  gold badge!
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Pro Features */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Pro Features
            </Text>
            <Divider style={styles.divider} />

            <List.Item
              title="Premium Badge"
              description="Display a gold 'PRO' badge on your profile"
              left={(props) => <List.Icon {...props} icon="crown" color="#FFD700" />}
            />
            <List.Item
              title="Priority Support"
              description="Get faster response times from our support team"
              left={(props) => <List.Icon {...props} icon="headset" />}
            />
            <List.Item
              title="Exclusive Content"
              description="Access to Pro-only events and features (Coming Soon)"
              left={(props) => <List.Icon {...props} icon="star" />}
            />
            <List.Item
              title="Advanced Profile"
              description="Customize your profile with advanced options (Coming Soon)"
              left={(props) => <List.Icon {...props} icon="account-star" />}
            />
          </Card.Content>
        </Card>

        {/* Pricing */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Pricing
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.pricingContainer}>
              <Text variant="displaySmall" style={styles.priceText}>
                $10
              </Text>
              <Text variant="titleMedium" style={styles.pricePeriod}>
                per month
              </Text>
            </View>

            <Text variant="bodyMedium" style={styles.pricingNote}>
              Cancel anytime. No long-term commitment required.
            </Text>
          </Card.Content>
        </Card>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          {isPro ? (
            <>
              {!subscription?.cancelAtPeriodEnd && (
                <Button
                  mode="outlined"
                  onPress={handleCancelSubscription}
                  loading={actionLoading}
                  disabled={actionLoading}
                  style={styles.actionButton}
                  buttonColor="transparent"
                  textColor={theme.colors.error}
                >
                  Cancel Membership
                </Button>
              )}
            </>
          ) : (
            <Button
              mode="contained"
              onPress={handleSubscribe}
              loading={actionLoading}
              disabled={actionLoading}
              style={styles.actionButton}
              icon="crown"
            >
              Become a Pro Member - $10/month
            </Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
    marginTop: 8,
  },
  card: {
    margin: 16,
    marginTop: 8,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  proChip: {
    backgroundColor: '#FFD700',
  },
  proChipText: {
    color: '#000',
    fontWeight: 'bold',
  },
  freeChip: {
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  divider: {
    marginVertical: 16,
  },
  subscriptionDetails: {
    gap: 8,
  },
  cancelNotice: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,0,0,0.1)',
  },
  upgradeSection: {
    paddingVertical: 8,
  },
  upgradeText: {
    textAlign: 'center',
    opacity: 0.8,
  },
  pricingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  priceText: {
    fontWeight: 'bold',
    color: '#60A5FA',
  },
  pricePeriod: {
    opacity: 0.7,
    marginTop: 4,
  },
  pricingNote: {
    textAlign: 'center',
    opacity: 0.7,
    marginTop: 8,
  },
  actionContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  actionButton: {
    paddingVertical: 8,
  },
});
