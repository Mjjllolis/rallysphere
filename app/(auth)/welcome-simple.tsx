import React from 'react';
import { View, StyleSheet, Image, Platform, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';

export default function WelcomeScreen() {
  const player = useVideoPlayer(require('../../assets/bgWelcome.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const handleGetStarted = () => {
    router.push({ pathname: '/(auth)/phone-auth', params: { mode: 'signup' } });
  };

  const handleAlreadyHaveAccount = () => {
    router.push({ pathname: '/(auth)/phone-auth', params: { mode: 'signin' } });
  };

  const handleEmailLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* BG video */}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, styles.video]}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Gradient overlay for readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Dev Email Login Link - Top Right */}
      <TouchableOpacity onPress={handleEmailLogin} style={styles.emailLoginDevButton}>
        <Text style={styles.emailLoginDevText}>Email (dev)</Text>
      </TouchableOpacity>

      <SafeAreaView style={styles.safeArea}>
        {/* Top Logo + Title */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text variant="headlineMedium" style={styles.title}>
            All-in-One Platform for{'\n'}Clubs and Players
          </Text>
        </View>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={handleGetStarted}
            style={styles.getStartedButton}
            contentStyle={styles.buttonContent}
            buttonColor="#4F8CC9"
            textColor="#FFFFFF"
          >
            Get Started
          </Button>

          <TouchableOpacity onPress={handleAlreadyHaveAccount} style={styles.alreadyHaveAccountButton}>
            <Text style={styles.alreadyHaveAccountText}>Already have an account?</Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            By continuing, you agree to RallySphere's{' '}
            <Text style={styles.link}>Privacy Notice</Text>,{' '}
            <Text style={styles.link}>Terms of Use</Text>,{' '}
            <Text style={styles.link}>End Users' License Agreement</Text>
          </Text>
        </View>
      </SafeAreaView>
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
  emailLoginDevButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  emailLoginDevText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textDecorationLine: 'underline',
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
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#FFFFFF',
    lineHeight: 32,
    fontSize: 22,
    paddingHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  getStartedButton: {
    marginBottom: 20,
    borderRadius: 30,
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  terms: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  link: {
    textDecorationLine: 'underline',
    color: '#B8D4F0',
  },
});
