// app/club/[id]/analytics.tsx - Analytics Dashboard
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
} from '../../../lib/firebase';
import type { Club } from '../../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
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
    } catch (error) {
      console.error('Error loading analytics:', error);
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

  if (!club || !analytics) {
    return null;
  }

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
            <Text style={styles.headerTitle}>Analytics</Text>
            <Text style={styles.headerSubtitle}>{club.name}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          {/* Overview Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <IconButton icon="account-group" size={32} iconColor="#60A5FA" />
                  <Text style={styles.statValue}>{analytics.memberCount}</Text>
                  <Text style={styles.statLabel}>Total Members</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <IconButton icon="calendar" size={32} iconColor="#60A5FA" />
                  <Text style={styles.statValue}>{analytics.totalEvents}</Text>
                  <Text style={styles.statLabel}>Total Events</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <IconButton icon="currency-usd" size={32} iconColor="#10B981" />
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    ${analytics.totalRevenue.toFixed(2)}
                  </Text>
                  <Text style={styles.statLabel}>Total Revenue</Text>
                </View>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.statCard}>
                <View style={styles.statCardInner}>
                  <IconButton icon="account-multiple" size={32} iconColor="#F59E0B" />
                  <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                    {analytics.avgAttendancePerEvent}
                  </Text>
                  <Text style={styles.statLabel}>Avg Attendance</Text>
                </View>
              </BlurView>
            </View>
          </View>

          {/* Member Growth */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Member Growth (Last 6 Months)</Text>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardInner}>
                {analytics.memberGrowth.map((data: any, index: number) => (
                  <View key={index} style={styles.growthRow}>
                    <Text style={styles.growthMonth}>{data.month}</Text>
                    <View style={styles.growthBar}>
                      <View
                        style={[
                          styles.growthBarFill,
                          {
                            width: `${(data.members / analytics.memberCount) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.growthValue}>{data.members}</Text>
                  </View>
                ))}
              </View>
            </BlurView>
          </View>

          {/* Event Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Statistics</Text>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardInner}>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Total Event Attendance</Text>
                  <Text style={styles.statRowValue}>{analytics.totalEventAttendance}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Upcoming Events</Text>
                  <Text style={[styles.statRowValue, { color: '#60A5FA' }]}>
                    {analytics.upcomingEvents}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Past Events</Text>
                  <Text style={styles.statRowValue}>{analytics.pastEvents}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Average per Event</Text>
                  <Text style={[styles.statRowValue, { color: '#F59E0B' }]}>
                    {analytics.avgAttendancePerEvent}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>

          {/* Revenue Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store Revenue</Text>
            <BlurView intensity={20} tint="dark" style={styles.card}>
              <View style={styles.cardInner}>
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Total Revenue</Text>
                  <Text style={[styles.statRowValue, { color: '#10B981', fontSize: 24 }]}>
                    ${analytics.totalRevenue.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Total Orders</Text>
                  <Text style={styles.statRowValue}>{analytics.totalOrders}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Pending Orders</Text>
                  <Text style={[styles.statRowValue, { color: '#F59E0B' }]}>
                    {analytics.pendingOrders}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>

          {/* Top Events */}
          {analytics.topEvents && analytics.topEvents.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Events by Attendance</Text>
              <BlurView intensity={20} tint="dark" style={styles.card}>
                <View style={styles.cardInner}>
                  {analytics.topEvents.map((event: any, index: number) => (
                    <React.Fragment key={event.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <View style={styles.eventRow}>
                        <View style={styles.eventRank}>
                          <Text style={styles.eventRankText}>#{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {event.title}
                          </Text>
                          <Text style={styles.eventDetails}>
                            {event.attendees} / {event.maxAttendees || '∞'} attendees
                            {event.maxAttendees &&
                              ` • ${Math.round((event.attendees / event.maxAttendees) * 100)}% full`}
                          </Text>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </BlurView>
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
    fontSize: 28,
    fontWeight: '700',
    color: '#60A5FA',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardInner: {
    padding: 20,
  },
  growthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  growthMonth: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    width: 40,
  },
  growthBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  growthBarFill: {
    height: '100%',
    backgroundColor: '#60A5FA',
    borderRadius: 4,
  },
  growthValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#60A5FA',
    width: 40,
    textAlign: 'right',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statRowLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
  },
  statRowValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  eventRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(96,165,250,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventRankText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#60A5FA',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  eventDetails: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
});
