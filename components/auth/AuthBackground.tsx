import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The looping welcome reel + readability scrim, shared by every auth screen so
 * the whole sign-up / sign-in / onboarding flow reads as one surface.
 */
export default function AuthBackground({ children }: { children: React.ReactNode }) {
    const player = useVideoPlayer(require('../../assets/bgWelcome2.mp4'), (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

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
                colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.68)', 'rgba(0,0,0,0.94)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
});
