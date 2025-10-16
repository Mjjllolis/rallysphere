// app/stripe-connect/refresh.tsx - Stripe Connect onboarding refresh handler
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme, Card } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';

export default function StripeConnectRefresh() {
  const theme = useTheme();
  const { clubId } = useLocalSearchParams();

  const handleContinue = () => {
    if (clubId) {
      router.replace(`/club/${clubId}`);
    } else {
      router.replace('/(tabs)/clubs');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          <View style={styles.infoIcon}>
            <Text style={{ fontSize: 64 }}>ℹ️</Text>
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            Setup Link Expired
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Your Stripe Connect onboarding link has expired. Please return to your club page and click
            "Continue Setup" to get a new link.
          </Text>
          <Button
            mode="contained"
            onPress={handleContinue}
            style={styles.button}
          >
            Return to Club
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    padding: 20,
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  infoIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  button: {
    minWidth: 200,
  },
});
