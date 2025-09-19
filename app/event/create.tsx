// app/event/create.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image } from 'react-native';
import { 
  Text, 
  TextInput, 
  Button, 
  Card,
  useTheme,
  Switch,
  Chip,
  IconButton,
  Divider,
  Menu,
  List
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createEvent, uploadImage, getClubs } from '../../lib/firebase';
import { useAuth } from '../_layout';
import type { Club } from '../../lib/firebase';

const EVENT_TAGS = [
  'Workshop', 'Meeting', 'Social', 'Competition', 'Conference',
  'Fundraiser', 'Volunteer', 'Networking', 'Performance', 'Game Night'
];

export default function CreateEventScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const clubId = params.clubId as string;
  
  const [loading, setLoading] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [showClubMenu, setShowClubMenu] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clubId: clubId || '',
    clubName: '',
    location: '',
    virtualLink: '',
    maxAttendees: '',
    ticketPrice: '',
    currency: 'USD',
  });
  
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isVirtual, setIsVirtual] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours later

  useEffect(() => {
    loadUserClubs();
  }, [user]);

  const loadUserClubs = async () => {
    if (!user) return;
    
    const result = await getClubs(user.uid);
    if (result.success) {
      setUserClubs(result.clubs);
      
      // If clubId is provided, find and set the club name
      if (clubId) {
        const selectedClub = result.clubs.find(club => club.id === clubId);
        if (selectedClub) {
          setFormData(prev => ({
            ...prev,
            clubId: selectedClub.id,
            clubName: selectedClub.name
          }));
        }
      }
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const selectClub = (club: Club) => {
    setFormData(prev => ({
      ...prev,
      clubId: club.id,
      clubName: club.name
    }));
    setShowClubMenu(false);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCoverImage(result.assets[0].uri);
      }
    } catch (error) {
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
    if (!formData.clubId) {
      Alert.alert('Error', 'Please select a club');
      return false;
    }
    if (!isVirtual && !formData.location.trim()) {
      Alert.alert('Error', 'Location is required for in-person events');
      return false;
    }
    if (isVirtual && !formData.virtualLink.trim()) {
      Alert.alert('Error', 'Virtual link is required for virtual events');
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
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create an event');
      return;
    }

    setLoading(true);
    try {
      let coverImageUrl: string | undefined;

      // Upload cover image if selected
      if (coverImage) {
        const imagePath = `events/covers/${Date.now()}_cover.jpg`;
        coverImageUrl = await uploadImage(coverImage, imagePath) || undefined;
      }

      const eventData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        clubId: formData.clubId,
        clubName: formData.clubName,
        createdBy: user.uid,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        location: isVirtual ? 'Virtual' : formData.location.trim(),
        isVirtual,
        virtualLink: isVirtual ? formData.virtualLink.trim() : undefined,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        coverImage: coverImageUrl,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        requiresApproval,
        isPublic,
        ticketPrice: formData.ticketPrice ? parseFloat(formData.ticketPrice) : undefined,
        currency: formData.ticketPrice ? formData.currency : undefined,
      };

      const result = await createEvent(eventData);
      if (result.success) {
        Alert.alert(
          'Success!', 
          'Your event has been created successfully!',
          [{ 
            text: 'OK', 
            onPress: () => router.push(`/event/${result.eventId}`)
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
    setShowStartDatePicker(false);
    if (selectedDate) {
      setStartDate(selectedDate);
      // Auto-update end date to be 2 hours later
      setEndDate(new Date(selectedDate.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const onStartTimeChange = (event: any, selectedTime?: Date) => {
    setShowStartTimePicker(false);
    if (selectedTime) {
      const newStartDate = new Date(startDate);
      newStartDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setStartDate(newStartDate);
      // Auto-update end time
      const newEndDate = new Date(newStartDate.getTime() + 2 * 60 * 60 * 1000);
      setEndDate(newEndDate);
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const onEndTimeChange = (event: any, selectedTime?: Date) => {
    setShowEndTimePicker(false);
    if (selectedTime) {
      const newEndDate = new Date(endDate);
      newEndDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setEndDate(newEndDate);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
            Create Event
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurface }]}>
            Plan something amazing for your community
          </Text>
        </View>

        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            {/* Cover Image */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Event Cover Image
            </Text>
            
            <View style={styles.imageSection}>
              <View style={styles.coverImageContainer}>
                {coverImage ? (
                  <Image source={{ uri: coverImage }} style={styles.coverImage} />
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text style={{ color: theme.colors.onSurfaceVariant }}>16:9 aspect ratio</Text>
                  </View>
                )}
                <IconButton
                  icon="camera"
                  mode="contained"
                  onPress={pickImage}
                  style={styles.imageButton}
                />
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Basic Information */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Event Details
            </Text>

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

            {/* Club Selection */}
            <Text variant="bodyMedium" style={styles.fieldLabel}>Select Club *</Text>
            <Menu
              visible={showClubMenu}
              onDismiss={() => setShowClubMenu(false)}
              anchor={
                <Button 
                  mode="outlined" 
                  onPress={() => setShowClubMenu(true)}
                  style={styles.clubSelector}
                  contentStyle={styles.clubSelectorContent}
                  icon="chevron-down"
                >
                  {formData.clubName || 'Select a club'}
                </Button>
              }
            >
              {userClubs.map((club) => (
                <Menu.Item
                  key={club.id}
                  onPress={() => selectClub(club)}
                  title={club.name}
                />
              ))}
            </Menu>

            <Divider style={styles.divider} />

            {/* Date and Time */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Date & Time
            </Text>

            <View style={styles.dateTimeSection}>
              <Text variant="bodyMedium" style={styles.fieldLabel}>Start Date & Time *</Text>
              <View style={styles.dateTimeRow}>
                <Button
                  mode="outlined"
                  onPress={() => setShowStartDatePicker(true)}
                  style={[styles.dateTimeButton, styles.dateButton]}
                >
                  {startDate.toLocaleDateString()}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => setShowStartTimePicker(true)}
                  style={[styles.dateTimeButton, styles.timeButton]}
                >
                  {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Button>
              </View>
            </View>

            <View style={styles.dateTimeSection}>
              <Text variant="bodyMedium" style={styles.fieldLabel}>End Date & Time *</Text>
              <View style={styles.dateTimeRow}>
                <Button
                  mode="outlined"
                  onPress={() => setShowEndDatePicker(true)}
                  style={[styles.dateTimeButton, styles.dateButton]}
                >
                  {endDate.toLocaleDateString()}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => setShowEndTimePicker(true)}
                  style={[styles.dateTimeButton, styles.timeButton]}
                >
                  {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Button>
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Location */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Location
            </Text>

            <View style={styles.switchContainer}>
              <View style={styles.switchContent}>
                <Text variant="bodyLarge">Virtual Event</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  This event will be held online
                </Text>
              </View>
              <Switch
                value={isVirtual}
                onValueChange={setIsVirtual}
              />
            </View>

            {isVirtual ? (
              <TextInput
                label="Virtual Link *"
                value={formData.virtualLink}
                onChangeText={(value) => updateFormData('virtualLink', value)}
                mode="outlined"
                style={styles.input}
                placeholder="e.g., Zoom, Google Meet, Discord link"
                left={<TextInput.Icon icon="video" />}
              />
            ) : (
              <TextInput
                label="Location *"
                value={formData.location}
                onChangeText={(value) => updateFormData('location', value)}
                mode="outlined"
                style={styles.input}
                placeholder="e.g., Student Center Room 201"
                left={<TextInput.Icon icon="map-marker" />}
              />
            )}

            <Divider style={styles.divider} />

            {/* Additional Options */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Additional Options
            </Text>

            <View style={styles.row}>
              <TextInput
                label="Max Attendees"
                value={formData.maxAttendees}
                onChangeText={(value) => updateFormData('maxAttendees', value)}
                mode="outlined"
                keyboardType="numeric"
                style={[styles.input, styles.halfInput]}
                placeholder="Leave empty for unlimited"
              />
              <TextInput
                label="Ticket Price"
                value={formData.ticketPrice}
                onChangeText={(value) => updateFormData('ticketPrice', value)}
                mode="outlined"
                keyboardType="decimal-pad"
                style={[styles.input, styles.halfInput]}
                placeholder="0.00"
                left={<TextInput.Icon icon="currency-usd" />}
              />
            </View>

            {/* Tags */}
            <Text variant="bodyMedium" style={styles.fieldLabel}>Event Tags</Text>
            <Text variant="bodySmall" style={[styles.tagsHint, { color: theme.colors.onSurfaceVariant }]}>
              Help people discover your event
            </Text>

            <View style={styles.tagsContainer}>
              {EVENT_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  selected={selectedTags.includes(tag)}
                  onPress={() => toggleTag(tag)}
                  style={styles.tagChip}
                  showSelectedOverlay
                >
                  {tag}
                </Chip>
              ))}
            </View>

            <Divider style={styles.divider} />

            {/* Privacy Settings */}
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Privacy & Approval
            </Text>

            <View style={styles.switchContainer}>
              <View style={styles.switchContent}>
                <Text variant="bodyLarge">Public Event</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Anyone can discover and join this event
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
              />
            </View>

            <View style={styles.switchContainer}>
              <View style={styles.switchContent}>
                <Text variant="bodyLarge">Requires Approval</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  You'll need to approve attendees manually
                </Text>
              </View>
              <Switch
                value={requiresApproval}
                onValueChange={setRequiresApproval}
              />
            </View>

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
          </Card.Content>
        </Card>

        {/* Date/Time Pickers */}
        {showStartDatePicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={onStartDateChange}
          />
        )}
        {showStartTimePicker && (
          <DateTimePicker
            value={startDate}
            mode="time"
            display="default"
            onChange={onStartTimeChange}
          />
        )}
        {showEndDatePicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            onChange={onEndDateChange}
          />
        )}
        {showEndTimePicker && (
          <DateTimePicker
            value={endDate}
            mode="time"
            display="default"
            onChange={onEndTimeChange}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
  },
  card: {
    elevation: 4,
  },
  cardContent: {
    padding: 24,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  imageSection: {
    marginBottom: 16,
  },
  coverImageContainer: {
    height: 120,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  imageButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  input: {
    marginBottom: 16,
  },
  halfInput: {
    flex: 0.48,
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: '500',
  },
  clubSelector: {
    marginBottom: 16,
    justifyContent: 'flex-start',
  },
  clubSelectorContent: {
    flexDirection: 'row-reverse',
  },
  dateTimeSection: {
    marginBottom: 16,
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateTimeButton: {
    flex: 0.48,
  },
  dateButton: {
    // Additional styling for date button if needed
  },
  timeButton: {
    // Additional styling for time button if needed
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  tagsHint: {
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  tagChip: {
    margin: 4,
  },
  divider: {
    marginVertical: 20,
  },
  createButton: {
    marginTop: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
