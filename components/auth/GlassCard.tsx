import React from 'react';
import { StyleSheet, View, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Frosted panel used by every auth screen. Heavy blur over a light scrim, so
 * the reel still reads through the material the way iOS glass sits over
 * wallpaper, while text keeps its contrast.
 */
export default function GlassCard({ children, style, contentStyle }: Props) {
    return (
        <View style={[styles.wrapper, style]}>
            <BlurView intensity={Platform.OS === 'ios' ? 85 : 120} tint="dark" style={StyleSheet.absoluteFill} />
            {/* Light scrim: enough contrast for text, still lets the reel through */}
            <View style={styles.scrim} />
            {/* Top-down sheen, the highlight iOS materials pick up from above */}
            <LinearGradient
                colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <View style={[styles.content, contentStyle]}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    scrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(18,20,24,0.42)',
    },
    content: {
        padding: 28,
        gap: 14,
    },
});
