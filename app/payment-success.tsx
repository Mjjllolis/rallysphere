import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function PaymentSuccess() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventId = params.event_id as string;
  const sessionId = params.session_id as string;

  useEffect(() => {
    const addUserToEvent = async () => {
      try {
        const userId = auth.currentUser?.uid;
        if (!userId) {
          setError('Not authenticated');
          setProcessing(false);
          return;
        }

        if (!eventId) {
          setError('Missing event ID');
          setProcessing(false);
          return;
        }

        // Add user to event attendees
        const eventRef = doc(db, 'events', eventId);
        await updateDoc(eventRef, {
          attendees: arrayUnion(userId),
        });

        console.log('Successfully added user to event after payment');
        setProcessing(false);
      } catch (error: any) {
        console.error('Error adding user to event:', error);
        setError(error.message);
        setProcessing(false);
      }
    };

    // Add a small delay to ensure webhook has time to process
    const timer = setTimeout(() => {
      addUserToEvent();
    }, 2000);

    return () => clearTimeout(timer);
  }, [eventId]);

  const handleViewEvent = () => {
    if (eventId) {
      router.replace(`/event/${eventId}`);
    } else {
      router.replace('/(tabs)/events');
    }
  };

  if (processing) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="titleLarge" style={styles.text}>
          Processing your payment...
        </Text>
        <Text variant="bodyMedium" style={[styles.text, { opacity: 0.7 }]}>
          Please wait a moment
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.error }]}>
          ⚠️ Payment Successful
        </Text>
        <Text variant="bodyLarge" style={styles.text}>
          Your payment was processed successfully, but there was an issue registering you for the event.
        </Text>
        <Text variant="bodyMedium" style={[styles.text, { opacity: 0.7, marginTop: 8 }]}>
          Error: {error}
        </Text>
        <Text variant="bodyMedium" style={[styles.text, { opacity: 0.7, marginTop: 8 }]}>
          Please contact support if you don't see your registration within a few minutes.
        </Text>
        <Button
          mode="contained"
          onPress={handleViewEvent}
          style={styles.button}
        >
          Continue
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="displaySmall" style={styles.emoji}>
        ✅
      </Text>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
        Payment Successful!
      </Text>
      <Text variant="bodyLarge" style={styles.text}>
        You have successfully purchased your ticket.
      </Text>
      <Text variant="bodyLarge" style={styles.text}>
        You are now registered for the event.
      </Text>
      <Button
        mode="contained"
        onPress={handleViewEvent}
        style={styles.button}
      >
        View Event
      </Button>
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
  button: {
    marginTop: 32,
    minWidth: 200,
  },
});
