import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    Animated,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    Image,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { createUserProfile } from '../../lib/firebase';

export default function ProfileSetupScreen() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [bio, setBio] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const pickPhoto = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow access to your photo library.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) {
            setPhotoUri(result.assets[0].uri);
        }
    };

    const uploadPhoto = async (uri: string): Promise<string | null> => {
        try {
            const auth = getAuth();
            const uid = auth.currentUser?.uid;
            if (!uid) return null;

            const response = await fetch(uri);
            const blob = await response.blob();
            const storage = getStorage();
            const storageRef = ref(storage, `profileImages/${uid}.jpg`);
            await uploadBytes(storageRef, blob);
            return await getDownloadURL(storageRef);
        } catch {
            return null;
        }
    };

    const handleSave = async () => {
        if (!firstName.trim() || !lastName.trim() || !email.trim()) {
            Alert.alert('Required Fields', 'Please fill in your first name, last name, and email.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }

        const auth = getAuth();
        const phone = auth.currentUser?.phoneNumber || '';

        setLoading(true);
        try {
            let photoURL: string | undefined;
            if (photoUri) {
                setUploadingPhoto(true);
                const url = await uploadPhoto(photoUri);
                setUploadingPhoto(false);
                if (url) photoURL = url;
            }

            const result = await createUserProfile({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone,
                bio: bio.trim() || undefined,
                photoURL,
                displayName: `${firstName.trim()} ${lastName.trim()}`,
            });

            if (result.success) {
                if (!phone) {
                    router.replace('/(auth)/link-phone');
                } else {
                    router.replace('/(tabs)/home');
                }
            } else {
                Alert.alert('Error', result.error || 'Failed to save profile.');
            }
        } finally {
            setLoading(false);
            setUploadingPhoto(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#2C5282', '#1A365D']} style={StyleSheet.absoluteFill} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Set Up Profile</Text>
                            <Text style={styles.description}>Tell us a bit about yourself.</Text>
                        </View>

                        {/* Avatar Picker */}
                        <TouchableOpacity style={styles.avatarContainer} onPress={pickPhoto}>
                            {photoUri ? (
                                <Image source={{ uri: photoUri }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarIcon}>📷</Text>
                                    <Text style={styles.avatarLabel}>Add Photo</Text>
                                </View>
                            )}
                            {photoUri && (
                                <View style={styles.avatarEditBadge}>
                                    <Text style={styles.avatarEditText}>Edit</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <Surface style={styles.card} elevation={8}>
                            <View style={styles.nameRow}>
                                <TextInput
                                    label="First Name *"
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    mode="outlined"
                                    style={[styles.input, styles.halfInput]}
                                    textColor="#1a1a1a"
                                    outlineColor="rgba(0,0,0,0.2)"
                                    activeOutlineColor="#2C5282"
                                    theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                                />
                                <TextInput
                                    label="Last Name *"
                                    value={lastName}
                                    onChangeText={setLastName}
                                    mode="outlined"
                                    style={[styles.input, styles.halfInput]}
                                    textColor="#1a1a1a"
                                    outlineColor="rgba(0,0,0,0.2)"
                                    activeOutlineColor="#2C5282"
                                    theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                                />
                            </View>

                            <TextInput
                                label="Email Address *"
                                value={email}
                                onChangeText={setEmail}
                                mode="outlined"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={styles.input}
                                textColor="#1a1a1a"
                                outlineColor="rgba(0,0,0,0.2)"
                                activeOutlineColor="#2C5282"
                                theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                                left={<TextInput.Icon icon="email" color="#2C5282" />}
                            />

                            <TextInput
                                label="Bio"
                                value={bio}
                                onChangeText={setBio}
                                mode="outlined"
                                multiline
                                numberOfLines={3}
                                placeholder="Tell people about yourself... (optional)"
                                style={styles.input}
                                textColor="#1a1a1a"
                                outlineColor="rgba(0,0,0,0.2)"
                                activeOutlineColor="#2C5282"
                                theme={{ colors: { onSurfaceVariant: 'rgba(0,0,0,0.5)' } }}
                            />

                            <Button
                                mode="contained"
                                onPress={handleSave}
                                loading={loading}
                                disabled={loading}
                                style={styles.button}
                                contentStyle={styles.buttonContent}
                                labelStyle={styles.buttonLabel}
                            >
                                {uploadingPhoto ? 'Uploading Photo...' : 'Get Started'}
                            </Button>
                        </Surface>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 24, paddingBottom: 48 },
    header: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
    title: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 8 },
    description: { fontSize: 16, color: 'rgba(255,255,255,0.8)' },
    avatarContainer: { alignSelf: 'center', marginBottom: 24 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: 'white' },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    avatarIcon: { fontSize: 28 },
    avatarLabel: { fontSize: 12, color: 'white', fontWeight: '600' },
    avatarEditBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#2C5282',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderWidth: 2,
        borderColor: 'white',
    },
    avatarEditText: { color: 'white', fontSize: 10, fontWeight: '700' },
    card: { borderRadius: 24, padding: 24, backgroundColor: 'white', gap: 16 },
    nameRow: { flexDirection: 'row', gap: 12 },
    input: { backgroundColor: 'white' },
    halfInput: { flex: 1 },
    button: { marginTop: 4, borderRadius: 12, backgroundColor: '#2C5282' },
    buttonContent: { paddingVertical: 10 },
    buttonLabel: { fontSize: 16, fontWeight: '600' },
});
