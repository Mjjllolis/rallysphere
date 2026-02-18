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
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, useThemeToggle } from '../../_layout';
import {
  getClub,
  getClubAnalytics,
} from '../../../lib/firebase';
import type { Club } from '../../../lib/firebase';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AnalyticsDashboard() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!club || !analytics) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={(theme as any).gradients?.background || ['transparent', 'transparent', 'transparent']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <View style={[styles.backButtonBlur, { backgroundColor: theme.colors.surfaceVariant }]}>
              <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.colors.onBackground }]}>Analytics</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club.name}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
        >
          {/* Overview Stats */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Overview</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.statCardInner}>
                  <IconButton icon="account-group" size={32} iconColor={theme.colors.primary} />
                  <Text style={[styles.statValue, { color: theme.colors.primary }]}>{analytics.memberCount}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Total Members</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.statCardInner}>
                  <IconButton icon="calendar" size={32} iconColor={theme.colors.primary} />
                  <Text style={[styles.statValue, { color: theme.colors.primary }]}>{analytics.totalEvents}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Total Events</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.statCardInner}>
                  <IconButton icon="currency-usd" size={32} iconColor={theme.colors.success} />
                  <Text style={[styles.statValue, { color: theme.colors.success }]}>
                    ${analytics.totalRevenue.toFixed(2)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Total Revenue</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.statCardInner}>
                  <IconButton icon="account-multiple" size={32} iconColor={theme.colors.warning} />
                  <Text style={[styles.statValue, { color: theme.colors.warning }]}>
                    {analytics.avgAttendancePerEvent}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Avg Attendance</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Member Growth */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Member Growth (Last 6 Months)</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.cardInner}>
                {analytics.memberGrowth.map((data: any, index: number) => (
                  <View key={index} style={styles.growthRow}>
                    <Text style={[styles.growthMonth, { color: theme.colors.onSurfaceVariant }]}>{data.month}</Text>
                    <View style={[styles.growthBar, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <View
                        style={[
                          styles.growthBarFill,
                          {
                            width: `${(data.members / analytics.memberCount) * 100}%`,
                            backgroundColor: theme.colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.growthValue, { color: theme.colors.primary }]}>{data.members}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Event Stats */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Event Statistics</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.cardInner}>
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Total Event Attendance</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.onSurface }]}>{analytics.totalEventAttendance}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Upcoming Events</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.primary }]}>
                    {analytics.upcomingEvents}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Past Events</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.onSurface }]}>{analytics.pastEvents}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Average per Event</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.warning }]}>
                    {analytics.avgAttendancePerEvent}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Revenue Stats */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Store Revenue</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.cardInner}>
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Total Revenue</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.success, fontSize: 24 }]}>
                    ${analytics.totalRevenue.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Total Orders</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.onSurface }]}>{analytics.totalOrders}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
                <View style={styles.statRow}>
                  <Text style={[styles.statRowLabel, { color: theme.colors.onSurfaceVariant }]}>Pending Orders</Text>
                  <Text style={[styles.statRowValue, { color: theme.colors.warning }]}>
                    {analytics.pendingOrders}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Top Events */}
          {analytics.topEvents && analytics.topEvents.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Top Events by Attendance</Text>
              <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.cardInner}>
                  {analytics.topEvents.map((event: any, index: number) => (
                    <React.Fragment key={event.id}>
                      {index > 0 && <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />}
                      <View style={styles.eventRow}>
                        <View style={[styles.eventRank, { backgroundColor: isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.1)' }]}>
                          <Text style={[styles.eventRankText, { color: theme.colors.primary }]}>#{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.eventTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                            {event.title}
                          </Text>
                          <Text style={[styles.eventDetails, { color: theme.colors.onSurfaceVariant }]}>
                            {event.attendees} / {event.maxAttendees || '∞'} attendees
                            {event.maxAttendees &&
                              ` • ${Math.round((event.attendees / event.maxAttendees) * 100)}% full`}
                          </Text>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
              </View>
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
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
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
  },
  statCardInner: {
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
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
    width: 40,
  },
  growthBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  growthBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  growthValue: {
    fontSize: 14,
    fontWeight: '700',
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
  },
  statRowValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    height: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventRankText: {
    fontSize: 16,
    fontWeight: '700',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  eventDetails: {
    fontSize: 13,
    marginTop: 2,
  },
});
