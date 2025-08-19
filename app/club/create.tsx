// app/club/create.tsx - Create Club Screen (Simplified)
import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Image
} from 'react-native';
import {
    TextInput,
    Button,
    Card,
    Title,
    useTheme,
    IconButton,
    HelperText,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { router } from 'expo-router';
import {
    createClub,
    updateClub,
    uploadImage,
    generateImagePath,
    type Club
} from '../../lib/firebase';

// You'll need to install these packages:
// npm install expo-image-picker expo-image-manipulator
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface FormData {
    clubName: string;
    description: string;
}

interface FormErrors {
    clubName?: string;
    description?: string;
}

export default function CreateClubScreen() {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [logoUri, setLogoUri] = useState<string | null>(null);
    const [headerUri, setHeaderUri] = useState<string | null>(null);
    
    // Form state
    const [formData, setFormData] = useState<FormData>({
        clubName: '',
        description: '',
    });
    
    const [errors, setErrors] = useState<FormErrors>({});

    // Validation
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.clubName.trim()) {
            newErrors.clubName = 'Club name is required';
        } else if (formData.clubName.length < 3) {
            newErrors.clubName = 'Club name must be at least 3 characters';
        } else if (formData.clubName.length > 50) {
            newErrors.clubName = 'Club name must be less than 50 characters';
        }

        if (!formData.description.trim()) {
            newErrors.description = 'Description is required';
        } else if (formData.description.length < 10) {
            newErrors.description = 'Description must be at least 10 characters';
        } else if (formData.description.length > 500) {
            newErrors.description = 'Description must be less than 500 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Image picker function
    const pickImage = async (type: 'logo' | 'header') => {
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
                aspect: type === 'logo' ? [1, 1] : [16, 9],
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
                                width: type === 'logo' ? 400 : 800,
                                height: type === 'logo' ? 400 : 450,
                            },
                        },
                    ],
                    {
                        compress: 0.8,
                        format: ImageManipulator.SaveFormat.JPEG,
                    }
                );

                if (type === 'logo') {
                    setLogoUri(manipResult.uri);
                } else {
                    setHeaderUri(manipResult.uri);
                }
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'Failed to select image. Please try again.');
        }
    };

    // Handle form submission
    const handleSubmit = async () => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to create a club.');
            return;
        }

        console.log('🔍 Debug - User info:', {
            uid: user.uid,
            email: user.email,
            isAuthenticated: !!user
        });

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {
            // Prepare club data (without sport field)
            const clubData: Omit<Club, 'id' | 'createdAt' | 'updatedAt'> = {
                clubName: formData.clubName.trim(),
                clubOwner: user.uid,
                clubAdmins: [],
                clubMembers: [user.uid], // Owner is automatically a member
                sport: '', // Empty sport field since we removed it
                description: formData.description.trim(),
            };

            console.log('🔍 Debug - Club data to create:', clubData);

            // Create the club first to get the ID
            const clubId = await createClub(clubData);
            console.log('✅ Club created successfully with ID:', clubId);

            // Upload images if they exist and update the club
            const imageUpdates: Partial<Club> = {};
            
            if (logoUri) {
                try {
                    console.log('🖼️ Uploading logo...');
                    const logoPath = generateImagePath('club-logo', clubId, 'logo.jpg');
                    console.log('Logo path:', logoPath);
                    const logoUrl = await uploadImage(logoUri, logoPath);
                    imageUpdates.clubLogo = logoUrl;
                    console.log('✅ Logo uploaded successfully:', logoUrl);
                } catch (error) {
                    console.warn('Failed to upload logo:', error);
                    // Continue without logo
                }
            }

            if (headerUri) {
                try {
                    console.log('🎨 Uploading header...');
                    const headerPath = generateImagePath('club-header', clubId, 'header.jpg');
                    console.log('Header path:', headerPath);
                    const headerUrl = await uploadImage(headerUri, headerPath);
                    imageUpdates.clubHeader = headerUrl;
                    console.log('✅ Header uploaded successfully:', headerUrl);
                } catch (error) {
                    console.warn('Failed to upload header:', error);
                    // Continue without header
                }
            }

            // Update club with image URLs if any were uploaded
            if (Object.keys(imageUpdates).length > 0) {
                await updateClub(clubId, imageUpdates);
            }

            Alert.alert(
                'Success!',
                'Your club has been created successfully.',
                [
                    {
                        text: 'View Club',
                        onPress: () => router.replace(`/club/${clubId}`),
                    },
                ]
            );
        } catch (error) {
            console.error('Error creating club:', error);
            Alert.alert('Error', 'Failed to create club. Please try again.');
        } finally {
            setLoading(false);
        }
    };

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
                        Create Club
                    </Title>
                    <View style={{ width: 40 }} />
                </View>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Club Images Section */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Club Images
                        </Title>
                        <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>
                            Add a logo and header image to make your club stand out
                        </Text>

                        {/* Logo Upload */}
                        <View style={styles.imageSection}>
                            <Text style={[styles.imageLabel, { color: colors.onSurface }]}>
                                Club Logo
                            </Text>
                            <TouchableOpacity
                                style={[styles.imageUpload, { borderColor: colors.outline }]}
                                onPress={() => pickImage('logo')}
                            >
                                {logoUri ? (
                                    <Image source={{ uri: logoUri }} style={styles.logoPreview} />
                                ) : (
                                    <View style={styles.imagePlaceholder}>
                                        <MaterialCommunityIcons
                                            name="camera-plus"
                                            size={32}
                                            color={colors.onSurfaceVariant}
                                        />
                                        <Text style={[styles.imagePlaceholderText, { color: colors.onSurfaceVariant }]}>
                                            Add Logo
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            {logoUri && (
                                <Button
                                    mode="text"
                                    onPress={() => setLogoUri(null)}
                                    style={styles.clearButton}
                                    textColor={colors.error}
                                >
                                    Remove Logo
                                </Button>
                            )}
                        </View>

                        {/* Header Upload */}
                        <View style={styles.imageSection}>
                            <Text style={[styles.imageLabel, { color: colors.onSurface }]}>
                                Header Image
                            </Text>
                            <TouchableOpacity
                                style={[styles.headerImageUpload, { borderColor: colors.outline }]}
                                onPress={() => pickImage('header')}
                            >
                                {headerUri ? (
                                    <Image source={{ uri: headerUri }} style={styles.headerPreview} />
                                ) : (
                                    <View style={styles.imagePlaceholder}>
                                        <MaterialCommunityIcons
                                            name="image-plus"
                                            size={32}
                                            color={colors.onSurfaceVariant}
                                        />
                                        <Text style={[styles.imagePlaceholderText, { color: colors.onSurfaceVariant }]}>
                                            Add Header Image
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            {headerUri && (
                                <Button
                                    mode="text"
                                    onPress={() => setHeaderUri(null)}
                                    style={styles.clearButton}
                                    textColor={colors.error}
                                >
                                    Remove Header
                                </Button>
                            )}
                        </View>
                    </Card.Content>
                </Card>

                {/* Club Details Section */}
                <Card style={[styles.card, { backgroundColor: colors.surface }]} mode="outlined">
                    <Card.Content>
                        <Title style={[styles.sectionTitle, { color: colors.onSurface }]}>
                            Club Details
                        </Title>

                        {/* Club Name */}
                        <TextInput
                            label="Club Name"
                            value={formData.clubName}
                            onChangeText={(text) => {
                                setFormData({ ...formData, clubName: text });
                                if (errors.clubName) setErrors({ ...errors, clubName: undefined });
                            }}
                            mode="outlined"
                            style={styles.input}
                            error={!!errors.clubName}
                            maxLength={50}
                        />
                        <HelperText type="error" visible={!!errors.clubName}>
                            {errors.clubName}
                        </HelperText>
                        <HelperText type="info">
                            {formData.clubName.length}/50 characters
                        </HelperText>

                        {/* Description */}
                        <TextInput
                            label="Description"
                            value={formData.description}
                            onChangeText={(text) => {
                                setFormData({ ...formData, description: text });
                                if (errors.description) setErrors({ ...errors, description: undefined });
                            }}
                            mode="outlined"
                            multiline
                            numberOfLines={6}
                            style={styles.textArea}
                            error={!!errors.description}
                            maxLength={500}
                            placeholder="Tell people what your club is about..."
                        />
                        <HelperText type="error" visible={!!errors.description}>
                            {errors.description}
                        </HelperText>
                        <HelperText type="info">
                            {formData.description.length}/500 characters
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
                        icon="account-group"
                    >
                        Create Club
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
    imageSection: {
        marginBottom: 24,
    },
    imageLabel: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    imageUpload: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
    },
    headerImageUpload: {
        width: '100%',
        height: 120,
        borderRadius: 8,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    imagePlaceholderText: {
        fontSize: 12,
        fontWeight: '500',
    },
    logoPreview: {
        width: 116,
        height: 116,
        borderRadius: 58,
    },
    headerPreview: {
        width: '100%',
        height: 116,
        borderRadius: 6,
    },
    clearButton: {
        marginTop: 8,
        alignSelf: 'center',
    },
    input: {
        marginBottom: 4,
    },
    textArea: {
        marginBottom: 4,
    },
    buttonContainer: {
        marginTop: 24,
    },
    submitButton: {
        paddingVertical: 8,
    },
});
