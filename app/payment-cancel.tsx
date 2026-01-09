import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function PaymentCancel() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  const eventId = params.event_id as string;

  const handleTryAgain = () => {
    if (eventId) {
      router.replace(`/event/${eventId}`);
    } else {
      router.replace('/(tabs)/events');
    }
  };

  const handleGoHome = () => {
    router.replace('/(tabs)/events');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="displaySmall" style={styles.emoji}>
        ❌
      </Text>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.error }]}>
        Payment Cancelled
      </Text>
      <Text variant="bodyLarge" style={styles.text}>
        Your payment was cancelled.
      </Text>
      <Text variant="bodyLarge" style={styles.text}>
        No charges were made to your account.
      </Text>
      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleTryAgain}
          style={styles.button}
        >
          Try Again
        </Button>
        <Button
          mode="outlined"
          onPress={handleGoHome}
          style={styles.button}
        >
          Go to Events
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    marginBottom: 8,
  },
  buttonContainer: {
    marginTop: 32,
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  button: {
    width: '100%',
  },
});
