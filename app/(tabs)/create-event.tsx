// app/event/create.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image, Dimensions, TouchableOpacity } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  Switch,
  IconButton,
  Divider,
  Surface,
  Menu
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createEvent, uploadImage, getClub, getClubs } from '../../lib/firebase';
import { useAuth } from '../_layout';
import { LinearGradient } from 'expo-linear-gradient';
import BackButton from '../../components/BackButton';
import type { Club } from '../../lib/firebase';

const { height } = Dimensions.get('window');

export default function CreateEventScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const initialClubId = params.clubId as string;

  const [loading, setLoading] = useState(false);
  const [clubId, setClubId] = useState<string>(initialClubId || '');
  const [club, setClub] = useState<Club | null>(null);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [clubMenuVisible, setClubMenuVisible] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
    rallyCreditsAwarded: '',
  });
  
  const [isPublic, setIsPublic] = useState(true);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours later

  useEffect(() => {
    loadAvailableClubs();
  }, []);

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

  const loadAvailableClubs = async () => {
    if (!user) return;
    const result = await getClubs();
    if (result.success) {
      // Filter clubs where user is admin or member
      const userClubs = result.clubs.filter(c =>
        c.admins.includes(user.uid) || c.members.includes(user.uid)
      );
      setAvailableClubs(userClubs);

      // If no club selected and user has clubs, select first one
      if (!clubId && userClubs.length > 0) {
        setClubId(userClubs[0].id);
      }
    }
  };

  const loadClubData = async () => {
    if (!clubId) return;

    const result = await getClub(clubId);
    if (result.success && result.club) {
      setClub(result.club);
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
      console.error('Image picker error:', error);
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
    if (!clubId || !club) {
      Alert.alert('Error', 'Club information is missing');
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
    if (!user || !club) {
      Alert.alert('Error', 'You must be logged in to create an event');
      return;
    }

    setLoading(true);
    try {
      let coverImageUrl: string | undefined;

      if (coverImage) {
        const imagePath = `events/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, imagePath) || undefined;
      }

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        clubId: clubId,
        clubName: club.name,
        createdBy: user.uid,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        location: formData.location.trim(),
        isVirtual: false,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        coverImage: coverImageUrl,
        isPublic,
        requiresApproval: false,
        ticketPrice: formData.ticketPrice ? parseFloat(formData.ticketPrice) : undefined,
        currency: formData.ticketPrice ? formData.currency : undefined,
        rallyCreditsAwarded: formData.rallyCreditsAwarded ? parseInt(formData.rallyCreditsAwarded) : undefined,
      };

      const result = await createEvent(eventData);
      if (result.success) {
        Alert.alert(
          'Success!',
          'Your event has been created successfully!',
          [{
            text: 'OK',
            onPress: () => router.push(`/(tabs)/event-detail?id=${result.eventId}`)
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

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowStartDatePicker(false);
      return;
    }
    if (selectedDate) {
      const newStartDate = new Date(selectedDate);
      newStartDate.setHours(startDate.getHours(), startDate.getMinutes());
      setStartDate(newStartDate);

      // If end date is before new start date, adjust it
      if (endDate <= newStartDate) {
        const newEndDate = new Date(newStartDate.getTime() + 2 * 60 * 60 * 1000);
        setEndDate(newEndDate);
      }
    }
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
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

      // If end date is before new start date, adjust it
      if (endDate <= newStartDate) {
        const newEndDate = new Date(newStartDate.getTime() + 2 * 60 * 60 * 1000);
        setEndDate(newEndDate);
      }
    }
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowEndDatePicker(false);
      return;
    }
    if (selectedDate) {
      const newEndDate = new Date(selectedDate);
      newEndDate.setHours(endDate.getHours(), endDate.getMinutes());

      // Validate that end date is after start date
      if (newEndDate <= startDate) {
        Alert.alert('Invalid Date', 'End date must be after start date');
        setShowEndDatePicker(false);
        return;
      }

      setEndDate(newEndDate);
    }
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
  };

  const onEndTimeChange = (event: any, selectedTime?: Date) => {
    if (event.type === 'dismissed') {
      setShowEndTimePicker(false);
      return;
    }
    if (selectedTime) {
      const newEndDate = new Date(endDate);
      newEndDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());

      // Validate that end date/time is after start date/time
      if (newEndDate <= startDate) {
        Alert.alert('Invalid Time', 'End time must be after start time');
        setShowEndTimePicker(false);
        return;
      }

      setEndDate(newEndDate);
    }
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Header with Gradient */}
        <View>
          <LinearGradient
            colors={['#1B365D', '#2B4A73', '#3A5F8F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SafeAreaView edges={['top']}>
              <View style={styles.headerContent}>
                <BackButton color="white" backgroundColor="rgba(255,255,255,0.2)" />
                <Text style={styles.headerTitle}>Create Event</Text>
                <View style={styles.placeholder} />
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        <View style={styles.content}>
          {/* Club Selection */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="account-group" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Select Club</Text>
              </View>

              <Menu
                visible={clubMenuVisible}
                onDismiss={() => setClubMenuVisible(false)}
                anchor={
                  <TouchableOpacity
                    style={styles.clubSelector}
                    onPress={() => setClubMenuVisible(true)}
                  >
                    <Text style={styles.clubSelectorText}>
                      {club ? club.name : 'Select a club...'}
                    </Text>
                    <IconButton icon="chevron-down" size={20} />
                  </TouchableOpacity>
                }
              >
                {availableClubs.map((c) => (
                  <Menu.Item
                    key={c.id}
                    onPress={() => {
                      setClubId(c.id);
                      setClubMenuVisible(false);
                    }}
                    title={c.name}
                  />
                ))}
              </Menu>
            </Card.Content>
          </Card>

          {/* Cover Image Section */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="image" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Cover Image</Text>
              </View>

              <TouchableOpacity onPress={pickImage} activeOpacity={0.7}>
                <LinearGradient
                  colors={['#E1E7F1', '#D4DCE8']}
                  style={styles.coverImageContainer}
                >
                  {coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <IconButton icon="camera-plus" size={40} iconColor="#1B365D" />
                      <Text style={styles.imagePlaceholderText}>Tap to add cover image</Text>
                      <Text style={styles.imageHint}>16:9 recommended</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Card.Content>
          </Card>

          {/* Basic Information */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="information" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Event Details</Text>
              </View>

              <TextInput
                label="Event Title *"
                value={formData.title}
                onChangeText={(value) => updateFormData('title', value)}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label="Description *"
                value={formData.description}
                onChangeText={(value) => updateFormData('description', value)}
                mode="outlined"
                multiline
                numberOfLines={4}
                style={styles.input}
                placeholder="What's this event about? What should attendees expect?"
              />

              <TextInput
                label="Location *"
                value={formData.location}
                onChangeText={(value) => updateFormData('location', value)}
                mode="outlined"
                style={styles.input}
                placeholder="e.g., Student Center Room 201"
                left={<TextInput.Icon icon="map-marker" />}
              />
            </Card.Content>
          </Card>

          {/* Date and Time */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="calendar-clock" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Date & Time</Text>
              </View>

              <View style={styles.dateTimeSection}>
                <Text variant="bodyLarge" style={styles.fieldLabel}>Start</Text>
                <View style={styles.dateTimeRow}>
                  <Button
                    mode="outlined"
                    onPress={() => setShowStartDatePicker(true)}
                    style={styles.dateButton}
                    icon="calendar"
                  >
                    {startDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => setShowStartTimePicker(true)}
                    style={styles.timeButton}
                    icon="clock-outline"
                  >
                    {startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Button>
                </View>
                {showStartDatePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker
                      value={startDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onStartDateChange}
                      minimumDate={new Date()}
                    />
                    {Platform.OS === 'ios' && (
                      <Button
                        mode="contained"
                        onPress={() => setShowStartDatePicker(false)}
                        style={styles.doneButton}
                      >
                        Done
                      </Button>
                    )}
                  </View>
                )}
                {showStartTimePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker
                      value={startDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onStartTimeChange}
                    />
                    {Platform.OS === 'ios' && (
                      <Button
                        mode="contained"
                        onPress={() => setShowStartTimePicker(false)}
                        style={styles.doneButton}
                      >
                        Done
                      </Button>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.dateTimeSection}>
                <Text variant="bodyLarge" style={styles.fieldLabel}>End</Text>
                <View style={styles.dateTimeRow}>
                  <Button
                    mode="outlined"
                    onPress={() => setShowEndDatePicker(true)}
                    style={styles.dateButton}
                    icon="calendar"
                  >
                    {endDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => setShowEndTimePicker(true)}
                    style={styles.timeButton}
                    icon="clock-outline"
                  >
                    {endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Button>
                </View>
                {showEndDatePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onEndDateChange}
                      minimumDate={startDate}
                    />
                    {Platform.OS === 'ios' && (
                      <Button
                        mode="contained"
                        onPress={() => setShowEndDatePicker(false)}
                        style={styles.doneButton}
                      >
                        Done
                      </Button>
                    )}
                  </View>
                )}
                {showEndTimePicker && (
                  <View style={styles.pickerContainer}>
                    <DateTimePicker
                      value={endDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onEndTimeChange}
                    />
                    {Platform.OS === 'ios' && (
                      <Button
                        mode="contained"
                        onPress={() => setShowEndTimePicker(false)}
                        style={styles.doneButton}
                      >
                        Done
                      </Button>
                    )}
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* Additional Options */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <View style={styles.iconBadge}>
                  <IconButton icon="cog" size={20} iconColor="#1B365D" />
                </View>
                <Text variant="titleLarge" style={styles.sectionTitle}>Additional Options</Text>
              </View>

              <TextInput
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
              {!club?.stripeOnboardingComplete && (
                <View style={styles.warningBox}>
                  <IconButton icon="alert-circle" size={20} iconColor="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ color: '#F59E0B', fontWeight: 'bold' }}>
                      Connect Stripe to accept payments
                    </Text>
                    <Text variant="bodySmall" style={{ color: '#92400E', marginTop: 4 }}>
                      Set up payouts in club settings to create paid events
                    </Text>
                  </View>
                </View>
              )}

              <TextInput
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

              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text variant="bodyLarge" style={styles.switchLabel}>Public Event</Text>
                  <Text variant="bodySmall" style={styles.switchDescription}>
                    Anyone can discover and join
                  </Text>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} />
              </View>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={handleCreateEvent}
            loading={loading}
            disabled={loading}
            style={styles.createButton}
            contentStyle={styles.buttonContent}
          >
            Create Event
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    backgroundColor: 'white',
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
    backgroundColor: '#E1E7F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
    color: '#1B365D',
  },
  clubSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 56,
  },
  clubSelectorText: {
    fontSize: 16,
    flex: 1,
  },
  coverImageContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
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
    color: '#1B365D',
    fontWeight: '600',
    marginTop: 8,
  },
  imageHint: {
    fontSize: 12,
    color: '#1B365D',
    opacity: 0.7,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInputContainer: {
    flex: 1,
  },
  input: {
    marginBottom: 12,
    borderRadius: 12,
  },
  fieldLabel: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#1B365D',
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
    backgroundColor: '#1B365D',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E1E7F1',
    marginTop: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontWeight: '600',
    color: '#1B365D',
  },
  switchDescription: {
    color: '#666',
    marginTop: 2,
  },
  createButton: {
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: '#1B365D',
  },
  buttonContent: {
    paddingVertical: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginTop: -8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
});
