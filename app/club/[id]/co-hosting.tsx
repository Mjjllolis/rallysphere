// app/club/[id]/co-hosting.tsx - Co-host requests received/sent by a club
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Text, IconButton, ActivityIndicator, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useAuth, useThemeToggle } from '../../_layout';
import { publishClubBadge } from '../../../lib/clubBadges';
import {
  getClub,
  getIncomingCoHostRequests,
  getSentCoHostRequests,
  respondToCoHostRequest,
  withdrawCoHostRequest,
  removeCoHost,
} from '../../../lib/firebase';
import type { Club, CoHostRequest, CoHostRequestStatus } from '../../../lib/firebase';

type Tab = 'requests' | 'cohosting' | 'sent';

const STATUS_COLORS: Record<CoHostRequestStatus, string> = {
  pending: '#F59E0B',
  accepted: '#10B981',
  declined: '#EF4444',
  closed: '#9CA3AF',
  removed: '#EF4444',
  left: '#9CA3AF',
};

const STATUS_LABELS: Record<CoHostRequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Co-hosting',
  declined: 'Declined',
  closed: 'Event cancelled',
  removed: 'Removed',
  left: 'Left',
};

export default function ClubCoHostingScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [incoming, setIncoming] = useState<CoHostRequest[]>([]);
  const [sent, setSent] = useState<CoHostRequest[]>([]);
  const [selectedTab, setSelectedTab] = useState<Tab>(tab ?? 'requests');
  const [loading, setLoading] = useState(true);

  // Keep the dashboard's Co-Hosting badge in sync as requests are answered
  useEffect(() => {
    if (loading) return;
    publishClubBadge(clubId, 'coHostRequests', incoming.filter(r => r.status === 'pending').length);
  }, [incoming, loading]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      const clubResult = await getClub(clubId);
      if (!clubResult.success || !clubResult.club) {
        router.back();
        return;
      }
      if (user && !clubResult.club.admins.includes(user.uid)) {
        router.back();
        return;
      }
      setClub(clubResult.club);

      const [incomingResult, sentResult] = await Promise.all([
        getIncomingCoHostRequests(clubId),
        getSentCoHostRequests(clubId),
      ]);
      setIncoming(incomingResult.requests);
      // Co-hosts the host removed are cleared from Sent (older ones may still
      // exist as 'removed' docs from before removal deleted them)
      setSent(sentResult.requests.filter(r => r.status !== 'removed'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const respond = async (request: CoHostRequest, accept: boolean) => {
    setActionRequestId(request.id);
    const result = await respondToCoHostRequest(request.id, accept);
    setActionRequestId(null);

    if (!result.success) {
      Alert.alert('Error', result.error || 'Failed to respond to request');
      // The request may have been withdrawn or answered by another admin
      loadData();
      return;
    }
    if (accept && result.status === 'closed') {
      Alert.alert('Event unavailable', 'This event was cancelled or deleted, so the request was closed.');
    } else if (accept) {
      Alert.alert('Accepted', `${club?.name} is now a co-host of ${request.eventTitle}.`);
    }
    const status = result.status ?? (accept ? 'accepted' : 'declined');
    setIncoming(prev => prev.map(r => (r.id === request.id ? { ...r, status } : r)));
  };

  const handleDecline = (request: CoHostRequest) => {
    Alert.alert('Decline Request', `Decline co-hosting ${request.eventTitle} with ${request.hostClubName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => respond(request, false) },
    ]);
  };

  const handleWithdraw = (request: CoHostRequest) => {
    Alert.alert('Withdraw Request', `Withdraw the co-host request to ${request.clubName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          setActionRequestId(request.id);
          const result = await withdrawCoHostRequest(request.id);
          setActionRequestId(null);
          if (result.success) {
            setSent(prev => prev.filter(r => r.id !== request.id));
          } else {
            Alert.alert('Error', result.error || 'Failed to withdraw request');
          }
        },
      },
    ]);
  };

  // Host side removing a co-host (sent tab) or this club stepping down (co-hosting tab)
  const handleRemove = (request: CoHostRequest, side: 'host' | 'cohost') => {
    const isHostSide = side === 'host';
    Alert.alert(
      isHostSide ? 'Remove Co-Host' : 'Stop Co-Hosting',
      isHostSide
        ? `Remove ${request.clubName} as a co-host of ${request.eventTitle}?`
        : `Stop co-hosting ${request.eventTitle}? ${request.hostClubName} can invite you again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isHostSide ? 'Remove' : 'Stop Co-Hosting',
          style: 'destructive',
          onPress: async () => {
            setActionRequestId(request.id);
            const result = await removeCoHost(request.eventId, request.clubId);
            setActionRequestId(null);
            if (!result.success) {
              Alert.alert('Error', result.error || 'Failed to update co-host');
              loadData();
              return;
            }
            const status = result.status ?? (isHostSide ? 'removed' : 'left');
            const update = (prev: CoHostRequest[]) => prev.map(r => (r.id === request.id ? { ...r, status } : r));
            setIncoming(update);
            if (status === 'removed') {
              setSent(prev => prev.filter(r => r.id !== request.id));
            } else {
              setSent(update);
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.onSurface} />
        </View>
      </View>
    );
  }

  if (!club) {
    return null;
  }

  const pendingIncoming = incoming.filter(r => r.status === 'pending');
  const acceptedIncoming = incoming.filter(r => r.status === 'accepted');

  const renderEventSummary = (request: CoHostRequest, otherClub: { name: string; logo?: string }, otherClubLabel: string) => (
    <TouchableOpacity
      style={styles.eventRow}
      onPress={() => router.push(`/event/${request.eventId}`)}
      activeOpacity={0.7}
    >
      {request.eventCoverImage ? (
        <ExpoImage source={{ uri: request.eventCoverImage }} style={styles.eventImage} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.eventImage, styles.eventImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
          <IconButton icon="calendar" size={22} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>{request.eventTitle}</Text>
        <Text style={[styles.eventDate, { color: theme.colors.onSurfaceVariant }]}>{formatDate(request.eventStartDate)}</Text>
        <View style={styles.clubRow}>
          {otherClub.logo ? (
            <ExpoImage source={{ uri: otherClub.logo }} style={styles.clubLogo} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.clubLogo, styles.eventImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
                {otherClub.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.clubText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {otherClubLabel} {otherClub.name}
          </Text>
        </View>
      </View>
      <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceDisabled} style={{ margin: 0 }} />
    </TouchableOpacity>
  );

  const renderEmpty = (icon: string, title: string, text: string) => (
    <View style={styles.emptyContainer}>
      <IconButton icon={icon} size={64} iconColor="#10B981" />
      <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
    </View>
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'requests', label: 'Requests', badge: pendingIncoming.length },
    { key: 'cohosting', label: 'Co-Hosting' },
    { key: 'sent', label: 'Sent' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <LinearGradient
        colors={isDark ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(27, 54, 93, 0.1)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
            </BlurView>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Co-Hosting</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club.name}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, { borderBottomColor: theme.colors.outline }, selectedTab === t.key && styles.tabActive]}
              onPress={() => setSelectedTab(t.key)}
            >
              <View style={styles.tabLabelRow}>
                <Text style={[styles.tabText, { color: theme.colors.onSurfaceVariant }, selectedTab === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
                {!!t.badge && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{t.badge}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />}
        >
          {/* Pending requests from other clubs */}
          {selectedTab === 'requests' && (
            pendingIncoming.length === 0
              ? renderEmpty('check-circle', 'All caught up!', 'No pending co-host requests')
              : pendingIncoming.map(request => (
                <BlurView key={request.id} intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor: theme.colors.outline }]}>
                  <View style={styles.cardInner}>
                    {renderEventSummary(request, { name: request.hostClubName, logo: request.hostClubLogo }, 'Invited by')}
                    <Text style={[styles.requestDate, { color: theme.colors.onSurfaceDisabled }]}>
                      Requested {formatDate(request.createdAt)}
                    </Text>
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => handleDecline(request)}
                        disabled={actionRequestId !== null}
                      >
                        <Text style={styles.rejectButtonText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => respond(request, true)}
                        disabled={actionRequestId !== null}
                      >
                        {actionRequestId === request.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.approveButtonText}>Accept</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </BlurView>
              ))
          )}

          {/* Events this club has agreed to co-host */}
          {selectedTab === 'cohosting' && (
            acceptedIncoming.length === 0
              ? renderEmpty('handshake-outline', 'No co-hosted events', 'Events you accept will show up here and on your club page')
              : acceptedIncoming.map(request => (
                <BlurView key={request.id} intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor: theme.colors.outline }]}>
                  <View style={styles.cardInner}>
                    {renderEventSummary(request, { name: request.hostClubName, logo: request.hostClubLogo }, 'Hosted with')}
                    <View style={styles.sentFooter}>
                      <Text style={[styles.requestDate, { color: theme.colors.onSurfaceDisabled, marginTop: 0, flex: 1, marginRight: 12 }]}>
                        Only {request.hostClubName} can edit or cancel
                      </Text>
                      <TouchableOpacity onPress={() => handleRemove(request, 'cohost')} disabled={actionRequestId !== null}>
                        {actionRequestId === request.id
                          ? <ActivityIndicator size="small" color="#EF4444" />
                          : <Text style={styles.withdrawText}>Stop Co-Hosting</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </BlurView>
              ))
          )}

          {/* Requests this club sent for its own events */}
          {selectedTab === 'sent' && (
            sent.length === 0
              ? renderEmpty('send-outline', 'No requests sent', 'Invite co-hosts when you create or edit an event')
              : sent.map(request => (
                <BlurView key={request.id} intensity={20} tint={isDark ? 'dark' : 'light'} style={[styles.card, { borderColor: theme.colors.outline }]}>
                  <View style={styles.cardInner}>
                    {renderEventSummary(request, { name: request.clubName, logo: request.clubLogo }, 'Sent to')}
                    <View style={styles.sentFooter}>
                      <View style={[styles.statusChip, { borderColor: STATUS_COLORS[request.status], backgroundColor: `${STATUS_COLORS[request.status]}22` }]}>
                        <Text style={[styles.statusChipText, { color: STATUS_COLORS[request.status] }]}>
                          {STATUS_LABELS[request.status] ?? request.status}
                        </Text>
                      </View>
                      {request.status === 'pending' && (
                        <TouchableOpacity onPress={() => handleWithdraw(request)} disabled={actionRequestId !== null}>
                          <Text style={styles.withdrawText}>Withdraw</Text>
                        </TouchableOpacity>
                      )}
                      {request.status === 'accepted' && (
                        <TouchableOpacity onPress={() => handleRemove(request, 'host')} disabled={actionRequestId !== null}>
                          {actionRequestId === request.id
                            ? <ActivityIndicator size="small" color="#EF4444" />
                            : <Text style={styles.withdrawText}>Remove</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </BlurView>
              ))
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
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  tabActive: {
    borderBottomColor: '#60A5FA',
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#60A5FA',
  },
  tabBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardInner: {
    padding: 16,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventImage: {
    width: 64,
    height: 80,
    borderRadius: 10,
  },
  eventImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  eventDate: {
    fontSize: 13,
    marginTop: 2,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  clubLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  clubText: {
    fontSize: 13,
    flexShrink: 1,
  },
  requestDate: {
    fontSize: 12,
    marginTop: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  rejectButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: '#60A5FA',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  withdrawText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
