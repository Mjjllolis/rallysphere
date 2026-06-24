// components/forms/EventForm.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Alert, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { createEvent, uploadImage, getClubs, saveEventQuestionnaire } from '../../lib/firebase';
import { useAuth, useThemeToggle } from '../../app/_layout';
import GlassInput from '../GlassInput';
import GlassSwitch from '../GlassSwitch';
import GlassDropdown from '../GlassDropdown';
import GlassImageCard from '../GlassImageCard';
import GlassButton from '../GlassButton';
import GlassDateTimePicker from '../GlassDateTimePicker';
import GlassTagInput from '../GlassTagInput';
import QuestionnaireBuilderSheet from '../QuestionnaireBuilderSheet';
import type { Club, Question, Questionnaire } from '../../lib/firebase';

interface EventFormProps {
  onColorsExtracted: (colors: string[]) => void;
  onSuccess: () => void;
  onScrollToField?: (y: number) => void;
}

export default function EventForm({ onColorsExtracted, onSuccess, onScrollToField }: EventFormProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  // Track field positions for scroll-to-field
  const fieldPositions = useRef<{ [key: string]: number }>({});

  const handleFieldLayout = useCallback((fieldName: string) => (event: LayoutChangeEvent) => {
    fieldPositions.current[fieldName] = event.nativeEvent.layout.y;
  }, []);

  const handleFieldFocus = useCallback((fieldName: string) => () => {
    const y = fieldPositions.current[fieldName];
    if (y !== undefined && onScrollToField) {
      onScrollToField(y);
    }
  }, [onScrollToField]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
    rallyCreditsPayout: '',
  });

  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [hasWaiver, setHasWaiver] = useState(false);
  const [hasQuestionnaire, setHasQuestionnaire] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestionnaireBuilder, setShowQuestionnaireBuilder] = useState(false);
  const [waiverText, setWaiverText] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000));

  useEffect(() => {
    loadAvailableClubs();
  }, []);

  const loadAvailableClubs = async () => {
    if (!user) return;
    const result = await getClubs();
    if (result.success) {
      const userClubs = result.clubs.filter(c =>
        c.admins.includes(user.uid)
      );
      setAvailableClubs(userClubs);
      if (userClubs.length > 0) {
        setSelectedClub(userClubs[0]);
      }
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClubSelect = (clubName: string) => {
    const club = availableClubs.find(c => c.name === clubName);
    if (club) {
      setSelectedClub(club);
    }
  };

  // Check if all required fields are filled
  const isFormComplete = () => {
    return (
      formData.title.trim().length > 0 &&
      formData.description.trim().length > 0 &&
      selectedClub !== null &&
      formData.location.trim().length > 0 &&
      endDate > startDate &&
      (!hasWaiver || waiverText.trim().length > 0) &&
      (!hasQuestionnaire || questions.length > 0)
    );
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Event title is required');
      return false;
    }
    if (!formData.description.trim()) {
      Alert.alert('Error', 'Event description is required');
      return false;
    }
    if (!selectedClub) {
      Alert.alert('Error', 'Please select a club');
      return false;
    }
    if (!formData.location.trim()) {
      Alert.alert('Error', 'Location is required');
      return false;
    }
    if (endDate <= startDate) {
      Alert.alert('Error', 'End time must be after start time');
      return false;
    }
    if (hasWaiver && !waiverText.trim()) {
      Alert.alert('Error', 'Waiver text is required when waiver is enabled');
      return false;
    }
    if (hasQuestionnaire && questions.length === 0) {
      Alert.alert('Error', 'Please add at least one question to the questionnaire');
      return false;
    }
    return true;
  };

  const handleCreateEvent = async () => {
    if (!validateForm()) return;
    if (!user || !selectedClub) return;

    setLoading(true);
    try {
      let coverImageUrl: string | undefined;

      if (coverImage) {
        const imagePath = `events/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, imagePath) || undefined;
      }

      // Calculate ticket price - ensure it's 0 if empty or payouts not set up
      const hasPayouts = !!(selectedClub?.finixOnboardingComplete || selectedClub?.finixMerchantAccountActive);
      const ticketPriceValue = hasPayouts && formData.ticketPrice ? parseFloat(formData.ticketPrice) : 0;

      // Calculate max attendees - default to 999 if blank
      const maxAttendeesValue = formData.maxAttendees && formData.maxAttendees.trim() !== ''
        ? parseInt(formData.maxAttendees)
        : 999;

      // Calculate Rally Credits payout - only for authorized event creators
      const isAuthorizedCreator = selectedClub.admins.includes(user.uid);
      const rallyCreditsPayoutValue = isAuthorizedCreator && formData.rallyCreditsPayout
        ? parseInt(formData.rallyCreditsPayout)
        : undefined;

      // console.log('Max Attendees Input:', formData.maxAttendees);
      // console.log('Max Attendees Value:', maxAttendeesValue);
      // console.log('Rally Credits Payout:', rallyCreditsPayoutValue);

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        tags,
        clubId: selectedClub.id,
        clubName: selectedClub.name,
        createdBy: user.uid,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        location: formData.location.trim(),
        isVirtual: false,
        maxAttendees: maxAttendeesValue,
        coverImage: coverImageUrl,
        isPublic,
        requiresApproval: false,
        ticketPrice: ticketPriceValue,
        currency: formData.currency,
        rallyCreditsAwarded: rallyCreditsPayoutValue,
        hasWaiver: hasWaiver,
        waiverText: hasWaiver ? waiverText.trim() : undefined,
        hasQuestionnaire,
        questionnaireTitle: hasQuestionnaire ? 'Event Registration' : undefined,
        questionCount: hasQuestionnaire ? questions.length : 0,
      };

      const result = await createEvent(eventData);
      if (result.success && result.eventId) {
        // Save questionnaire questions if enabled
        if (hasQuestionnaire && questions.length > 0) {
          await saveEventQuestionnaire(result.eventId, questions);
        }
        onSuccess();
        router.push(`/event/${result.eventId}`);
      } else {
        Alert.alert('Error', result.error || 'Failed to create event');
      }
    } catch (error) {
      // console.error('Create event error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      {/* Image Card */}
      <GlassImageCard
        imageUri={coverImage}
        onImageSelected={setCoverImage}
        onColorsExtracted={onColorsExtracted}
        aspectRatio={[4, 5]}
        placeholder="Tap to add event cover"
      />

      {/* Club Selection */}
      <View onLayout={handleFieldLayout('club')}>
        <GlassDropdown
          label="Club *"
          value={selectedClub?.name || ''}
          options={availableClubs.map(c => c.name)}
          onSelect={handleClubSelect}
          placeholder="Select a club..."
          icon="account-group"
        />
      </View>

      {/* Basic Info */}
      <View onLayout={handleFieldLayout('title')}>
        <GlassInput
          label="Event Title *"
          value={formData.title}
          onChangeText={(value) => updateFormData('title', value)}
          placeholder="Enter event title"
          onFocus={handleFieldFocus('title')}
        />
      </View>

      <View onLayout={handleFieldLayout('description')}>
        <GlassInput
          label="Description *"
          value={formData.description}
          onChangeText={(value) => updateFormData('description', value)}
          placeholder="What's this event about?"
          multiline
          numberOfLines={4}
          onFocus={handleFieldFocus('description')}
        />
      </View>

      {/* Tags Section */}
      <View onLayout={handleFieldLayout('tags')}>
        <GlassTagInput
          label="Tags"
          tags={tags}
          onTagsChange={setTags}
          placeholder="Type and press return to add tags..."
          onFocus={handleFieldFocus('tags')}
        />
      </View>

      <View onLayout={handleFieldLayout('location')}>
        <GlassInput
          label="Location *"
          value={formData.location}
          onChangeText={(value) => updateFormData('location', value)}
          placeholder="e.g., Student Center Room 201"
          icon="map-marker"
          onFocus={handleFieldFocus('location')}
        />
      </View>

      {/* Date & Time */}
      <View onLayout={handleFieldLayout('startDate')}>
        <GlassDateTimePicker
          label="Start Date & Time"
          date={startDate}
          onDateChange={setStartDate}
          minimumDate={new Date()}
          onOpen={handleFieldFocus('startDate')}
        />
      </View>

      <View onLayout={handleFieldLayout('endDate')}>
        <GlassDateTimePicker
          label="End Date & Time"
          date={endDate}
          onDateChange={setEndDate}
          minimumDate={startDate}
          onOpen={handleFieldFocus('endDate')}
        />
      </View>

      {/* Additional Options */}
      <View onLayout={handleFieldLayout('maxAttendees')}>
        <GlassInput
          label="Max Attendees"
          value={formData.maxAttendees}
          onChangeText={(value) => updateFormData('maxAttendees', value)}
          placeholder="Unlimited"
          keyboardType="numeric"
          icon="account-m"
          onFocus={handleFieldFocus('maxAttendees')}
        />
      </View>

      <View onLayout={handleFieldLayout('ticketPrice')}>
        <GlassInput
          label="Ticket Price"
          value={(selectedClub?.finixOnboardingComplete || selectedClub?.finixMerchantAccountActive) ? formData.ticketPrice : 'Free'}
          onChangeText={(value) => updateFormData('ticketPrice', value)}
          placeholder="Free"
          keyboardType="decimal-pad"
          icon="currency-usd"
          editable={(selectedClub?.finixOnboardingComplete || selectedClub?.finixMerchantAccountActive) === true}
          style={!(selectedClub?.finixOnboardingComplete || selectedClub?.finixMerchantAccountActive) && styles.disabledInput}
          onFocus={handleFieldFocus('ticketPrice')}
        />
      </View>

      {selectedClub && !selectedClub.finixOnboardingComplete && !selectedClub.finixMerchantAccountActive && (
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Connect payouts to accept payments</Text>
            <Text style={[styles.warningText, { color: theme.colors.onSurfaceVariant }]}>
              Set up payouts in club settings to create paid events
            </Text>
          </View>
        </View>
      )}

      {/* Rally Credits Payout - Only for club admins */}
      {selectedClub && selectedClub.admins.includes(user?.uid || '') && (
        <View onLayout={handleFieldLayout('rallyCreditsPayout')}>
          <GlassInput
            label="Rally Credits Payout"
            value={formData.rallyCreditsPayout}
            onChangeText={(value) => updateFormData('rallyCreditsPayout', value)}
            placeholder="0"
            keyboardType="numeric"
            icon="star-circle"
            onFocus={handleFieldFocus('rallyCreditsPayout')}
          />
        </View>
      )}

      <GlassSwitch
        label="Public Event"
        description="Anyone can discover and join"
        value={isPublic}
        onValueChange={setIsPublic}
      />

      <GlassSwitch
        label="Require Waiver"
        description="Users must agree to terms before joining"
        value={hasWaiver}
        onValueChange={setHasWaiver}
      />

      {hasWaiver && (
        <View onLayout={handleFieldLayout('waiverText')}>
          <GlassInput
            label="Waiver / Terms Text *"
            value={waiverText}
            onChangeText={setWaiverText}
            placeholder="Enter the waiver or terms that attendees must agree to..."
            multiline
            numberOfLines={6}
            icon="file-document-outline"
            onFocus={handleFieldFocus('waiverText')}
          />
        </View>
      )}

      <TouchableOpacity
        onPress={() => setShowQuestionnaireBuilder(true)}
        activeOpacity={0.7}
        style={styles.configButtonWrapper}
      >
        {isDark ? (
          <BlurView intensity={40} tint="light" style={[styles.configButton, { borderColor: theme.colors.outline }]}>
            <View style={styles.configButtonContent}>
              <IconButton icon="clipboard-text-outline" size={20} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
              <View style={styles.configButtonText}>
                <Text variant="bodyMedium" style={[styles.configLabel, { color: theme.colors.onSurface }]}>
                  Event Questionnaire
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {hasQuestionnaire && questions.length > 0
                    ? `${questions.length} ${questions.length === 1 ? 'Question' : 'Questions'}`
                    : 'Optional'}
                </Text>
              </View>
            </View>
            <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
          </BlurView>
        ) : (
          <View style={[styles.configButton, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.configButtonContent}>
              <IconButton icon="clipboard-text-outline" size={20} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
              <View style={styles.configButtonText}>
                <Text variant="bodyMedium" style={[styles.configLabel, { color: theme.colors.onSurface }]}>
                  Event Questionnaire
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {hasQuestionnaire && questions.length > 0
                    ? `${questions.length} ${questions.length === 1 ? 'Question' : 'Questions'}`
                    : 'Optional'}
                </Text>
              </View>
            </View>
            <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
          </View>
        )}
      </TouchableOpacity>

      {/* Submit Button */}
      <GlassButton
        title="Create Event"
        onPress={handleCreateEvent}
        loading={loading}
        disabled={loading}
        variant="primary"
        isReady={isFormComplete()}
      />

      {/* Questionnaire Builder Modal */}
      <QuestionnaireBuilderSheet
        visible={showQuestionnaireBuilder}
        questionnaire={{ enabled: hasQuestionnaire, questions }}
        onDismiss={() => setShowQuestionnaireBuilder(false)}
        onSave={(questionnaire: Questionnaire) => {
          setHasQuestionnaire(questionnaire.enabled);
          setQuestions(questionnaire.questions);
          setShowQuestionnaireBuilder(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  disabledInput: {
    opacity: 0.5,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginTop: -8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  configButtonWrapper: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  configButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  configButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  configLabel: {
    fontWeight: '600',
    marginBottom: 2,
  },
});
