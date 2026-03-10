// app/club/[id]/event-checkin.tsx - Event Check-in Admin Screen
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import {
  Text,
  IconButton,
  ActivityIndicator,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, useThemeToggle } from '../../_layout';
import {
  getClub,
  getEvents,
  getEventAttendees,
  checkInAttendee,
  getEventWaiverSignatures,
} from '../../../lib/firebase';
import type { Club, Event } from '../../../lib/firebase';
import { generateAndShareWaiverPDF } from '../../../lib/waiverPdf';

interface Attendee {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  profileEmoji: string | null;
  isCheckedIn: boolean;
}

export default function EventCheckinScreen() {
  const { user } = useAuth();
  const { id, eventId: initialEventId } = useLocalSearchParams();
  const clubId = id as string;
  const theme = useTheme();
  const { isDark } = useThemeToggle();

  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [waiverSignatures, setWaiverSignatures] = useState<{ [userId: string]: { initials: string; signedAt: Date } }>({});
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [selectedWaiver, setSelectedWaiver] = useState<{ attendee: Attendee; signature: { initials: string; signedAt: Date } } | null>(null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const cachedPdfUri = useRef<string | null>(null);

  // Clear cached PDF when modal closes or waiver changes
  useEffect(() => {
    if (!showWaiverModal) {
      cachedPdfUri.current = null;
    }
  }, [showWaiverModal]);

  useEffect(() => {
    cachedPdfUri.current = null;
  }, [selectedWaiver]);

  useEffect(() => {
    loadInitialData();
  }, [clubId]);

  useEffect(() => {
    if (selectedEvent) {
      loadAttendees(selectedEvent.id);
    }
  }, [selectedEvent]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const clubResult = await getClub(clubId);
      if (clubResult.success && clubResult.club) {
        setClub(clubResult.club);

        if (user && !clubResult.club.admins.includes(user.uid)) {
          Alert.alert('Access Denied', 'You must be an admin to access this page');
          router.back();
          return;
        }
      } else {
        router.back();
        return;
      }

      // Load club events
      const eventsResult = await getEvents(clubId);
      if (eventsResult.success && eventsResult.events) {
        // Sort by start date, most recent first
        const sortedEvents = eventsResult.events.sort((a, b) => {
          const dateA = a.startDate?.toDate?.() || new Date(0);
          const dateB = b.startDate?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        setEvents(sortedEvents);

        // Auto-select event if provided in URL or select first event
        if (initialEventId) {
          const event = sortedEvents.find(e => e.id === initialEventId);
          if (event) setSelectedEvent(event);
        } else if (sortedEvents.length > 0) {
          setSelectedEvent(sortedEvents[0]);
        }
      }
    } catch (error) {
      // console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendees = async (eventId: string) => {
    try {
      setLoadingAttendees(true);
      const [attendeesResult, waiverResult] = await Promise.all([
        getEventAttendees(eventId),
        getEventWaiverSignatures(eventId),
      ]);
      if (attendeesResult.success) {
        setAttendees(attendeesResult.attendees);
        setCheckedInCount(attendeesResult.checkedInCount || 0);
      }
      if (waiverResult.success) {
        setWaiverSignatures(waiverResult.signatures);
      }
    } catch (error) {
      // console.error('Error loading attendees:', error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedEvent) {
      await loadAttendees(selectedEvent.id);
    }
    setRefreshing(false);
  };

  const handleCheckIn = async (attendee: Attendee) => {
    if (!selectedEvent || attendee.isCheckedIn) return;

    setCheckingIn(attendee.userId);
    try {
      const result = await checkInAttendee(selectedEvent.id, attendee.userId);
      if (result.success) {
        // Update local state
        setAttendees(prev =>
          prev.map(a =>
            a.userId === attendee.userId ? { ...a, isCheckedIn: true } : a
          )
        );
        setCheckedInCount(prev => prev + 1);

        // Show success with credits info if applicable
        if (selectedEvent.rallyCreditsAwarded && selectedEvent.rallyCreditsAwarded > 0) {
          Alert.alert(
            'Checked In!',
            `${attendee.displayName} has been checked in and awarded ${selectedEvent.rallyCreditsAwarded} Rally Credits.`
          );
        } else {
          Alert.alert('Checked In!', `${attendee.displayName} has been checked in.`);
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to check in attendee');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setCheckingIn(null);
    }
  };

  const filteredAttendees = attendees.filter(
    a =>
      a.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatEventDate = (event: Event) => {
    const date = event.startDate?.toDate?.();
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.onSurface} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
      </View>

      <LinearGradient
        colors={isDark ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)'] : ['rgba(27, 54, 93, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={styles.backButtonBlur}>
              <IconButton icon="arrow-left" size={24} iconColor={theme.colors.onSurface} />
            </BlurView>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Event Check-in</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club?.name}</Text>
          </View>
        </View>

        {/* Event Selector */}
        <View style={styles.eventSelectorContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.eventSelectorScroll}
          >
            {events.map(event => (
              <TouchableOpacity
                key={event.id}
                onPress={() => setSelectedEvent(event)}
                style={[
                  styles.eventChip,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  selectedEvent?.id === event.id && styles.eventChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.eventChipText,
                    { color: theme.colors.onSurfaceVariant },
                    selectedEvent?.id === event.id && styles.eventChipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
                <Text style={[styles.eventChipDate, { color: theme.colors.onSurfaceDisabled }]}>{formatEventDate(event)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedEvent ? (
          <>
            {/* Stats Bar */}
            <View style={[styles.statsBar, { borderColor: theme.colors.outline }]}>
              <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={styles.statsBarBlur}>
                <View style={styles.statsBarContent}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{attendees.length}</Text>
                    <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Attendees</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                  <View style={styles.statItem}>
                    <Text style={styles.statNumberGreen}>{checkedInCount}</Text>
                    <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Checked In</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                  <View style={styles.statItem}>
                    <Text style={styles.statNumberOrange}>
                      {attendees.length - checkedInCount}
                    </Text>
                    <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Remaining</Text>
                  </View>
                  {selectedEvent.rallyCreditsAwarded && selectedEvent.rallyCreditsAwarded > 0 && (
                    <>
                      <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                      <View style={styles.statItem}>
                        <Text style={styles.statNumberGold}>
                          {selectedEvent.rallyCreditsAwarded}
                        </Text>
                        <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Credits/Person</Text>
                      </View>
                    </>
                  )}
                  {selectedEvent.hasWaiver && (
                    <>
                      <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                      <View style={styles.statItem}>
                        <Text style={styles.statNumberPurple}>
                          {Object.keys(waiverSignatures).length}
                        </Text>
                        <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Waivers Signed</Text>
                      </View>
                    </>
                  )}
                </View>
              </BlurView>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchContainer, { borderColor: theme.colors.outline }]}>
              <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={styles.searchBlur}>
                <IconButton icon="magnify" size={20} iconColor={theme.colors.onSurfaceDisabled} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.onSurface }]}
                  placeholder="Search attendees..."
                  placeholderTextColor={theme.colors.onSurfaceDisabled}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <IconButton icon="close" size={18} iconColor={theme.colors.onSurfaceDisabled} />
                  </TouchableOpacity>
                )}
              </BlurView>
            </View>

            {/* Attendees List */}
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />
              }
            >
              {loadingAttendees ? (
                <View style={styles.loadingAttendees}>
                  <ActivityIndicator size="small" color={theme.colors.onSurface} />
                  <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>Loading attendees...</Text>
                </View>
              ) : filteredAttendees.length === 0 ? (
                <View style={styles.emptyState}>
                  <IconButton icon="account-group" size={48} iconColor={theme.colors.onSurfaceDisabled} />
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceDisabled }]}>
                    {searchQuery ? 'No attendees match your search' : 'No attendees yet'}
                  </Text>
                </View>
              ) : (
                filteredAttendees.map(attendee => (
                  <BlurView key={attendee.userId} intensity={20} tint={isDark ? "dark" : "light"} style={[styles.attendeeCard, { borderColor: theme.colors.outline }]}>
                    <View style={styles.attendeeCardInner}>
                      {/* Avatar + Info - Tappable to view profile */}
                      <TouchableOpacity
                        style={styles.attendeeProfileArea}
                        onPress={() => router.push(`/user/${attendee.userId}`)}
                        activeOpacity={0.7}
                      >
                        {/* Avatar */}
                        <View
                          style={[
                            styles.avatar,
                            attendee.isCheckedIn && styles.avatarCheckedIn,
                          ]}
                        >
                          {attendee.profileEmoji ? (
                            <Text style={styles.avatarEmoji}>{attendee.profileEmoji}</Text>
                          ) : (
                            <Text style={[styles.avatarText, { color: theme.colors.onSurface }]}>
                              {attendee.displayName.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>

                        {/* Info */}
                        <View style={styles.attendeeInfo}>
                          <View style={styles.attendeeNameRow}>
                            <Text style={[styles.attendeeName, { color: theme.colors.onSurface }]}>{attendee.displayName}</Text>
                            {selectedEvent.hasWaiver && waiverSignatures[attendee.userId] && (
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setSelectedWaiver({ attendee, signature: waiverSignatures[attendee.userId] });
                                  setShowWaiverModal(true);
                                }}
                                style={styles.waiverBadge}
                                activeOpacity={0.7}
                              >
                                <IconButton icon="file-document-check" size={12} iconColor="#8B5CF6" style={{ margin: 0, padding: 0 }} />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={[styles.attendeeEmail, { color: theme.colors.onSurfaceDisabled }]}>{attendee.email}</Text>
                          {selectedEvent.hasWaiver && !waiverSignatures[attendee.userId] && (
                            <Text style={styles.noWaiverText}>No waiver signed</Text>
                          )}
                        </View>
                      </TouchableOpacity>

                      {/* Status/Action */}
                      {checkingIn === attendee.userId ? (
                        <ActivityIndicator size="small" color="#60A5FA" />
                      ) : attendee.isCheckedIn ? (
                        <View style={styles.checkedInButton}>
                          <IconButton icon="check" size={20} iconColor="#FFFFFF" style={{ margin: 0 }} />
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleCheckIn(attendee)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.checkInButton}>
                            <Text style={styles.checkInButtonText}>Check In</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                  </BlurView>
                ))
              )}
            </ScrollView>
          </>
        ) : (
          <View style={styles.emptyState}>
            <IconButton icon="calendar-blank" size={48} iconColor={theme.colors.onSurfaceDisabled} />
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceDisabled }]}>No events to check in</Text>
          </View>
        )}

        {/* Waiver View Modal */}
        <Modal
          visible={showWaiverModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowWaiverModal(false)}
        >
          <View style={styles.waiverModalOverlay}>
            <View style={[
              styles.waiverModalContent,
              { backgroundColor: theme.dark ? '#1C1C1E' : '#FFFFFF' }
            ]}>
              {/* Header */}
              <View style={styles.waiverModalHeader}>
                <View style={styles.waiverModalTitleRow}>
                  <IconButton icon="file-document-check" size={28} iconColor="#8B5CF6" style={{ margin: 0 }} />
                  <Text style={[styles.waiverModalTitle, { color: theme.colors.onSurface }]}>
                    Signed Waiver
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={24}
                  iconColor={theme.colors.onSurfaceVariant}
                  onPress={() => setShowWaiverModal(false)}
                  style={{ margin: 0 }}
                />
              </View>

              {/* Formatted Waiver Document */}
              <ScrollView style={styles.waiverModalScroll} showsVerticalScrollIndicator>
                {/* Event Title */}
                <View style={[
                  styles.waiverEventHeader,
                  {
                    backgroundColor: theme.dark ? 'rgba(139, 92, 246, 0.1)' : '#F0F4F8',
                    borderColor: theme.dark ? 'rgba(139, 92, 246, 0.3)' : '#D1D9E6'
                  }
                ]}>
                  <Text style={[styles.waiverEventTitle, { color: theme.colors.onSurface }]}>
                    {selectedEvent?.title}
                  </Text>
                </View>

                {/* Terms & Conditions Section */}
                <View style={styles.waiverSection}>
                  <Text style={[styles.waiverSectionHeader, { color: theme.dark ? '#8B5CF6' : '#7C3AED' }]}>
                    TERMS & CONDITIONS
                  </Text>
                  <View style={[
                    styles.waiverContentBox,
                    {
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                      borderLeftColor: theme.dark ? '#8B5CF6' : '#7C3AED'
                    }
                  ]}>
                    <Text style={[styles.waiverBodyText, { color: theme.colors.onSurface }]}>
                      {selectedEvent?.waiverText}
                    </Text>
                  </View>
                </View>

                {/* Electronic Signature Section */}
                <View style={styles.waiverSection}>
                  <Text style={[styles.waiverSectionHeader, { color: theme.dark ? '#8B5CF6' : '#7C3AED' }]}>
                    ELECTRONIC SIGNATURE
                  </Text>
                  <View style={[
                    styles.waiverSignatureBox,
                    {
                      backgroundColor: theme.dark ? 'rgba(139, 92, 246, 0.08)' : '#F0F4F8',
                      borderColor: theme.dark ? 'rgba(139, 92, 246, 0.2)' : '#D1D9E6'
                    }
                  ]}>
                    <View style={styles.waiverSigRow}>
                      <Text style={[styles.waiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                        Full Name
                      </Text>
                      <Text style={[styles.waiverSigValue, { color: theme.colors.onSurface }]}>
                        {selectedWaiver?.attendee.displayName}
                      </Text>
                    </View>
                    <View style={[styles.waiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                    <View style={styles.waiverSigRow}>
                      <Text style={[styles.waiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                        Email Address
                      </Text>
                      <Text style={[styles.waiverSigValue, { color: theme.colors.onSurface }]}>
                        {selectedWaiver?.attendee.email}
                      </Text>
                    </View>
                    <View style={[styles.waiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                    <View style={styles.waiverSigRow}>
                      <Text style={[styles.waiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                        Initials
                      </Text>
                      <Text style={[styles.waiverInitials, { color: theme.dark ? '#8B5CF6' : '#7C3AED' }]}>
                        {selectedWaiver?.signature.initials}
                      </Text>
                    </View>
                    <View style={[styles.waiverSigDivider, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

                    <View style={styles.waiverSigRow}>
                      <Text style={[styles.waiverSigLabel, { color: theme.colors.onSurfaceVariant }]}>
                        Date & Time
                      </Text>
                      <Text style={[styles.waiverSigValue, { color: theme.colors.onSurface }]}>
                        {selectedWaiver?.signature.signedAt.toLocaleDateString([], {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}{'\n'}
                        {selectedWaiver?.signature.signedAt.toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.waiverModalActions}>
                <TouchableOpacity
                  style={[
                    styles.waiverShareButton,
                    { backgroundColor: theme.dark ? '#8B5CF6' : '#7C3AED' }
                  ]}
                  onPress={async () => {
                    // Prevent multiple taps while generating
                    if (exportingPDF || !selectedEvent || !selectedWaiver) return;

                    setExportingPDF(true);

                    try {
                      // Check if we have a cached PDF
                      if (cachedPdfUri.current) {
                        try {
                          const result = await generateAndShareWaiverPDF({
                            eventTitle: selectedEvent.title,
                            waiverText: selectedEvent.waiverText || '',
                            signerName: selectedWaiver.attendee.displayName,
                            signerEmail: selectedWaiver.attendee.email,
                            initials: selectedWaiver.signature.initials,
                            signedAt: selectedWaiver.signature.signedAt,
                            cachedUri: cachedPdfUri.current,
                          });

                          if (result.success) {
                            setExportingPDF(false);
                            return;
                          }
                        } catch (e) {
                          cachedPdfUri.current = null;
                        }
                      }

                      // Generate new PDF and cache it
                      const result = await generateAndShareWaiverPDF({
                        eventTitle: selectedEvent.title,
                        waiverText: selectedEvent.waiverText || '',
                        signerName: selectedWaiver.attendee.displayName,
                        signerEmail: selectedWaiver.attendee.email,
                        initials: selectedWaiver.signature.initials,
                        signedAt: selectedWaiver.signature.signedAt,
                      });

                      if (result.success && result.uri) {
                        cachedPdfUri.current = result.uri;
                      } else if (!result.success) {
                        Alert.alert('Error', `Failed to generate PDF: ${result.error}`);
                      }
                    } finally {
                      setExportingPDF(false);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <IconButton icon="file-pdf-box" size={20} iconColor="#FFFFFF" style={{ margin: 0 }} />
                  <Text style={styles.waiverShareText}>Export PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.waiverCloseButton,
                    { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : '#F3F4F6' }
                  ]}
                  onPress={() => setShowWaiverModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.waiverCloseText,
                    { color: theme.dark ? 'rgba(255,255,255,0.8)' : '#6B7280' }
                  ]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  eventSelectorContainer: {
    paddingVertical: 8,
  },
  eventSelectorScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  eventChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 8,
  },
  eventChipSelected: {
    backgroundColor: '#60A5FA',
  },
  eventChipText: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 150,
  },
  eventChipTextSelected: {
    color: '#fff',
  },
  eventChipDate: {
    fontSize: 11,
    marginTop: 2,
  },
  statsBar: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statsBarBlur: {
    borderRadius: 16,
  },
  statsBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#60A5FA',
  },
  statNumberGreen: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  statNumberOrange: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F59E0B',
  },
  statNumberGold: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  statNumberPurple: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingAttendees: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 8,
  },
  attendeeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
  },
  attendeeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCheckedIn: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  avatarEmoji: {
    fontSize: 24,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  attendeeProfileArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendeeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  waiverBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noWaiverText: {
    fontSize: 11,
    color: '#F59E0B',
    marginTop: 2,
  },
  attendeeEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  checkedInButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInButton: {
    backgroundColor: '#60A5FA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Waiver Modal Styles
  waiverModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  waiverModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  waiverModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  waiverModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waiverModalTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  waiverModalScroll: {
    flexGrow: 0,
    marginBottom: 20,
  },
  waiverEventHeader: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  waiverEventTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  waiverSection: {
    marginBottom: 24,
  },
  waiverSectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  waiverContentBox: {
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 3,
  },
  waiverBodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  waiverSignatureBox: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  waiverSigRow: {
    paddingVertical: 12,
  },
  waiverSigLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  waiverSigValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  waiverInitials: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
  },
  waiverSigDivider: {
    height: 1,
    marginVertical: 0,
  },
  waiverModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  waiverShareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 4,
  },
  waiverShareText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  waiverCloseButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  waiverCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
