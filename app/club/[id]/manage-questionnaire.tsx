// app/club/[id]/manage-questionnaire.tsx - View Questionnaire Responses
import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
  getEventQuestionnaireResponses,
} from '../../../lib/firebase';
import type { Club, Event, QuestionnaireResponse, ResponseType } from '../../../lib/firebase';

// Analytics for a single question
interface QuestionAnalytics {
  questionId: string;
  questionText: string;
  responseType: ResponseType;
  totalResponses: number;
  // For choice questions: { "Medium": 15, "Large": 8 }
  choiceCounts?: { [choice: string]: number };
}

export default function ManageQuestionnaire() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const { id } = useLocalSearchParams();
  const clubId = id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Compute analytics from responses
  const analytics = useMemo((): QuestionAnalytics[] => {
    if (responses.length === 0) return [];

    const questionMap = new Map<string, QuestionAnalytics>();

    responses.forEach(response => {
      response.responses.forEach(answer => {
        const existing = questionMap.get(answer.questionId);

        if (!existing) {
          // Initialize new question analytics
          const isChoiceType = answer.responseType === 'single_choice' || answer.responseType === 'multiple_choice';
          questionMap.set(answer.questionId, {
            questionId: answer.questionId,
            questionText: answer.questionText,
            responseType: answer.responseType,
            totalResponses: 1,
            choiceCounts: isChoiceType ? {} : undefined,
          });
        } else {
          existing.totalResponses++;
        }

        const analytics = questionMap.get(answer.questionId)!;

        // Count choices for choice-type questions
        if (analytics.choiceCounts) {
          const choices = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
          choices.forEach(choice => {
            if (choice) {
              analytics.choiceCounts![choice] = (analytics.choiceCounts![choice] || 0) + 1;
            }
          });
        }
      });
    });

    return Array.from(questionMap.values());
  }, [responses]);

  useEffect(() => {
    loadInitialData();
  }, [clubId]);

  useEffect(() => {
    if (selectedEvent) {
      loadResponses(selectedEvent.id);
    }
  }, [selectedEvent]);

  const loadInitialData = async () => {
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

      const eventsResult = await getEvents(clubId);
      if (eventsResult.success && eventsResult.events) {
        const withQuestionnaires = eventsResult.events.filter(e => e.hasQuestionnaire);
        const sortedEvents = withQuestionnaires.sort((a, b) => {
          const dateA = a.startDate?.toDate?.() || new Date(0);
          const dateB = b.startDate?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        setEvents(sortedEvents);

        if (sortedEvents.length > 0) {
          setSelectedEvent(sortedEvents[0]);
        }
      }
    } catch (error) {
      // console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadResponses = async (eventId: string) => {
    try {
      setLoadingResponses(true);
      const result = await getEventQuestionnaireResponses(eventId);
      if (result.success && result.responses) {
        setResponses(result.responses);
      } else {
        setResponses([]);
      }
    } catch (error) {
      setResponses([]);
    } finally {
      setLoadingResponses(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedEvent) {
      await loadResponses(selectedEvent.id);
    }
    setRefreshing(false);
  };

  const toggleExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleQuestionExpanded = (questionId: string) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const formatEventDate = (event: Event) => {
    const date = event.startDate?.toDate?.();
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getResponseTypeIcon = (type: ResponseType): string => {
    switch (type) {
      case 'single_choice':
        return 'radiobox-marked';
      case 'multiple_choice':
        return 'checkbox-marked';
      case 'text':
      case 'long_text':
        return 'text';
      case 'phone':
        return 'phone';
      case 'email':
        return 'email';
      case 'number':
        return 'numeric';
      case 'date':
        return 'calendar';
      default:
        return 'help-circle';
    }
  };

  const getResponseTypeLabel = (type: ResponseType): string => {
    switch (type) {
      case 'single_choice':
        return 'Single Choice';
      case 'multiple_choice':
        return 'Multiple Choice';
      case 'text':
        return 'Short Text';
      case 'long_text':
        return 'Long Text';
      case 'phone':
        return 'Phone';
      case 'email':
        return 'Email';
      case 'number':
        return 'Number';
      case 'date':
        return 'Date';
      default:
        return type;
    }
  };

  // Sort choice counts by value descending
  const getSortedChoices = (choiceCounts: { [choice: string]: number }) => {
    return Object.entries(choiceCounts).sort((a, b) => b[1] - a[1]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.onSurface} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.blackBackground, { backgroundColor: theme.colors.background }]} />
      </View>

      <LinearGradient
        colors={isDark
          ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']
          : ['rgba(27, 54, 93, 0.15)', 'rgba(96, 165, 250, 0.05)', 'rgba(255, 255, 255, 0)']}
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
            <Text style={[styles.headerTitle, { color: theme.colors.onSurface }]}>Questionnaires</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.onSurfaceVariant }]}>{club?.name}</Text>
          </View>
        </View>

        {/* Event Selector */}
        {events.length > 0 && (
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
                  <Text style={[
                    styles.eventChipDate,
                    { color: theme.colors.onSurfaceDisabled },
                    selectedEvent?.id === event.id && { color: 'rgba(255,255,255,0.7)' },
                  ]}>
                    {formatEventDate(event)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {selectedEvent ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.onSurface} />
            }
          >
            {loadingResponses ? (
              <View style={styles.loadingResponses}>
                <ActivityIndicator size="small" color={theme.colors.onSurface} />
                <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>Loading responses...</Text>
              </View>
            ) : responses.length === 0 ? (
              <View style={styles.emptyState}>
                <IconButton icon="clipboard-text-outline" size={48} iconColor={theme.colors.onSurfaceDisabled} />
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceDisabled }]}>
                  No responses yet
                </Text>
              </View>
            ) : (
              <>
                {/* Analytics Section */}
                <TouchableOpacity
                  onPress={() => setShowAnalytics(!showAnalytics)}
                  activeOpacity={0.7}
                >
                  <BlurView
                    intensity={20}
                    tint={isDark ? "dark" : "light"}
                    style={[styles.analyticsHeader, { borderColor: theme.colors.outline }]}
                  >
                    <View style={styles.analyticsHeaderInner}>
                      <View style={styles.analyticsIconContainer}>
                        <IconButton icon="chart-bar" size={24} iconColor="#10B981" style={{ margin: 0 }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.analyticsSectionTitle, { color: theme.colors.onSurface }]}>
                          Response Analytics
                        </Text>
                        <Text style={[styles.analyticsSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                          {responses.length} total responses • {analytics.length} questions
                        </Text>
                      </View>
                      <IconButton
                        icon={showAnalytics ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        iconColor={theme.colors.onSurfaceDisabled}
                        style={{ margin: 0 }}
                      />
                    </View>
                  </BlurView>
                </TouchableOpacity>

                {showAnalytics && analytics.map(q => {
                  const isChoiceType = q.responseType === 'single_choice' || q.responseType === 'multiple_choice';
                  const isExpanded = expandedQuestions.has(q.questionId);
                  const sortedChoices = q.choiceCounts ? getSortedChoices(q.choiceCounts) : [];

                  return (
                    <TouchableOpacity
                      key={q.questionId}
                      onPress={() => isChoiceType && toggleQuestionExpanded(q.questionId)}
                      activeOpacity={isChoiceType ? 0.7 : 1}
                    >
                      <BlurView
                        intensity={15}
                        tint={isDark ? "dark" : "light"}
                        style={[styles.analyticsCard, { borderColor: theme.colors.outline }]}
                      >
                        <View style={styles.analyticsCardInner}>
                          {/* Question Header */}
                          <View style={styles.questionHeader}>
                            <IconButton
                              icon={getResponseTypeIcon(q.responseType)}
                              size={18}
                              iconColor="#60A5FA"
                              style={{ margin: 0 }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.questionTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
                                {q.questionText}
                              </Text>
                              <Text style={[styles.questionType, { color: theme.colors.onSurfaceDisabled }]}>
                                {getResponseTypeLabel(q.responseType)}
                              </Text>
                            </View>
                            {isChoiceType ? (
                              <IconButton
                                icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                iconColor={theme.colors.onSurfaceDisabled}
                                style={{ margin: 0 }}
                              />
                            ) : (
                              <View style={styles.responseCountBadge}>
                                <Text style={styles.responseCountText}>{q.totalResponses}</Text>
                              </View>
                            )}
                          </View>

                          {/* Choice Breakdown - Always visible for choice types */}
                          {isChoiceType && sortedChoices.length > 0 && (
                            <View style={styles.choiceBreakdown}>
                              {(isExpanded ? sortedChoices : sortedChoices.slice(0, 3)).map(([choice, count], idx) => {
                                const percentage = Math.round((count / responses.length) * 100);
                                return (
                                  <View key={idx} style={styles.choiceRow}>
                                    <View style={styles.choiceInfo}>
                                      <Text style={[styles.choiceLabel, { color: theme.colors.onSurface }]} numberOfLines={1}>
                                        {choice}
                                      </Text>
                                      <Text style={[styles.choiceCount, { color: theme.colors.onSurfaceVariant }]}>
                                        {count} ({percentage}%)
                                      </Text>
                                    </View>
                                    <View style={[styles.choiceBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                                      <View
                                        style={[
                                          styles.choiceBarFill,
                                          {
                                            width: `${percentage}%`,
                                            backgroundColor: idx === 0 ? '#10B981' : '#60A5FA',
                                          },
                                        ]}
                                      />
                                    </View>
                                  </View>
                                );
                              })}
                              {!isExpanded && sortedChoices.length > 3 && (
                                <Text style={[styles.moreChoices, { color: theme.colors.onSurfaceVariant }]}>
                                  +{sortedChoices.length - 3} more options
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}

                {/* Individual Responses Section */}
                <View style={styles.responsesSection}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                    Individual Responses
                  </Text>

                  {responses.map(response => {
                    const isExpanded = expandedUsers.has(response.userId);

                    return (
                      <TouchableOpacity
                        key={response.id}
                        onPress={() => toggleExpanded(response.userId)}
                        activeOpacity={0.7}
                      >
                        <BlurView
                          intensity={20}
                          tint={isDark ? "dark" : "light"}
                          style={[styles.responseCard, { borderColor: theme.colors.outline }]}
                        >
                          <View style={styles.responseCardInner}>
                            <View style={styles.responseHeader}>
                              <View style={styles.avatar}>
                                <Text style={[styles.avatarText, { color: theme.colors.onSurface }]}>
                                  {response.userName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.responseInfo}>
                                <Text style={[styles.responseName, { color: theme.colors.onSurface }]}>{response.userName}</Text>
                                <Text style={[styles.responseEmail, { color: theme.colors.onSurfaceDisabled }]}>{response.userEmail}</Text>
                              </View>
                              <IconButton
                                icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                iconColor={theme.colors.onSurfaceDisabled}
                                style={{ margin: 0 }}
                              />
                            </View>

                            {isExpanded && (
                              <View style={styles.answersContainer}>
                                {response.responses.map((answer, idx) => (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.answerRow,
                                      { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                                    ]}
                                  >
                                    <Text style={[styles.questionText, { color: theme.colors.onSurfaceVariant }]}>
                                      {answer.questionText}
                                    </Text>
                                    <Text style={[styles.answerText, { color: theme.colors.onSurface }]}>
                                      {Array.isArray(answer.answer) ? answer.answer.join(', ') : answer.answer || '—'}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        </BlurView>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <IconButton icon="calendar-blank" size={48} iconColor={theme.colors.onSurfaceDisabled} />
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceDisabled }]}>
              No events with questionnaires
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.colors.onSurfaceDisabled }]}>
              Create an event with a questionnaire to see responses here
            </Text>
          </View>
        )}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingResponses: {
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
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  // Analytics Section
  analyticsHeader: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
  },
  analyticsHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  analyticsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyticsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  analyticsSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  analyticsCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
  },
  analyticsCardInner: {
    padding: 14,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  questionType: {
    fontSize: 11,
    marginTop: 2,
  },
  responseCountBadge: {
    backgroundColor: '#60A5FA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  responseCountText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  choiceBreakdown: {
    marginTop: 12,
    gap: 8,
  },
  choiceRow: {
    gap: 4,
  },
  choiceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  choiceLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  choiceCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  choiceBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  choiceBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  moreChoices: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // Individual Responses Section
  responsesSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  responseCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
  },
  responseCardInner: {
    padding: 14,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  responseInfo: {
    flex: 1,
  },
  responseName: {
    fontSize: 15,
    fontWeight: '600',
  },
  responseEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  answersContainer: {
    marginTop: 14,
  },
  answerRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  questionText: {
    fontSize: 12,
    marginBottom: 3,
    fontWeight: '500',
  },
  answerText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
