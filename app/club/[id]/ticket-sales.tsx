// app/club/[id]/ticket-sales.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {
  Text,
  useTheme,
  Surface,
  IconButton,
  Chip,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../_layout';
import {
  getClubTicketPayments,
  getClub,
  getEvent,
  getUser,
} from '../../../lib/firebase';
import type { TicketPayment } from '../../../lib/firebase';

interface EnrichedPayment extends TicketPayment {
  eventTitle?: string;
  userName?: string;
  userEmail?: string;
}

export default function TicketSalesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<any>(null);
  const [payments, setPayments] = useState<EnrichedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load club info
      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);
      }

      // Load payments
      const result = await getClubTicketPayments(clubId);
      if (result.success) {
        // Enrich payments with event and user details
        const enrichedPayments = await Promise.all(
          result.payments.map(async (payment) => {
            const enriched: EnrichedPayment = { ...payment };

            // Get event title
            try {
              const eventResult = await getEvent(payment.eventId);
              if (eventResult.success && eventResult.event) {
                enriched.eventTitle = eventResult.event.title;
              }
            } catch (e) {
              console.error('Error getting event:', e);
            }

            // Get user info
            try {
              const userResult = await getUser(payment.userId);
              if (userResult.success && userResult.user) {
                enriched.userName = userResult.user.displayName || userResult.user.email;
                enriched.userEmail = userResult.user.email;
              }
            } catch (e) {
              console.error('Error getting user:', e);
            }

            return enriched;
          })
        );
        setPayments(enrichedPayments);
      }
    } catch (error) {
      console.error('Error loading ticket sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleExpanded = (paymentId: string) => {
    setExpandedPayments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStats = () => {
    const total = payments.length;
    const totalRevenue = payments.reduce((sum, p) => sum + (p.clubAmount || 0), 0);
    const totalPlatformFees = payments.reduce((sum, p) => sum + (p.platformFee || 0), 0);
    const transferred = payments.filter((p) => p.transferredToClub).length;
    return { total, totalRevenue, totalPlatformFees, transferred };
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const stats = getStats();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <View style={styles.headerTop}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
              Ticket Sales
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {club?.name} - ${stats.totalRevenue.toFixed(2)} earned
            </Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            {stats.total}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Sales</Text>
        </Surface>
        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            ${stats.totalRevenue.toFixed(0)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>You Earn</Text>
        </Surface>
        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.error }}>
            ${stats.totalPlatformFees.toFixed(0)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Fees</Text>
        </Surface>
      </View>

      {/* Payments List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {payments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No ticket sales yet
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              Sales will appear here when users purchase event tickets
            </Text>
          </View>
        ) : (
          payments.map((payment) => {
            const isExpanded = expandedPayments.has(payment.id);

            return (
              <TouchableOpacity
                key={payment.id}
                onPress={() => toggleExpanded(payment.id)}
                activeOpacity={0.7}
              >
                <Surface style={[styles.paymentCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  {/* Compact Header */}
                  <View style={styles.compactRow}>
                    <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryContainer }]}>
                      <IconButton icon="ticket" size={20} iconColor={theme.colors.primary} style={{ margin: 0 }} />
                    </View>

                    <View style={styles.paymentInfo}>
                      <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '600' }}>
                        {payment.eventTitle || 'Event Ticket'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {payment.userName || 'Unknown User'}
                      </Text>
                    </View>

                    <View style={styles.rightSection}>
                      <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                        +${(payment.clubAmount || 0).toFixed(2)}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{
                          color: payment.transferredToClub ? theme.colors.primary : theme.colors.tertiary,
                          fontWeight: '600',
                        }}
                      >
                        {payment.transferredToClub ? 'Paid' : 'Pending'}
                      </Text>
                    </View>
                  </View>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <Divider style={{ marginVertical: 12 }} />

                      {/* Date */}
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {formatDate(payment.createdAt)}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          ID: {payment.paymentIntentId?.slice(-8).toUpperCase()}
                        </Text>
                      </View>

                      {/* Customer Info */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          CUSTOMER
                        </Text>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                          {payment.userName || 'Unknown'}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {payment.userEmail}
                        </Text>
                      </View>

                      {/* Price Breakdown */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          PRICE BREAKDOWN
                        </Text>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Ticket Price</Text>
                          <Text variant="bodySmall">${(payment.ticketPrice || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Total Charged</Text>
                          <Text variant="bodySmall">${(payment.amount || 0).toFixed(2)}</Text>
                        </View>
                      </View>

                      {/* Payout Info */}
                      <View style={[styles.infoSection, { backgroundColor: theme.colors.primaryContainer + '40' }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          CLUB PAYOUT
                        </Text>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Ticket Price</Text>
                          <Text variant="bodySmall">${(payment.ticketPrice || 0).toFixed(2)}</Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text variant="bodySmall">Platform Fee (10%)</Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                            -${(payment.platformFee || 0).toFixed(2)}
                          </Text>
                        </View>
                        <Divider style={{ marginVertical: 4 }} />
                        <View style={styles.priceRow}>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>You Receive</Text>
                          <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                            ${(payment.clubAmount || 0).toFixed(2)}
                          </Text>
                        </View>
                        <View style={[styles.priceRow, { marginTop: 8 }]}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Transfer Status
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{
                              color: payment.transferredToClub ? theme.colors.primary : theme.colors.tertiary,
                              fontWeight: '600',
                            }}
                          >
                            {payment.transferredToClub ? 'Transferred' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Expand Indicator */}
                  <View style={styles.expandIndicator}>
                    <IconButton
                      icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      style={{ margin: 0, height: 20 }}
                    />
                  </View>
                </Surface>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
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
  header: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
  },
  paymentCard: {
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 2,
  },
  expandedContent: {
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoSection: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    gap: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 4,
  },
});
