import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Image,
    Platform,
    TouchableOpacity,
    Animated,
    KeyboardAvoidingView,
    Pressable,
    StatusBar,
    BackHandler,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import PhoneAuthCard from '../../components/auth/PhoneAuthCard';

type AuthMode = 'signup' | 'signin';

export default function WelcomeScreen() {
    const player = useVideoPlayer(require('../../assets/bgWelcome2.mp4'), (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

    // null = sheet closed. The video never unmounts, so it keeps playing behind.
    const [authMode, setAuthMode] = useState<AuthMode | null>(null);

    const sheetAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(sheetAnim, {
            toValue: authMode ? 1 : 0,
            duration: authMode ? 320 : 220,
            useNativeDriver: true,
        }).start();
    }, [authMode]);

    // Android hardware back closes the sheet instead of leaving the screen.
    useEffect(() => {
        if (Platform.OS !== 'android' || !authMode) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            setAuthMode(null);
            return true;
        });
        return () => sub.remove();
    }, [authMode]);

    const sheetTranslate = sheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [420, 0],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* BG video */}
            <VideoView
                player={player}
                style={[StyleSheet.absoluteFill, styles.video]}
                contentFit="cover"
                nativeControls={false}
            />

            {/* Gradient overlay for readability */}
            <LinearGradient
                colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                {/* Top Logo + Title */}
                <Animated.View
                    style={[
                        styles.header,
                        {
                            transform: [
                                { scale: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
                            ],
                        },
                    ]}
                    pointerEvents="none"
                >
                    <Image
                        source={require('../../assets/Logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    {/* Tagline fades out with the sheet so it never ghosts behind the card */}
                    <Animated.View style={{ opacity: sheetAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
                        <Text variant="headlineMedium" style={styles.title}>
                            All-in-One Platform for{'\n'}Clubs and Players
                        </Text>
                    </Animated.View>
                </Animated.View>

                {/* Footer Actions — hidden while the auth sheet is open */}
                {!authMode && (
                    <View style={styles.footer}>
                        <Button
                            mode="contained"
                            onPress={() => setAuthMode('signup')}
                            style={styles.getStartedButton}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.getStartedLabel}
                            buttonColor="#4F8CC9"
                            textColor="#FFFFFF"
                        >
                            Get Started
                        </Button>

                        <TouchableOpacity
                            onPress={() => setAuthMode('signin')}
                            style={styles.alreadyHaveAccountButton}
                        >
                            <Text style={styles.alreadyHaveAccountText}>Already have an account?</Text>
                        </TouchableOpacity>

                        <Text style={styles.terms}>
                            By continuing, you agree to RallySphere's{' '}
                            <Text style={styles.link}>Privacy Notice</Text>,{' '}
                            <Text style={styles.link}>Terms of Use</Text>,{' '}
                            <Text style={styles.link}>End Users' License Agreement</Text>
                        </Text>
                    </View>
                )}
            </SafeAreaView>

            {/* Auth sheet — rendered over the still-playing video */}
            {authMode && (
                <View style={StyleSheet.absoluteFill}>
                    {/* Tap outside to dismiss */}
                    <Pressable style={styles.backdrop} onPress={() => setAuthMode(null)}>
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                styles.backdropTint,
                                { opacity: sheetAnim },
                            ]}
                        />
                    </Pressable>

                    <KeyboardAvoidingView
                        style={styles.sheetWrapper}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        pointerEvents="box-none"
                    >
                        <Animated.View
                            style={[
                                styles.sheet,
                                { opacity: sheetAnim, transform: [{ translateY: sheetTranslate }] },
                            ]}
                        >
                            <View style={styles.grabber} />
                            <PhoneAuthCard
                                mode={authMode}
                                onCancel={() => setAuthMode(null)}
                                cancelLabel={authMode === 'signup' ? 'Cancel' : 'Back'}
                            />
                        </Animated.View>
                    </KeyboardAvoidingView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    video: {
        opacity: 1,
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        marginTop: Platform.OS === 'ios' ? 40 : 20,
    },
    logo: {
        width: 220,
        height: 130,
        marginBottom: 24,
    },
    title: {
        fontWeight: '600',
        textAlign: 'center',
        color: '#FFFFFF',
        lineHeight: 30,
        fontSize: 21,
        letterSpacing: 0.2,
        paddingHorizontal: 20,
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    getStartedButton: {
        marginBottom: 20,
        borderRadius: 30,
    },
    getStartedLabel: {
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    buttonContent: {
        paddingVertical: 8,
    },
    alreadyHaveAccountButton: {
        alignSelf: 'center',
        paddingVertical: 8,
        marginBottom: 16,
    },
    alreadyHaveAccountText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    terms: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 18,
    },
    link: {
        textDecorationLine: 'underline',
        color: '#B8D4F0',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    backdropTint: {
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheetWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 42 : 24,
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.35)',
        marginBottom: 14,
    },
});
