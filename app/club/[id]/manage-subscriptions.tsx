// app/club/[id]/manage-subscriptions.tsx - Club Subscription Management
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import {
  Text,
  IconButton,
  Switch,
  ActivityIndicator,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  updateClubSubscriptionSettings,
  getClubSubscribers,
  getUserProfile,
} from '../../../lib/firebase';
import type { Club, ClubSubscription, UserProfile } from '../../../lib/firebase';
import GlassInput from '../../../components/GlassInput';
import GlassButton from '../../../components/GlassButton';

export default function ManageSubscriptionsScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [subscribers, setSubscribers] = useState<ClubSubscription[]>([]);
  const [subscriberProfiles, setSubscriberProfiles] = useState<Map<string, UserProfile>>(new Map());

  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = useState('');
  const [subscriptionDescription, setSubscriptionDescription] = useState('');

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
        setSubscriptionEnabled(clubResult.club.subscriptionEnabled || false);
        setSubscriptionPrice(clubResult.club.subscriptionPrice?.toString() || '');
        setSubscriptionDescription(clubResult.club.subscriptionDescription || '');

        // Check if user is admin
        if (user && !clubResult.club.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You must be an admin to manage subscriptions.');
          router.back();
          return;
        }
      } else {
        Alert.alert('Error', 'Club not found');
        router.back();
        return;
      }

      // Load subscribers
      const subscribersResult = await getClubSubscribers(clubId);
      if (subscribersResult.success) {
        setSubscribers(subscribersResult.subscriptions);

        // Load subscriber profiles
        const profiles = new Map<string, UserProfile>();
        await Promise.all(
          subscribersResult.subscriptions.map(async (sub) => {
            const profile = await getUserProfile(sub.userId);
            if (profile) {
              profiles.set(sub.userId, profile);
            }
          })
        );
        setSubscriberProfiles(profiles);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSaveSettings = async () => {
    if (!club) return;

    const price = parseFloat(subscriptionPrice);
    if (subscriptionEnabled && (!price || price <= 0)) {
      Alert.alert('Invalid Price', 'Please enter a valid subscription price greater than $0.');
      return;
    }

    setSaving(true);
    try {
      const result = await updateClubSubscriptionSettings(clubId, {
        subscriptionEnabled,
        subscriptionPrice: price || 0,
        subscriptionDescription: subscriptionDescription.trim(),
      });

      if (result.success) {
        Alert.alert('Success', 'Subscription settings saved successfully!');
        await loadData();
      } else {
        Alert.alert('Error', result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.blackBackground} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  if (!club) {
    return null;
  }

  const activeSubscribers = subscribers.filter(s => s.status === 'active');

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={['rgba(255, 215, 0, 0.2)', 'rgba(255, 165, 0, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint="dark" style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor="#fff" />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Subscriptions</Text>
            <Text style={styles.headerSubtitle}>{club.name}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          {/* Stats */}
          <View style={styles.statsRow}>
            <BlurView intensity={20} tint="dark" style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Text style={[styles.statValue, { color: '#FFD700' }]}>{activeSubscribers.length}</Text>
                <Text style={styles.statLabel}>Active Subscribers</Text>
              </View>
            </BlurView>

            <BlurView intensity={20} tint="dark" style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>
                  ${((club.subscriptionPrice || 0) * activeSubscribers.length * 0.9).toFixed(0)}
                </Text>
                <Text style={styles.statLabel}>Monthly Revenue</Text>
              </View>
            </BlurView>
          </View>

          {/* Settings Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription Settings</Text>

            <BlurView intensity={20} tint="dark" style={styles.settingsCard}>
              <View style={styles.settingsCardInner}>
                {/* Enable Toggle */}
                <View style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Enable Subscriptions</Text>
                    <Text style={styles.settingDescription}>
                      Allow members to subscribe to your club for exclusive perks
                    </Text>
                  </View>
                  <Switch
                    value={subscriptionEnabled}
                    onValueChange={setSubscriptionEnabled}
                    color="#FFD700"
                  />
                </View>

                {subscriptionEnabled && (
                  <>
                    {/* Price Input */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Monthly Price ($)</Text>
                      <GlassInput
                        value={subscriptionPrice}
                        onChangeText={setSubscriptionPrice}
                        placeholder="9.99"
                        keyboardType="decimal-pad"
                        icon="currency-usd"
                      />
                      <Text style={styles.feeNote}>
                        Platform fee: 10% | You receive: ${subscriptionPrice ? (parseFloat(subscriptionPrice) * 0.9).toFixed(2) : '0.00'}/subscriber
                      </Text>
                    </View>

                    {/* Description Input */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Subscriber Benefits</Text>
                      <GlassInput
                        value={subscriptionDescription}
                        onChangeText={setSubscriptionDescription}
                        placeholder="Describe the perks subscribers get..."
                        multiline
                        numberOfLines={3}
                        style={{ height: 80 }}
                      />
                    </View>
                  </>
                )}
              </View>
            </BlurView>

            <GlassButton
              title="Save Settings"
              onPress={handleSaveSettings}
              loading={saving}
              disabled={saving}
              variant="primary"
              isReady={true}
            />
          </View>

          {/* Subscribers List */}
          {activeSubscribers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Subscribers</Text>

              {activeSubscribers.map((subscription) => {
                const profile = subscriberProfiles.get(subscription.userId);
                const displayName = profile
                  ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email || 'User'
                  : 'Loading...';
                const initials = profile
                  ? `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`.toUpperCase() || '?'
                  : '?';

                return (
                  <BlurView key={subscription.id} intensity={20} tint="dark" style={styles.subscriberCard}>
                    <View style={styles.subscriberCardInner}>
                      <View style={styles.subscriberInfo}>
                        {profile?.avatar ? (
                          <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                        ) : (
                          <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>{initials}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.subscriberName}>{displayName}</Text>
                          <Text style={styles.subscriberDate}>
                            Since {subscription.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.subscriberMeta}>
                        <Chip
                          style={[
                            styles.statusChip,
                            subscription.status === 'active' && styles.activeChip,
                          ]}
                          textStyle={styles.statusChipText}
                        >
                          {subscription.status}
                        </Chip>
                        <Text style={styles.subscriberAmount}>
                          ${subscription.amount?.toFixed(2) || '0.00'}/mo
                        </Text>
                      </View>
                    </View>
                  </BlurView>
                );
              })}
            </View>
          )}

          {activeSubscribers.length === 0 && subscriptionEnabled && (
            <View style={styles.emptyState}>
              <IconButton icon="star-circle-outline" size={48} iconColor="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No subscribers yet</Text>
              <Text style={styles.emptyHint}>
                Share your club with members to grow your subscriber base
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statCardInner: {
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  settingsCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  settingsCardInner: {
    padding: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  settingDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    maxWidth: 260,
  },
  inputContainer: {
    marginTop: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  feeNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    fontStyle: 'italic',
  },
  subscriberCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  subscriberCardInner: {
    padding: 16,
  },
  subscriberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 18,
  },
  subscriberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  subscriberDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  subscriberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  activeChip: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
  },
  statusChipText: {
    fontSize: 12,
    color: '#fff',
    textTransform: 'capitalize',
  },
  subscriberAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
    textAlign: 'center',
  },
});
