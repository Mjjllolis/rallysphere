// components/forms/EventForm.tsx
import React, { useState, useEffect } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { createEvent, uploadImage, getClubs } from '../../lib/firebase';
import { useAuth } from '../../app/_layout';
import GlassInput from '../GlassInput';
import GlassSwitch from '../GlassSwitch';
import GlassDropdown from '../GlassDropdown';
import GlassImageCard from '../GlassImageCard';
import GlassButton from '../GlassButton';
import GlassDateTimePicker from '../GlassDateTimePicker';
import type { Club } from '../../lib/firebase';

interface EventFormProps {
  onColorsExtracted: (colors: string[]) => void;
  onSuccess: () => void;
}

export default function EventForm({ onColorsExtracted, onSuccess }: EventFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
  });

  const [isPublic, setIsPublic] = useState(true);
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
        c.admins.includes(user.uid) || c.members.includes(user.uid)
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
      endDate > startDate
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

      // Calculate ticket price - ensure it's 0 if empty or Stripe not set up
      const hasStripe = selectedClub?.stripeOnboardingComplete === true;
      const ticketPriceValue = hasStripe && formData.ticketPrice ? parseFloat(formData.ticketPrice) : 0;

      // Calculate max attendees - default to 999 if blank
      const maxAttendeesValue = formData.maxAttendees && formData.maxAttendees.trim() !== ''
        ? parseInt(formData.maxAttendees)
        : 999;

      console.log('Max Attendees Input:', formData.maxAttendees);
      console.log('Max Attendees Value:', maxAttendeesValue);

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
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
      };

      const result = await createEvent(eventData);
      if (result.success) {
        Alert.alert(
          'Success!',
          'Your event has been created successfully!',
          [{
            text: 'OK',
            onPress: () => {
              onSuccess();
              router.push(`/(tabs)/event-detail?id=${result.eventId}`);
            }
          }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create event');
      }
    } catch (error) {
      console.error('Create event error:', error);
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
      <GlassDropdown
        label="Club *"
        value={selectedClub?.name || ''}
        options={availableClubs.map(c => c.name)}
        onSelect={handleClubSelect}
        placeholder="Select a club..."
        icon="account-group"
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
        style={{ height: 100 }}
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
        value={selectedClub?.stripeOnboardingComplete ? formData.ticketPrice : 'Free'}
        onChangeText={(value) => updateFormData('ticketPrice', value)}
        placeholder="Free"
        keyboardType="decimal-pad"
        icon="currency-usd"
        editable={selectedClub?.stripeOnboardingComplete === true}
        style={!selectedClub?.stripeOnboardingComplete && styles.disabledInput}
      />

      {selectedClub && !selectedClub.stripeOnboardingComplete && (
        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Connect Stripe to accept payments</Text>
            <Text style={styles.warningText}>
              Set up payouts in club settings to create paid events
            </Text>
          </View>
        </View>
      )}

      <GlassSwitch
        label="Public Event"
        description="Anyone can discover and join"
        value={isPublic}
        onValueChange={setIsPublic}
      />

      {/* Submit Button */}
      <GlassButton
        title="Create Event"
        onPress={handleCreateEvent}
        loading={loading}
        disabled={loading}
        variant="primary"
        isReady={isFormComplete()}
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
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
  },
});
