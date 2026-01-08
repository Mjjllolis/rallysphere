// app/club/[id]/manage.tsx - Club Admin Dashboard
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../_layout';
import {
  getClub,
  getClubAnalytics,
  getClubJoinRequests,
} from '../../../lib/firebase';
import type { Club } from '../../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ClubManageDashboard() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        if (user && !clubResult.club.admins.includes(user.uid)) {
          router.back();
          return;
        }
      } else {
        router.back();
        return;
      }

      const analyticsResult = await getClubAnalytics(clubId);
      if (analyticsResult.success) {
        setAnalytics(analyticsResult.analytics);
      }

      const requestsResult = await getClubJoinRequests(clubId, 'pending');
      if (requestsResult.success) {
        setPendingRequests(requestsResult.requests.length);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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

  const adminActions = [
    { title: 'Member Management', description: 'Manage members and join requests', icon: 'account-group', route: `/club/${clubId}/manage-members`, badge: pendingRequests },
    { title: 'Subscribers', description: 'Manage subscriber settings and pricing', icon: 'star-circle', route: `/club/${clubId}/manage-subscriptions`, badge: club?.subscribers?.length || 0 },
    { title: 'Analytics', description: 'View club performance metrics', icon: 'chart-line', route: `/club/${clubId}/analytics` },
    { title: 'Ticket Orders', description: 'View and manage event ticket sales', icon: 'ticket-confirmation', route: `/club/${clubId}/manage-ticket-orders` },
    { title: 'Manage Store', description: 'Add and edit store products', icon: 'store', route: `/club/${clubId}/manage-store` },
    { title: 'Store Orders', description: 'Fulfill customer store orders', icon: 'package-variant', route: `/club/${clubId}/manage-orders`, badge: analytics?.pendingOrders },
    { title: 'Create Event', description: 'Create a new club event', icon: 'calendar-plus', route: `/(tabs)/create-event?clubId=${clubId}` },
    { title: 'Edit Club', description: 'Update club profile and settings', icon: 'pencil', route: `/club/edit/${clubId}` },
    { title: 'Payouts', description: 'Configure Stripe payouts', icon: 'bank', route: `/club/${clubId}/payouts` },
    { title: 'Pro Subscription', description: 'Manage club Pro status', icon: 'crown', route: `/club/${clubId}/subscription` },
  ];

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
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
            <Text style={styles.headerTitle}>Admin Dashboard</Text>
            <Text style={styles.headerSubtitle}>{club.name}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          {/* Quick Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Stats</Text>
            <View style={styles.statsGrid}>
              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <Text style={styles.statValue}>{analytics?.memberCount || club.members.length}</Text>
                  <Text style={styles.statLabel}>Members</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <Text style={styles.statValue}>{analytics?.totalEvents || 0}</Text>
                  <Text style={styles.statLabel}>Events</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    ${(analytics?.totalRevenue || 0).toFixed(0)}
                  </Text>
                  <Text style={styles.statLabel}>Revenue</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <Text style={[styles.statValue, { color: '#F59E0B' }]}>{pendingRequests}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
              </BlurView>
            </View>
          </View>

          {/* Admin Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Tools</Text>
            {adminActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => router.push(action.route as any)}
                activeOpacity={0.7}
              >
                <BlurView intensity={20} tint="dark" style={styles.actionCard}>
                  <View style={styles.actionCardInner}>
                    <View style={styles.actionIconContainer}>
                      <IconButton icon={action.icon} size={28} iconColor="#60A5FA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      <Text style={styles.actionDescription}>{action.description}</Text>
                    </View>
                    {action.badge !== undefined && action.badge > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{action.badge}</Text>
                      </View>
                    )}
                    <IconButton icon="chevron-right" size={20} iconColor="rgba(255,255,255,0.5)" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - 44) / 2,
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
    fontSize: 32,
    fontWeight: '700',
    color: '#60A5FA',
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  actionCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96,165,250,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
