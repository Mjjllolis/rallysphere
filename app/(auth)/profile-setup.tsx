import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Alert,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    TextInput as RNTextInput,
    Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getAuth } from 'firebase/auth';
import { createUserProfile, logout } from '../../lib/firebase';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    FadeIn,
} from 'react-native-reanimated';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

const STEPS = {
    NAME: 0,
    EMAIL: 1,
    LOCATION: 2,
    COMPLETE: 3,
};

export default function ProfileSetupScreen() {
    const [currentStep, setCurrentStep] = useState(STEPS.NAME);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const slideX = useSharedValue(0);

    const handleNext = () => {
        if (currentStep === STEPS.NAME) {
            if (!firstName.trim() || !lastName.trim()) {
                Alert.alert('Required', 'Please enter your first and last name.');
                return;
            }
            slideX.value = withSpring(-width);
            setCurrentStep(STEPS.EMAIL);
        } else if (currentStep === STEPS.EMAIL) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                Alert.alert('Invalid Email', 'Please enter a valid email address.');
                return;
            }
            slideX.value = withSpring(-width * 2);
            setCurrentStep(STEPS.LOCATION);
        } else if (currentStep === STEPS.LOCATION) {
            handleLocationPermission();
        }
    };

    const handleLocationPermission = async () => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status === 'granted') {
                await saveProfile(true);
            } else {
                // User denied - still save profile but without location enabled
                Alert.alert(
                    'Location Disabled',
                    'You can enable location services later in settings to use all features.',
                    [{ text: 'OK', onPress: () => saveProfile(false) }]
                );
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to request location permission.');
            setLoading(false);
        }
    };

    const saveProfile = async (locationEnabled: boolean) => {
        const auth = getAuth();
        const phone = auth.currentUser?.phoneNumber || '';

        try {
            const result = await createUserProfile({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone,
                displayName: `${firstName.trim()} ${lastName.trim()}`,
                locationEnabled,
            });

            if (result.success) {
                slideX.value = withSpring(-width * 3);
                setCurrentStep(STEPS.COMPLETE);
            } else {
                Alert.alert('Error', result.error || 'Failed to save profile.');
                setLoading(false);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to save profile.');
            setLoading(false);
        }
    };

    const handleSkipLocation = async () => {
        await saveProfile(false);
    };

    const handleBack = () => {
        if (currentStep === STEPS.EMAIL) {
            slideX.value = withSpring(0);
            setCurrentStep(STEPS.NAME);
        } else if (currentStep === STEPS.LOCATION) {
            slideX.value = withSpring(-width);
            setCurrentStep(STEPS.EMAIL);
        }
    };

    const handleNotYou = async () => {
        Alert.alert(
            'Sign Out',
            'Do you want to sign out and return to the welcome screen?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        router.replace('/(auth)/welcome-simple');
                    }
                }
            ]
        );
    };

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: slideX.value }],
    }));

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={['#0F172A', '#1E1B4B', '#2E1065']} style={StyleSheet.absoluteFill} />

            {/* Back Button - Top Left */}
            {currentStep > STEPS.NAME && currentStep !== STEPS.COMPLETE && (
                <TouchableOpacity onPress={handleBack} style={styles.backButtonTopLeft}>
                    <View style={styles.backCircle}>
                        <Text style={styles.backChevron}>‹</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Not You Link - Top Right */}
            {currentStep !== STEPS.COMPLETE && (
                <TouchableOpacity onPress={handleNotYou} style={styles.notYouButton}>
                    <Text style={styles.notYouText}>Not you?</Text>
                </TouchableOpacity>
            )}

            {/* Dev Back Button - Top Right on Complete Screen */}
            {currentStep === STEPS.COMPLETE && (
                <TouchableOpacity
                    onPress={() => {
                        slideX.value = withSpring(-width * 2);
                        setCurrentStep(STEPS.LOCATION);
                    }}
                    style={styles.notYouButton}
                >
                    <Text style={styles.notYouText}>← Back (dev)</Text>
                </TouchableOpacity>
            )}

            {/* Progress Dots */}
            {currentStep !== STEPS.COMPLETE && (
                <View style={styles.progressContainer}>
                    {[0, 1, 2].map((step) => (
                        <ProgressDot key={step} active={currentStep === step} completed={currentStep > step} />
                    ))}
                </View>
            )}

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Animated.View style={[styles.stepsContainer, containerStyle]}>
                    {/* Step 1: Name */}
                    <View style={styles.step}>
                        <View style={styles.stepContent}>
                            <Text style={styles.stepTitle}>What's your name?</Text>
                            <Text style={styles.stepSubtitle}>Let's get to know you</Text>

                            <View style={styles.inputGroup}>
                                <RNTextInput
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    placeholder="First name"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    style={styles.input}
                                    autoFocus
                                />
                                <RNTextInput
                                    value={lastName}
                                    onChangeText={setLastName}
                                    placeholder="Last name"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    style={styles.input}
                                />
                            </View>

                            <TouchableOpacity
                                onPress={handleNext}
                                style={styles.button}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#FFFFFF', '#F3F4F6']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={styles.buttonGradient}
                                >
                                    <Text style={[styles.buttonText, styles.buttonTextDark]}>Continue</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Step 2: Email */}
                    <View style={styles.step}>
                        <View style={styles.stepContent}>
                            <Text style={styles.stepTitle}>What's your email?</Text>
                            <Text style={styles.stepSubtitle}>We'll send you ride updates</Text>

                            <View style={styles.inputGroup}>
                                <View style={styles.emailInputContainer}>
                                    <Text style={styles.emailIcon}>📧</Text>
                                    <RNTextInput
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="your.email@example.com"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        style={[styles.input, styles.emailInput]}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoFocus
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleNext}
                                style={styles.button}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#FFFFFF', '#F3F4F6']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={styles.buttonGradient}
                                >
                                    <Text style={[styles.buttonText, styles.buttonTextDark]}>Continue</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Step 3: Location Services */}
                    <View style={styles.step}>
                        <View style={styles.stepContent}>
                            <View style={styles.locationHeroContainer}>
                                <Text style={styles.locationHero}>📍</Text>
                            </View>

                            <Text style={styles.stepTitle}>Enable Location Services</Text>
                            <Text style={styles.stepSubtitle}>Find events and connect with your community</Text>

                            <View style={styles.featureList}>
                                <FeatureItem icon="🏅" text="Discover local events near you" />
                                <FeatureItem icon="📊" text="Track your activity and stats" />
                                <FeatureItem icon="👥" text="Connect with your community" />
                                <FeatureItem icon="🎯" text="Get personalized recommendations" />
                            </View>

                            <Text style={styles.privacyNote}>
                                Your location is only used while using the app and is never shared without your permission.
                            </Text>

                            <TouchableOpacity
                                onPress={handleNext}
                                style={styles.button}
                                activeOpacity={0.8}
                                disabled={loading}
                            >
                                <LinearGradient
                                    colors={loading ? ['#64748B', '#475569'] : ['#10B981', '#059669', '#047857']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={[styles.buttonGradient, loading ? styles.buttonGradientDisabled : styles.buttonGradientGreen]}
                                >
                                    <Text style={styles.buttonText}>
                                        {loading ? 'Setting up...' : 'Enable Location'}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleSkipLocation} disabled={loading}>
                                <Text style={styles.skipText}>Skip for now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Step 4: Complete */}
                    <View style={styles.step}>
                        <View style={styles.completeContent}>
                            <Animated.View entering={FadeIn.duration(600)}>
                                <Text style={styles.completeEmoji}>🎉</Text>
                                <Text style={styles.completeTitle}>All Set!</Text>
                                <Text style={styles.completeSubtitle}>
                                    Welcome to RallySphere, {firstName}!
                                </Text>
                                <Text style={styles.completeMessage}>
                                    Get ready to discover amazing cycling events and connect with riders in your community.
                                </Text>
                            </Animated.View>

                            <Animated.View
                                entering={FadeIn.duration(800).delay(400)}
                                style={styles.completeButtonContainer}
                            >
                                <TouchableOpacity
                                    onPress={() => router.replace('/(tabs)/home')}
                                    style={styles.button}
                                    activeOpacity={0.8}
                                >
                                    <LinearGradient
                                        colors={['#10B981', '#059669', '#047857']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0, y: 1 }}
                                        style={[styles.buttonGradient, styles.buttonGradientGreen]}
                                    >
                                        <Text style={styles.buttonText}>Let's Go! 🚀</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function ProgressDot({ active, completed }: { active: boolean; completed: boolean }) {
    const scale = useSharedValue(active ? 1.2 : 1);
    const opacity = useSharedValue(completed || active ? 1 : 0.3);

    useEffect(() => {
        scale.value = withSpring(active ? 1.2 : 1);
        opacity.value = withTiming(completed || active ? 1 : 0.3, { duration: 300 });
    }, [active, completed]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.progressDot, completed && styles.progressDotCompleted, animatedStyle]} />
    );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
    return (
        <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>{icon}</Text>
            <Text style={styles.featureText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backButtonTopLeft: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 20,
        left: 20,
        zIndex: 10,
    },
    backCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    backChevron: {
        fontSize: 32,
        fontWeight: '300',
        color: '#FFFFFF',
        marginTop: -2,
    },
    notYouButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 20,
        right: 20,
        zIndex: 10,
        padding: 8,
    },
    notYouText: {
        color: '#60A5FA',
        fontSize: 14,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    progressBarContainer: {
        paddingHorizontal: 32,
        paddingTop: 20,
        paddingBottom: 10,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 20,
        gap: 12,
    },
    progressDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    progressDotCompleted: {
        backgroundColor: '#3B82F6',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
    },
    stepsContainer: {
        flexDirection: 'row',
        flex: 1,
    },
    step: {
        width,
        paddingHorizontal: 24,
        justifyContent: 'center',
    },
    stepContent: {
        gap: 24,
    },
    stepTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFFFFF',
        textAlign: 'center',
        textShadowColor: 'rgba(59,130,246,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    stepSubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginTop: -16,
    },
    inputGroup: {
        gap: 16,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 16,
        fontSize: 17,
        fontWeight: '500',
        color: '#FFFFFF',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 2,
    },
    emailInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
        paddingLeft: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 2,
    },
    emailIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    emailInput: {
        flex: 1,
        backgroundColor: 'transparent',
        borderWidth: 0,
        paddingLeft: 0,
        color: '#FFFFFF',
    },
    button: {
        borderRadius: 16,
        overflow: 'visible',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 5,
        position: 'relative',
    },
    buttonGradient: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        borderBottomWidth: 5,
        borderBottomColor: '#D1D5DB',
        borderRightWidth: 4,
        borderRightColor: '#D1D5DB',
    },
    buttonGradientDisabled: {
        borderBottomColor: '#334155',
        borderRightColor: '#334155',
    },
    buttonGradientGreen: {
        borderBottomColor: '#047857',
        borderRightColor: '#047857',
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    buttonTextDark: {
        color: '#1F2937',
    },
    buttonColumn: {
        gap: 16,
        alignItems: 'center',
    },
    locationHeroContainer: {
        alignSelf: 'center',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(59,130,246,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 3,
        borderColor: 'rgba(59,130,246,0.3)',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 4,
    },
    locationHero: {
        fontSize: 64,
    },
    featureList: {
        gap: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 20,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 3,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    featureIcon: {
        fontSize: 24,
    },
    featureText: {
        flex: 1,
        fontSize: 15,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    privacyNote: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        fontStyle: 'italic',
        paddingHorizontal: 12,
    },
    skipText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
        fontWeight: '600',
        textDecorationLine: 'underline',
        textAlign: 'center',
    },
    completeContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 32,
    },
    completeButtonContainer: {
        width: '100%',
    },
    completeEmoji: {
        fontSize: 80,
        textAlign: 'center',
        marginBottom: 24,
    },
    completeTitle: {
        fontSize: 42,
        fontWeight: 'bold',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 16,
        textShadowColor: 'rgba(59,130,246,0.4)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 10,
    },
    completeSubtitle: {
        fontSize: 24,
        color: '#60A5FA',
        textAlign: 'center',
        marginBottom: 16,
        fontWeight: '600',
    },
    completeMessage: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 12,
    },
});
