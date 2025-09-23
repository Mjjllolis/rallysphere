// app/event/create.tsx
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Image, Dimensions } from 'react-native';
import { 
  Text, 
  TextInput, 
  Button, 
  Card,
  useTheme,
  Switch,
  IconButton,
  Divider,
  Surface
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createEvent, uploadImage, getClub } from '../../lib/firebase';
import { useAuth } from '../_layout';
import { LinearGradient } from 'expo-linear-gradient';
import type { Club } from '../../lib/firebase';

const { height } = Dimensions.get('window');

export default function CreateEventScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const clubId = params.clubId as string;
  
  const [loading, setLoading] = useState(false);
  const [club, setClub] = useState<Club | null>(null);
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
  });
  
  const [isPublic, setIsPublic] = useState(true);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours later

  useEffect(() => {
    if (clubId) {
      loadClubData();
    }
  }, [clubId]);

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
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        coverImage: coverImageUrl,
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
      setEndDate(new Date(selectedDate.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const onStartTimeChange = (event: any, selectedTime?: Date) => {
    setShowStartTimePicker(false);
    if (selectedTime) {
      const newStartDate = new Date(startDate);
      newStartDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setStartDate(newStartDate);
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
  <SafeAreaView style={[styles.container, { backgroundColor: 'white' }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header - compact style */}
        <LinearGradient
          colors={['#2C5282', '#2A4B7C']}
          style={styles.heroHeader}
        >
          <IconButton 
            icon="arrow-left" 
            size={24}
            onPress={() => router.back()}
            style={styles.backButton}
            iconColor="white"
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Create Event</Text>
          </View>
          
          {/* White Rounded Bottom - bevel effect */}
          <View style={[styles.headerBottom, { backgroundColor: 'white' }]} />
        </LinearGradient>

        <View style={styles.content}>
          {/* Cover Image Section */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Event Cover Image
              </Text>
              
              <View style={styles.imageSection}>
                <Surface style={styles.coverImageContainer} elevation={1}>
                  {coverImage ? (
                    <Image source={{ uri: coverImage }} style={styles.coverImage} />
                  ) : (
                    <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <IconButton icon="image" size={32} iconColor={theme.colors.onSurfaceVariant} />
                      <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>16:9 aspect ratio</Text>
                    </View>
                  )}
                  <Surface style={styles.imageButtonContainer} elevation={3}>
                    <IconButton
                      icon="camera"
                      mode="contained"
                      onPress={pickImage}
                      size={20}
                    />
                  </Surface>
                </Surface>
              </View>
            </Card.Content>
          </Card>

          {/* Basic Information */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
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
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
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
            </Card.Content>
          </Card>

          {/* Additional Options */}
          <Card style={styles.formCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <Text variant="headlineSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Additional Options
              </Text>

              <View style={styles.row}>
                <View style={styles.halfInputContainer}>
                  <TextInput
                    label="Max Attendees"
                    value={formData.maxAttendees}
                    onChangeText={(value) => updateFormData('maxAttendees', value)}
                    mode="outlined"
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="Leave empty for unlimited"
                  />
                </View>
                <View style={styles.halfInputContainer}>
                  <TextInput
                    label="Ticket Price"
                    value={formData.ticketPrice}
                    onChangeText={(value) => updateFormData('ticketPrice', value)}
                    mode="outlined"
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="0.00"
                    left={<TextInput.Icon icon="currency-usd" />}
                  />
                </View>
              </View>

              {/* Privacy Settings */}
              <Divider style={styles.divider} />
              
              <Text variant="titleMedium" style={styles.subsectionTitle}>
                Privacy Settings
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
        </View>

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
  heroHeader: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    position: 'relative',
    overflow: 'hidden',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 50,
    zIndex: 10,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 20,
  },
  formCard: {
    marginBottom: 20,
    borderRadius: 16,
    elevation: 2,
  },
  cardContent: {
    padding: 20,
  },
  sectionTitle: {
    marginBottom: 24,
    fontWeight: 'bold',
  },
  subsectionTitle: {
    marginBottom: 16,
    fontWeight: 'bold',
  },
  imageSection: {
    marginBottom: 16,
  },
  coverImageContainer: {
    height: 140,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  imageButtonContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  halfInputContainer: {
    flex: 1,
  },
  input: {
    marginBottom: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: '600',
  },
  dateTimeSection: {
    marginBottom: 16,
  },
  dateTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
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
    marginBottom: 24,
    paddingVertical: 8,
  },
  switchContent: {
    flex: 1,
    marginRight: 16,
  },
  divider: {
    marginVertical: 24,
  },
  createButton: {
    marginTop: 16,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 12,
  },
});
