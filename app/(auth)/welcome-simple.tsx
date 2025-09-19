// app/(auth)/welcome-simple.tsx - Just logo, title, and buttons
import React from 'react';
import { View, StyleSheet, Image, Platform } from 'react-native';
import {
  Text,
  Button,
  Card,
  useTheme
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function WelcomeScreen() {
  const theme = useTheme();

  console.log('WelcomeScreen rendering - simple version');

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
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#334155']}
        style={styles.background}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            {/* Header with Logo */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Image
                  source={require('../../assets/Logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text variant="headlineMedium" style={styles.title}>
                All-in-One Platform for{'\n'}Clubs and Players
              </Text>
              
              <Text variant="bodyLarge" style={styles.description}>
                Manage games, coaching, events, memberships, analytics, and merch—all from your phone or computer.
              </Text>
            </View>

            {/* Action Card - Just Buttons */}
            <Card style={styles.actionCard}>
              <Card.Content style={styles.cardContent}>
                <Button
                  mode="contained"
                  onPress={handleGetStarted}
                  style={styles.primaryButton}
                  contentStyle={styles.buttonContent}
                  buttonColor="#4F8CC9"
                  textColor="#FFFFFF"
                >
                  Get Started
                </Button>

                <Button
                  mode="outlined"
                  onPress={handleSignIn}
                  style={styles.secondaryButton}
                  contentStyle={styles.buttonContent}
                  textColor="#4F8CC9"
                >
                  Sign In
                </Button>
              </Card.Content>
            </Card>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 130,
    maxWidth: 300,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  description: {
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 20,
    color: '#B8D4F0',
  },
  actionCard: {
    elevation: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  cardContent: {
    padding: 40,
  },
  primaryButton: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 4,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4F8CC9',
  },
  buttonContent: {
    paddingVertical: 14,
  },
});
