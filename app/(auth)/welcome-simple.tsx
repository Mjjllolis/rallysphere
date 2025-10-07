import React from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

export default function WelcomeScreen() {
  const theme = useTheme();

  const handleGetStarted = () => {
    console.log('Get Started pressed');
    router.push('/(auth)/signup');
  };

  const handleSignIn = () => {
    console.log('Sign In pressed');
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* BG video */}
      <Video
        source={require('../../assets/bgWelcome.mp4')}
        style={[StyleSheet.absoluteFill, styles.video]}
        resizeMode="cover"
        shouldPlay
        isLooping
        isMuted
      />

      {/* Gradient overlay for readability */}
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
        style={StyleSheet.absoluteFill}
      />

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
            mode="outlined"
            onPress={handleSignIn}
            style={styles.signInButton}
            contentStyle={styles.buttonContent}
            textColor="#FFFFFF"
          >
            Sign In
          </Button>

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
  signInButton: {
    marginBottom: 16,
    borderRadius: 12,
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  getStartedButton: {
    marginBottom: 16,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 4,
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
