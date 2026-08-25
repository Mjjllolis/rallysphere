import React, { useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Animated,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import PhoneAuthCard from '../../components/auth/PhoneAuthCard';

/**
 * Standalone phone entry. The welcome screen presents this same card as an
 * in-place sheet; this route exists for deep links (e.g. event-preview) that
 * jump straight into auth, and shares the background + card so both match.
 */
export default function PhoneAuthScreen() {
    const { mode, redirectEventId } = useLocalSearchParams<{ mode?: string; redirectEventId?: string }>();
    const isSignUp = mode !== 'signin';

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;

    const player = useVideoPlayer(require('../../assets/bgWelcome2.mp4'), (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome-simple');
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
            />

            <LinearGradient
                colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Animated.View
                        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
                    >
                        <Image
                            source={require('../../assets/Logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />

                        <PhoneAuthCard
                            mode={isSignUp ? 'signup' : 'signin'}
                            redirectEventId={redirectEventId}
                            onCancel={handleBack}
                            cancelLabel="Back"
                        />
                    </Animated.View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        justifyContent: 'center',
    },
    logo: {
        alignSelf: 'center',
        width: 180,
        height: 100,
        marginBottom: 24,
    },
});
