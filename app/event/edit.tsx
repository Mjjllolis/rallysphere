// app/event/edit.tsx - Edit Event Screen
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  Switch,
  IconButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getEventById, updateEvent, uploadImage, getClub } from '../../lib/firebase';
import { useAuth, useThemeToggle } from '../_layout';
import { LinearGradient } from 'expo-linear-gradient';
import BackButton from '../../components/BackButton';
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
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    address: '',
    address2: '',
    city: '',
    state: '',
    zipCode: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
    rallyCreditsAwarded: '',
  });

  const [isPublic, setIsPublic] = useState(true);
  const [hasWaiver, setHasWaiver] = useState(false);
  const [waiverText, setWaiverText] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [originalCoverImage, setOriginalCoverImage] = useState<string | null>(null);

  const inputTheme = isDark ? { colors: { background: theme.colors.elevation.level2 } } : undefined;

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
            const isAdmin = user && (
              e.createdBy === user.uid ||
              clubResult.club.admins.includes(user.uid) ||
              clubResult.club.owner === user.uid
            );
            if (!isAdmin) {
              Alert.alert('Access Denied', 'You do not have permission to edit this event.');
              router.back();
              return;
            }
          }
        }

        // Parse existing location into structured fields if possible
        // Old events stored location as a single string
        const locationStr = e.location || '';
        const parts = locationStr.split(', ');

        setFormData({
          title: e.title || '',
          description: e.description || '',
          location: locationStr,
          address: parts[0] || '',
          address2: '',
          city: parts.length >= 3 ? parts[parts.length - 2] || '' : '',
          state: '',
          zipCode: '',
          maxAttendees: e.maxAttendees ? String(e.maxAttendees) : '',
          ticketPrice: e.ticketPrice ? String(e.ticketPrice) : '',
          currency: e.currency || 'USD',
          rallyCreditsAwarded: e.rallyCreditsAwarded ? String(e.rallyCreditsAwarded) : '',
        });
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

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need camera roll permissions to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setCoverImage(result.assets[0].uri);
      }
    } catch (error) {
      // console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
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
    if (!formData.address.trim() || !formData.city.trim() || !formData.state.trim() || !formData.zipCode.trim()) {
      Alert.alert('Error', 'Address, City, State, and Zip are required');
      return false;
    }
    if (endDate <= startDate) {
      Alert.alert('Error', 'End time must be after start time');
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

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        location: [
          formData.address.trim(),
          formData.address2.trim(),
          `${formData.city.trim()}, ${formData.state.trim().toUpperCase()} ${formData.zipCode.trim()}`,
        ].filter(Boolean).join(', '),
        isVirtual: false,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        coverImage: coverImageUrl,
        isPublic,
        ticketPrice: formData.ticketPrice ? parseFloat(formData.ticketPrice) : undefined,
        currency: formData.ticketPrice ? formData.currency : undefined,
        rallyCreditsAwarded: formData.rallyCreditsAwarded ? parseInt(formData.rallyCreditsAwarded) : undefined,
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

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartDatePicker(false);
      return;
    }
    if (selectedDate) {
      const newStartDate = new Date(selectedDate);
      newStartDate.setHours(startDate.getHours(), startDate.getMinutes());
      setStartDate(newStartDate);
      if (endDate <= newStartDate) {
        setEndDate(new Date(newStartDate.getTime() + 2 * 60 * 60 * 1000));
      }
    }
    if (Platform.OS === 'android') setShowStartDatePicker(false);
  };

  const onStartTimeChange = (event: any, selectedTime?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartTimePicker(false);
      return;
    }
    if (selectedTime) {
      const newStartDate = new Date(startDate);
      newStartDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setStartDate(newStartDate);
      if (endDate <= newStartDate) {
        setEndDate(new Date(newStartDate.getTime() + 2 * 60 * 60 * 1000));
      }
    }
    if (Platform.OS === 'android') setShowStartTimePicker(false);
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowEndDatePicker(false);
      return;
    }
    if (selectedDate) {
      const newEndDate = new Date(selectedDate);
      newEndDate.setHours(endDate.getHours(), endDate.getMinutes());
      if (newEndDate <= startDate) {
        Alert.alert('Invalid Date', 'End date must be after start date');
        setShowEndDatePicker(false);
        return;
      }
      setEndDate(newEndDate);
    }
    if (Platform.OS === 'android') setShowEndDatePicker(false);
  };

  const onEndTimeChange = (event: any, selectedTime?: Date) => {
    if (event.type === 'dismissed') {
      setShowEndTimePicker(false);
      return;
    }
    if (selectedTime) {
      const newEndDate = new Date(endDate);
      newEndDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      if (newEndDate <= startDate) {
        Alert.alert('Invalid Time', 'End time must be after start time');
        setShowEndTimePicker(false);
        return;
      }
      setEndDate(newEndDate);
    }
    if (Platform.OS === 'android') setShowEndTimePicker(false);
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
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View>
          <LinearGradient
            colors={(theme as any).gradients?.primary || ['#1B365D', '#2B4A73', '#3A5F8F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.headerContent}>
                <BackButton color="white" backgroundColor="rgba(255,255,255,0.2)" />
                <Text style={styles.headerTitle}>Edit Event</Text>
                <View style={styles.placeholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          {/* Club Info (read-only) */}
          {club && (
            <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
              <Card.Content style={styles.cardContent}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                    <IconButton icon="account-group" size={20} iconColor={theme.colors.primary} />
                  </View>
                  <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Club</Text>
                </View>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>{club.name}</Text>
              </Card.Content>
            </Card>
          )}

          {/* Cover Image */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="image" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Cover Image</Text>
              </View>

              <TouchableOpacity onPress={pickImage} activeOpacity={0.7}>
                <LinearGradient
                  colors={isDark ? ['rgba(30,40,60,0.8)', 'rgba(20,30,48,0.8)'] : ['#E1E7F1', '#D4DCE8']}
                  style={styles.coverImageContainer}
                >
                  {coverImage ? (
                    <ExpoImage source={{ uri: coverImage }} style={styles.coverImagePreview} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <IconButton icon="camera-plus" size={40} iconColor={theme.colors.primary} />
                      <Text style={styles.imagePlaceholderText}>Tap to change cover image</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Basic Information */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="information" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Event Details</Text>
              </View>

              <TextInput
                theme={inputTheme}
                label="Event Title *"
                value={formData.title}
                onChangeText={(value) => updateFormData('title', value)}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                theme={inputTheme}
                label="Description *"
                value={formData.description}
                onChangeText={(value) => updateFormData('description', value)}
                mode="outlined"
                multiline
                numberOfLines={8}
                style={[styles.input, styles.descriptionInput]}
                contentStyle={styles.descriptionContent}
              />

              <TextInput
                theme={inputTheme}
                label="Address *"
                value={formData.address}
                onChangeText={(value) => updateFormData('address', value)}
                mode="outlined"
                style={styles.input}
                placeholder="123 Main St"
              />

              <TextInput
                theme={inputTheme}
                label="Address Line 2"
                value={formData.address2}
                onChangeText={(value) => updateFormData('address2', value)}
                mode="outlined"
                style={styles.input}
                placeholder="Suite, Unit, Floor (optional)"
              />

              <View style={styles.addressRow}>
                <TextInput
                  theme={inputTheme}
                  label="City *"
                  value={formData.city}
                  onChangeText={(value) => updateFormData('city', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressCity]}
                  placeholder="City"
                />
                <TextInput
                  theme={inputTheme}
                  label="State *"
                  value={formData.state}
                  onChangeText={(value) => updateFormData('state', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressState]}
                  placeholder="TX"
                  maxLength={2}
                  autoCapitalize="characters"
                />
                <TextInput
                  theme={inputTheme}
                  label="Zip *"
                  value={formData.zipCode}
                  onChangeText={(value) => updateFormData('zipCode', value)}
                  mode="outlined"
                  style={[styles.input, styles.addressZip]}
                  placeholder="75001"
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </Card.Content>
          </Card>

          {/* Date and Time */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="calendar-clock" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Date & Time</Text>
              </View>

              <View style={styles.dateTimeSection}>
                <Text variant="bodyLarge" style={styles.fieldLabel}>Start</Text>
                <View style={styles.dateTimeRow}>
                  <Button mode="outlined" onPress={() => setShowStartDatePicker(true)} style={styles.dateButton} icon="calendar">
                    {startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Button>
                  <Button mode="outlined" onPress={() => setShowStartTimePicker(true)} style={styles.timeButton} icon="clock-outline">
                    {startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Button>
                </View>
                {showStartDatePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker value={startDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onStartDateChange} />
                    {Platform.OS === 'ios' && (
                      <Button mode="contained" onPress={() => setShowStartDatePicker(false)} style={styles.doneButton}>Done</Button>
                    )}
                  </View>
                )}
                {showStartTimePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker value={startDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onStartTimeChange} />
                    {Platform.OS === 'ios' && (
                      <Button mode="contained" onPress={() => setShowStartTimePicker(false)} style={styles.doneButton}>Done</Button>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.dateTimeSection}>
                <Text variant="bodyLarge" style={styles.fieldLabel}>End</Text>
                <View style={styles.dateTimeRow}>
                  <Button mode="outlined" onPress={() => setShowEndDatePicker(true)} style={styles.dateButton} icon="calendar">
                    {endDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Button>
                  <Button mode="outlined" onPress={() => setShowEndTimePicker(true)} style={styles.timeButton} icon="clock-outline">
                    {endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Button>
                </View>
                {showEndDatePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker value={endDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onEndDateChange} minimumDate={startDate} />
                    {Platform.OS === 'ios' && (
                      <Button mode="contained" onPress={() => setShowEndDatePicker(false)} style={styles.doneButton}>Done</Button>
                    )}
                  </View>
                )}
                {showEndTimePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker value={endDate} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onEndTimeChange} />
                    {Platform.OS === 'ios' && (
                      <Button mode="contained" onPress={() => setShowEndTimePicker(false)} style={styles.doneButton}>Done</Button>
                    )}
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* Additional Options */}
          <Card style={[styles.formCard, { backgroundColor: isDark ? theme.colors.elevation.level2 : theme.colors.surface }]} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="cog" size={20} iconColor={theme.colors.primary} />
                </View>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Additional Options</Text>
              </View>

              <TextInput
                theme={inputTheme}
                label="Max Attendees"
                value={formData.maxAttendees}
                onChangeText={(value) => updateFormData('maxAttendees', value)}
                mode="outlined"
                keyboardType="numeric"
                style={styles.input}
                placeholder="Unlimited"
                left={<TextInput.Icon icon="account-multiple" />}
              />

              <TextInput
                theme={inputTheme}
                label="Ticket Price"
                value={formData.ticketPrice}
                onChangeText={(value) => updateFormData('ticketPrice', value)}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="Free"
                left={<TextInput.Icon icon="currency-usd" />}
                disabled={!club?.stripeOnboardingComplete}
              />

              <TextInput
                theme={inputTheme}
                label="RallyCredits Awarded"
                value={formData.rallyCreditsAwarded}
                onChangeText={(value) => updateFormData('rallyCreditsAwarded', value)}
                mode="outlined"
                keyboardType="number-pad"
                style={styles.input}
                placeholder="0"
                left={<TextInput.Icon icon="star-circle" />}
              />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 16, marginTop: -8, marginBottom: 16 }}>
                Credits users earn for attending this event
              </Text>

              <View style={[styles.switchRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={styles.switchContent}>
                  <Text variant="bodyLarge" style={styles.switchLabel}>Public Event</Text>
                  <Text variant="bodySmall" style={styles.switchDescription}>Anyone can discover and join</Text>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text variant="bodyLarge" style={styles.switchLabel}>Require Waiver</Text>
                  <Text variant="bodySmall" style={styles.switchDescription}>Users must agree to terms before joining</Text>
                </View>
                <Switch value={hasWaiver} onValueChange={setHasWaiver} />
              </View>

              {hasWaiver && (
                <View style={styles.waiverSection}>
                  <View style={styles.waiverHeader}>
                    <IconButton icon="file-document-outline" size={20} iconColor={theme.colors.primary} />
                    <Text variant="bodyMedium" style={[styles.waiverHeaderText, { color: theme.colors.primary }]}>Waiver / Terms Text</Text>
                  </View>
                  <TextInput
                    theme={inputTheme}
                    value={waiverText}
                    onChangeText={setWaiverText}
                    mode="outlined"
                    multiline
                    numberOfLines={6}
                    style={styles.waiverInput}
                    placeholder="Enter the waiver or terms that attendees must agree to..."
                  />
                </View>
              )}
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
            contentStyle={styles.buttonContent}
          >
            Save Changes
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    padding: 16,
  },
  formCard: {
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
  },
  cardContent: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  coverImageContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImagePreview: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imagePlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addressCity: {
    flex: 3,
  },
  addressState: {
    flex: 1.5,
  },
  addressZip: {
    flex: 2,
  },
  descriptionInput: {
    minHeight: 150,
  },
  descriptionContent: {
    fontSize: 16,
    paddingTop: 12,
  },
  fieldLabel: {
    fontWeight: '600',
    marginBottom: 8,
  },
  dateTimeSection: {
    marginBottom: 20,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateButton: {
    flex: 1.3,
  },
  timeButton: {
    flex: 1,
  },
  pickerContainer: {
    marginTop: 16,
    overflow: 'hidden',
  },
  doneButton: {
    marginTop: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    marginTop: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontWeight: '600',
  },
  switchDescription: {
    marginTop: 2,
  },
  saveButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 12,
  },
  waiverSection: {
    marginTop: 16,
    paddingTop: 16,
  },
  waiverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  waiverHeaderText: {
    fontWeight: '600',
  },
  waiverInput: {
  },
});
