// app/event/create.tsx - Create Event Screen (Updated)
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    Image,
} from 'react-native';
import {
    TextInput,
    Button,
    Card,
    Title,
    useTheme,
    IconButton,
    HelperText,
    Chip,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router, useLocalSearchParams } from 'expo-router';
import {
    createEvent,
    getClub,
    uploadImage,
    generateImagePath,
    updateEvent,
    type Club,
    type Event
} from '../../lib/firebase/firestore-functions';
import { Timestamp } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface FormData {
    title: string;
    description: string;
    location: string;
    cost: string;
    maxParticipants: string;
    category: 'tournament' | 'training' | 'championship' | 'social';
    date: Date;
    time: Date;
}

interface FormErrors {
    title?: string;
    description?: string;
    location?: string;
    cost?: string;
    maxParticipants?: string;
    date?: string;
}

export default function CreateEventScreen() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const { clubId } = useLocalSearchParams<{ clubId: string }>();
    const [loading, setLoading] = useState(false);
    const [club, setClub] = useState<Club | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [imageUri, setImageUri] = useState<string | null>(null);
    
    // Form state
    const [formData, setFormData] = useState<FormData>({
        title: '',
        description: '',
        location: '',
        cost: '0',
        maxParticipants: '',
        category: 'tournament',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow by default
        time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    });
    
    const [errors, setErrors] = useState<FormErrors>({});

    // Load club data
    useEffect(() => {
        const loadClub = async () => {
            if (!clubId) {
                Alert.alert('Error', 'Club ID is required to create an event.');
                router.back();
                return;
            }

            try {
                const clubData = await getClub(clubId);
                if (!clubData) {
                    Alert.alert('Error', 'Club not found.');
                    router.back();
                    return;
                }
                setClub(clubData);
            } catch (error) {
                console.error('Error loading club:', error);
                Alert.alert('Error', 'Failed to load club data.');
                router.back();
            }
        };

        loadClub();
    }, [clubId]);

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.title.trim()) {
            newErrors.title = 'Event title is required';
        } else if (formData.title.length < 3) {
            newErrors.title = 'Title must be at least 3 characters';
        } else if (formData.title.length > 100) {
            newErrors.title = 'Title must be less than 100 characters';
        }

        if (!formData.location.trim()) {
            newErrors.location = 'Location is required';
        } else if (formData.location.length > 200) {
            newErrors.location = 'Location must be less than 200 characters';
        }

        if (formData.description && formData.description.length > 1000) {
            newErrors.description = 'Description must be less than 1000 characters';
        }

        // Validate cost (must be a valid number >= 0)
        const cost = parseFloat(formData.cost);
        if (isNaN(cost) || cost < 0) {
            newErrors.cost = 'Cost must be a valid number (0 or greater)';
        }

        // Validate max participants (optional, but if provided must be > 0)
        if (formData.maxParticipants.trim()) {
            const maxParticipants = parseInt(formData.maxParticipants);
            if (isNaN(maxParticipants) || maxParticipants <= 0) {
                newErrors.maxParticipants = 'Max participants must be a valid number greater than 0';
            }
        }

        // Validate date (must be in the future)
        const eventDateTime = new Date(formData.date);
        eventDateTime.setHours(formData.time.getHours(), formData.time.getMinutes(), 0, 0);
        
        if (eventDateTime <= new Date()) {
            newErrors.date = 'Event date and time must be in the future';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Image picker function
    const pickImage = async () => {
        try {
            // Request permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant photo library permission to select images.');
                return;
            }

            // Launch image picker
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                
                // Resize image to optimize storage
                const manipResult = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [
                        {
                            resize: {
                                width: 800,
                                height: 450,
                            },
                        },
                    ],
                    {
                        compress: 0.8,
                        format: ImageManipulator.SaveFormat.JPEG,
                    }
                );

                setImageUri(manipResult.uri);
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'Failed to select image. Please try again.');
        }
    };

    // Handle form submission
    const handleSubmit = async () => {
        if (!user || !club) {
            Alert.alert('Error', 'Authentication error. Please try again.');
            return;
        }

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {
            // Combine date and time
            const eventDateTime = new Date(formData.date);
            eventDateTime.setHours(formData.time.getHours(), formData.time.getMinutes(), 0, 0);

            // Prepare event data
            const eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = {
                title: formData.title.trim(),
                clubId: club.id,
                clubName: club.clubName,
                date: Timestamp.fromDate(eventDateTime),
                location: formData.location.trim(),
                usersJoined: [], // Empty array initially
                cost: Math.round(parseFloat(formData.cost) * 100), // Convert to cents
                description: formData.description.trim(),
                maxParticipants: formData.maxParticipants.trim() ? parseInt(formData.maxParticipants) : undefined,
                category: formData.category,
                createdBy: user.uid,
            };

            console.log('Creating event with data:', eventData);

            // Create the event first to get the ID
            const eventId = await createEvent(eventData);
            console.log('Event created successfully with ID:', eventId);

            // Upload image if selected
            if (imageUri) {
                try {
                    console.log('Uploading event image...');
                    const imagePath = generateImagePath('event-image', eventId, 'event.jpg');
                    const imageUrl = await uploadImage(imageUri, imagePath);
                    
                    // Update event with image URL
                    await updateEvent(eventId, { eventImage: imageUrl });
                    console.log('Event image uploaded successfully:', imageUrl);
                } catch (error) {
                    console.warn('Failed to upload event image:', error);
                    // Continue without image
                }
            }

            Alert.alert(
                'Success!',
                'Your event has been created successfully.',
                [
                    {
                        text: 'View Event',
                        onPress: () => router.replace(`/event/${eventId}`),
                    },
                    {
                        text: 'Back to Club',
                        onPress: () => router.replace(`/club/${club.id}`),
                        style: 'cancel',
                    },
                ]
            );
        } catch (error) {
            console.error('Error creating event:', error);
            Alert.alert('Error', 'Failed to create event. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'tournament': return colors.primary;
            case 'training': return '#4CAF50';
            case 'championship': return '#FF9800';
            case 'social': return '#9C27B0';
            default: return colors.outline;
        }
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setFormData({ ...formData, date: selectedDate });
            if (errors.date) setErrors({ ...errors, date: undefined });
        }
    };

    const onTimeChange = (event: any, selectedTime?: Date) => {
        setShowTimePicker(false);
        if (selectedTime) {
            setFormData({ ...formData, time: selectedTime });
            if (errors.date) setErrors({ ...errors, date: undefined });
        }
    };

    if (!club) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                    name="loading"
                    size={64}
                    color={colors.onSurfaceVariant}
                />
                <Text style={[styles.loadingText, { color: colors.onSurfaceVariant }]}>
                    Loading...
                </Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <View style={styles.headerContent}>
                    <IconButton
                        icon="arrow-left"
                        size={24}
                        onPress={() => router.back()}
                        iconColor={colors.onSurface}
                    />
                    <Title style={[styles.headerTitle, { color: colors.onSurface }]}>
                        Create Event
                    </Title>
                    <View style={{ width: 40 }} />
                </View>
                <Text style={[styles.clubName, { color: colors.onSurfaceVariant }]}>
                    For {club.clubName}
                </Text>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Event Image Section */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Event Image (Optional)
                        </Title>
                        <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>
                            Add an image to make your event stand out
                        </Text>

                        <TouchableOpacity
                            style={[styles.imageUpload, { borderColor: colors.outline }]}
                            onPress={pickImage}
                        >
                            {imageUri ? (
                                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                            ) : (
                                <View style={styles.imagePlaceholder}>
                                    <MaterialCommunityIcons
                                        name="image-plus"
                                        size={32}
                                        color={colors.onSurfaceVariant}
                                    />
                                    <Text style={[styles.imagePlaceholderText, { color: colors.onSurfaceVariant }]}>
                                        Add Event Image (16:9)
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        
                        {imageUri && (
                            <Button
                                mode="text"
                                onPress={() => setImageUri(null)}
                                style={styles.clearButton}
                                textColor={colors.error}
                            >
                                Remove Image
                            </Button>
                        )}
                    </Card.Content>
                </Card>

                {/* Basic Information */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Event Information
                        </Title>

                        {/* Event Title */}
                        <TextInput
                            label="Event Title"
                            value={formData.title}
                            onChangeText={(text) => {
                                setFormData({ ...formData, title: text });
                                if (errors.title) setErrors({ ...errors, title: undefined });
                            }}
                            mode="outlined"
                            style={styles.input}
                            error={!!errors.title}
                            maxLength={100}
                        />
                        <HelperText type="error" visible={!!errors.title}>
                            {errors.title}
                        </HelperText>
                        <HelperText type="info">
                            {formData.title.length}/100 characters
                        </HelperText>

                        {/* Location */}
                        <TextInput
                            label="Location"
                            value={formData.location}
                            onChangeText={(text) => {
                                setFormData({ ...formData, location: text });
                                if (errors.location) setErrors({ ...errors, location: undefined });
                            }}
                            mode="outlined"
                            style={styles.input}
                            error={!!errors.location}
                            maxLength={200}
                            placeholder="Where will this event take place?"
                        />
                        <HelperText type="error" visible={!!errors.location}>
                            {errors.location}
                        </HelperText>
                        <HelperText type="info">
                            {formData.location.length}/200 characters
                        </HelperText>

                        {/* Description */}
                        <TextInput
                            label="Description (Optional)"
                            value={formData.description}
                            onChangeText={(text) => {
                                setFormData({ ...formData, description: text });
                                if (errors.description) setErrors({ ...errors, description: undefined });
                            }}
                            mode="outlined"
                            multiline
                            numberOfLines={4}
                            style={styles.textArea}
                            error={!!errors.description}
                            maxLength={1000}
                            placeholder="Tell participants what this event is about..."
                        />
                        <HelperText type="error" visible={!!errors.description}>
                            {errors.description}
                        </HelperText>
                        <HelperText type="info">
                            {formData.description.length}/1000 characters
                        </HelperText>
                    </Card.Content>
                </Card>

                {/* Event Category */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Event Category
                        </Title>
                        
                        <View style={styles.categoryGrid}>
                            {(['tournament', 'training', 'championship', 'social'] as const).map((category) => (
                                <Chip
                                    key={category}
                                    selected={formData.category === category}
                                    onPress={() => setFormData({ ...formData, category })}
                                    style={[
                                        styles.categoryChip,
                                        formData.category === category && {
                                            backgroundColor: getCategoryColor(category) + '20',
                                        }
                                    ]}
                                    textStyle={{
                                        color: formData.category === category 
                                            ? getCategoryColor(category) 
                                            : colors.onSurfaceVariant
                                    }}
                                    showSelectedOverlay
                                >
                                    {category.charAt(0).toUpperCase() + category.slice(1)}
                                </Chip>
                            ))}
                        </View>
                    </Card.Content>
                </Card>

                {/* Date and Time */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Date & Time
                        </Title>

                        <View style={styles.dateTimeRow}>
                            <View style={styles.dateTimeItem}>
                                <Text style={[styles.dateTimeLabel, { color: colors.onSurface }]}>
                                    Date
                                </Text>
                                <Button
                                    mode="outlined"
                                    onPress={() => setShowDatePicker(true)}
                                    icon="calendar"
                                    style={styles.dateTimeButton}
                                    contentStyle={styles.dateTimeButtonContent}
                                >
                                    {formatDate(formData.date)}
                                </Button>
                            </View>

                            <View style={styles.dateTimeItem}>
                                <Text style={[styles.dateTimeLabel, { color: colors.onSurface }]}>
                                    Time
                                </Text>
                                <Button
                                    mode="outlined"
                                    onPress={() => setShowTimePicker(true)}
                                    icon="clock"
                                    style={styles.dateTimeButton}
                                    contentStyle={styles.dateTimeButtonContent}
                                >
                                    {formatTime(formData.time)}
                                </Button>
                            </View>
                        </View>

                        <HelperText type="error" visible={!!errors.date}>
                            {errors.date}
                        </HelperText>

                        {/* Date Picker */}
                        {showDatePicker && (
                            <DateTimePicker
                                value={formData.date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                minimumDate={new Date()}
                                onChange={onDateChange}
                            />
                        )}

                        {/* Time Picker */}
                        {showTimePicker && (
                            <DateTimePicker
                                value={formData.time}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={onTimeChange}
                            />
                        )}
                    </Card.Content>
                </Card>

                {/* Event Settings */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Event Settings
                        </Title>

                        {/* Cost */}
                        <TextInput
                            label="Cost ($)"
                            value={formData.cost}
                            onChangeText={(text) => {
                                setFormData({ ...formData, cost: text });
                                if (errors.cost) setErrors({ ...errors, cost: undefined });
                            }}
                            mode="outlined"
                            style={styles.input}
                            error={!!errors.cost}
                            keyboardType="numeric"
                            placeholder="0.00"
                            left={<TextInput.Icon icon="currency-usd" />}
                        />
                        <HelperText type="error" visible={!!errors.cost}>
                            {errors.cost}
                        </HelperText>
                        <HelperText type="info">
                            Set to 0 for free events
                        </HelperText>

                        {/* Max Participants */}
                        <TextInput
                            label="Max Participants (Optional)"
                            value={formData.maxParticipants}
                            onChangeText={(text) => {
                                setFormData({ ...formData, maxParticipants: text });
                                if (errors.maxParticipants) setErrors({ ...errors, maxParticipants: undefined });
                            }}
                            mode="outlined"
                            style={styles.input}
                            error={!!errors.maxParticipants}
                            keyboardType="numeric"
                            placeholder="Leave empty for unlimited"
                            left={<TextInput.Icon icon="account-multiple" />}
                        />
                        <HelperText type="error" visible={!!errors.maxParticipants}>
                            {errors.maxParticipants}
                        </HelperText>
                        <HelperText type="info">
                            Leave empty for no limit
                        </HelperText>
                    </Card.Content>
                </Card>

                {/* Submit Button */}
                <View style={styles.buttonContainer}>
                    <Button
                        mode="contained"
                        onPress={handleSubmit}
                        loading={loading}
                        disabled={loading}
                        style={styles.submitButton}
                        icon="calendar-plus"
                    >
                        Create Event
                    </Button>
                </View>

                <View style={{ height: 50 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    header: {
        paddingTop: 50,
        paddingBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    clubName: {
        textAlign: 'center',
        fontSize: 14,
        paddingHorizontal: 16,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    card: {
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        marginBottom: 16,
        lineHeight: 20,
    },
    imageUpload: {
        width: '100%',
        height: 200,
        borderRadius: 8,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    imagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    imagePlaceholderText: {
        fontSize: 14,
        fontWeight: '500',
    },
    imagePreview: {
        width: '100%',
        height: 196,
        borderRadius: 6,
    },
    clearButton: {
        alignSelf: 'center',
    },
    input: {
        marginBottom: 4,
    },
    textArea: {
        marginBottom: 4,
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    categoryChip: {
        minWidth: 100,
    },
    dateTimeRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    dateTimeItem: {
        flex: 1,
    },
    dateTimeLabel: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    dateTimeButton: {
        justifyContent: 'flex-start',
        paddingVertical: 8,
    },
    dateTimeButtonContent: {
        justifyContent: 'flex-start',
    },
    buttonContainer: {
        marginTop: 24,
    },
    submitButton: {
        paddingVertical: 8,
    },
});
