// app/event/edit.tsx - Edit Event Screen
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { getEventById, updateEvent, uploadImage, getClub } from '../../lib/firebase';
import { useAuth, useThemeToggle } from '../_layout';
import GlassInput from '../../components/GlassInput';
import GlassSwitch from '../../components/GlassSwitch';
import GlassImageCard from '../../components/GlassImageCard';
import GlassButton from '../../components/GlassButton';
import GlassDateTimePicker from '../../components/GlassDateTimePicker';
import GlassTagInput from '../../components/GlassTagInput';
import type { Club } from '../../lib/firebase';

export default function EditEventScreen() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [club, setClub] = useState<Club | null>(null);
  const [backgroundColors, setBackgroundColors] = useState<string[]>(['#6366f1', '#8b5cf6', '#d946ef']);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
    rallyCreditsAwarded: '',
  });

  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [hasWaiver, setHasWaiver] = useState(false);
  const [waiverText, setWaiverText] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [originalCoverImage, setOriginalCoverImage] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000));

  useEffect(() => {
    loadEventData();
  }, [eventId]);

  const loadEventData = async () => {
    if (!eventId) return;
    try {
      const result = await getEventById(eventId);
      if (result.success && result.event) {
        const e = result.event;

        // Check if user is allowed to edit
        if (e.clubId) {
          const clubResult = await getClub(e.clubId);
          if (clubResult.success && clubResult.club) {
            setClub(clubResult.club);
            const cAdmins: string[] = ((clubResult.club as any).clubAdmins || clubResult.club.admins) || [];
            const cOwner = (clubResult.club as any).clubOwner || clubResult.club.owner;
            const isAdmin = user && (
              e.createdBy === user.uid ||
              cAdmins.includes(user.uid) ||
              cOwner === user.uid
            );
            if (!isAdmin) {
              Alert.alert('Access Denied', 'You do not have permission to edit this event.');
              router.back();
              return;
            }
          }
        }

        setFormData({
          title: e.title || '',
          description: e.description || '',
          location: e.location || '',
          maxAttendees: e.maxAttendees ? String(e.maxAttendees) : '',
          ticketPrice: e.ticketPrice ? String(e.ticketPrice) : '',
          currency: e.currency || 'USD',
          rallyCreditsAwarded: e.rallyCreditsAwarded ? String(e.rallyCreditsAwarded) : '',
        });
        setTags(e.tags || []);
        setIsPublic(e.isPublic ?? true);
        setHasWaiver(e.hasWaiver ?? false);
        setWaiverText(e.waiverText || '');
        setCoverImage(e.coverImage || null);
        setOriginalCoverImage(e.coverImage || null);

        const start = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate);
        const end = e.endDate?.toDate ? e.endDate.toDate() : new Date(e.endDate);
        setStartDate(start);
        setEndDate(end);
      } else {
        Alert.alert('Error', 'Event not found');
        router.back();
      }
    } catch (error) {
      // console.error('Error loading event:', error);
      Alert.alert('Error', 'Failed to load event');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
    return true;
  };

  const handleSave = async () => {
    if (!validateForm() || !user) return;

    setSaving(true);
    try {
      let coverImageUrl: string | undefined = originalCoverImage || undefined;

      // Upload new cover image if changed
      if (coverImage && coverImage !== originalCoverImage) {
        const imagePath = `events/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, imagePath) || undefined;
      }

      // Calculate values similar to EventForm
      const hasPayouts = !!(club?.finixOnboardingComplete || club?.finixMerchantAccountActive);
      const ticketPriceValue = hasPayouts && formData.ticketPrice ? parseFloat(formData.ticketPrice) : 0;
      const maxAttendeesValue = formData.maxAttendees && formData.maxAttendees.trim() !== ''
        ? parseInt(formData.maxAttendees)
        : 999;
      const isAuthorizedCreator = club && user && club.admins.includes(user.uid);
      const rallyCreditsPayoutValue = isAuthorizedCreator && formData.rallyCreditsAwarded
        ? parseInt(formData.rallyCreditsAwarded)
        : undefined;

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        tags,
        location: formData.location.trim(),
        isVirtual: false,
        maxAttendees: maxAttendeesValue,
        coverImage: coverImageUrl,
        isPublic,
        ticketPrice: ticketPriceValue,
        currency: formData.currency,
        rallyCreditsAwarded: rallyCreditsPayoutValue,
        hasWaiver,
        waiverText: hasWaiver ? waiverText.trim() : undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };

      const result = await updateEvent(eventId, eventData);
      if (result.success) {
        Alert.alert('Saved', 'Event updated successfully.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to update event');
      }
    } catch (error) {
      // console.error('Save event error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleColorsExtracted = (colors: string[]) => {
    setBackgroundColors(colors);
  };

  const isFormComplete = () => {
    return (
      formData.title.trim().length > 0 &&
      formData.description.trim().length > 0 &&
      club !== null &&
      formData.location.trim().length > 0 &&
      endDate > startDate &&
      (!hasWaiver || waiverText.trim().length > 0)
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <Text style={{ color: theme.colors.onSurface }}>Loading event...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Background with Gradient Overlay */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.themedBackground, { backgroundColor: theme.colors.background }]} />
      </View>
      <LinearGradient
        colors={[
          `rgba(${parseInt(backgroundColors[0].slice(1, 3), 16)}, ${parseInt(backgroundColors[0].slice(3, 5), 16)}, ${parseInt(backgroundColors[0].slice(5, 7), 16)}, 0.25)`,
          `rgba(${parseInt(backgroundColors[1].slice(1, 3), 16)}, ${parseInt(backgroundColors[1].slice(3, 5), 16)}, ${parseInt(backgroundColors[1].slice(5, 7), 16)}, 0.15)`,
          `rgba(${parseInt(backgroundColors[2].slice(1, 3), 16)}, ${parseInt(backgroundColors[2].slice(3, 5), 16)}, ${parseInt(backgroundColors[2].slice(5, 7), 16)}, 0.08)`,
          'rgba(0, 0, 0, 0)'
        ]}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={[styles.headerContainer, { borderBottomColor: theme.colors.outline }]}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <IconButton icon="close" size={24} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
            </TouchableOpacity>
            <View style={styles.typeSelectorWrapper}>
              <View style={[styles.typeSelector, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.typeSelectorText, { color: theme.colors.onSurface }]}>Edit Event</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Form Content */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            indicatorStyle={isDark ? "white" : "black"}
            bounces={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Club Info Label */}
            {club && (
              <View style={styles.clubInfoLabel}>
                <Text style={[styles.clubInfoText, { color: theme.colors.onSurface }]}>
                  Editing event for <Text style={{ fontWeight: 'bold' }}>{club.name}</Text>
                </Text>
              </View>
            )}

            {/* Image Card */}
            <GlassImageCard
              imageUri={coverImage}
              onImageSelected={setCoverImage}
              onColorsExtracted={handleColorsExtracted}
              aspectRatio={[4, 5]}
              placeholder="Tap to change event cover"
            />

            {/* Basic Info */}
            <GlassInput
              label="Event Title *"
              value={formData.title}
              onChangeText={(value) => updateFormData('title', value)}
              placeholder="Enter event title"
            />

            <GlassInput
              label="Description *"
              value={formData.description}
              onChangeText={(value) => updateFormData('description', value)}
              placeholder="What's this event about?"
              multiline
              numberOfLines={4}
            />

            {/* Tags Section */}
            <GlassTagInput
              label="Tags"
              tags={tags}
              onTagsChange={setTags}
              placeholder="Type and press return to add tags..."
            />

            <GlassInput
              label="Location *"
              value={formData.location}
              onChangeText={(value) => updateFormData('location', value)}
              placeholder="e.g., Student Center Room 201"
              icon="map-marker"
            />

            {/* Date & Time */}
            <GlassDateTimePicker
              label="Start Date & Time"
              date={startDate}
              onDateChange={setStartDate}
              minimumDate={new Date()}
            />

            <GlassDateTimePicker
              label="End Date & Time"
              date={endDate}
              onDateChange={setEndDate}
              minimumDate={startDate}
            />

            {/* Additional Options */}
            <GlassInput
              label="Max Attendees"
              value={formData.maxAttendees}
              onChangeText={(value) => updateFormData('maxAttendees', value)}
              placeholder="Unlimited"
              keyboardType="numeric"
              icon="account-multiple"
            />

            <GlassInput
              label="Ticket Price"
              value={(club?.finixOnboardingComplete || club?.finixMerchantAccountActive) ? formData.ticketPrice : 'Free'}
              onChangeText={(value) => updateFormData('ticketPrice', value)}
              placeholder="Free"
              keyboardType="decimal-pad"
              icon="currency-usd"
              editable={(club?.finixOnboardingComplete || club?.finixMerchantAccountActive) === true}
              style={!(club?.finixOnboardingComplete || club?.finixMerchantAccountActive) && styles.disabledInput}
            />

            {club && !club.finixOnboardingComplete && !club.finixMerchantAccountActive && (
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
            {club && club.admins.includes(user?.uid || '') && (
              <GlassInput
                label="Rally Credits Payout"
                value={formData.rallyCreditsAwarded}
                onChangeText={(value) => updateFormData('rallyCreditsAwarded', value)}
                placeholder="0"
                keyboardType="numeric"
                icon="star-circle"
              />
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
              <GlassInput
                label="Waiver / Terms Text *"
                value={waiverText}
                onChangeText={setWaiverText}
                placeholder="Enter the waiver or terms that attendees must agree to..."
                multiline
                numberOfLines={6}
                icon="file-document-outline"
              />
            )}

            {/* Submit Button */}
            <GlassButton
              title="Save Changes"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              variant="primary"
              isReady={isFormComplete()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
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
  themedBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeSelectorWrapper: {
    flex: 1,
    alignItems: 'center',
    marginRight: 40,
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  typeSelectorText: {
    fontSize: 17,
    fontWeight: '600',
    marginRight: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  clubInfoLabel: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  clubInfoText: {
    fontSize: 14,
    textAlign: 'center',
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
});
