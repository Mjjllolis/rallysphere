// app/(auth)/signup.tsx - Super simple version
import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { signUp, UserProfile } from '../../lib/firebase';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  console.log('SignupScreen rendering - super simple');

  const handleSignup = async () => {
    if (!email || !password || !firstName || !lastName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const profile: UserProfile = {
        firstName: firstName.trim(),
        lastName: lastName.trim()
      };

      const result = await signUp(email.trim(), password, profile);
      if (result.success) {
        Alert.alert('Success', 'Account created!', [
          { text: 'OK', onPress: () => router.replace('/(tabs)') }
        ]);
      } else {
        Alert.alert('Error', result.error || 'Signup failed');
      }
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          Create Account
        </Text>

        <Card style={styles.card}>
          <Card.Content style={styles.cardContent}>
            <TextInput
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              mode="outlined"
              style={styles.input}
            />

            <TextInput
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              mode="outlined"
              style={styles.input}
            />

            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry
              style={styles.input}
            />

            <Button
              mode="contained"
              onPress={handleSignup}
              loading={loading}
              disabled={loading}
              style={styles.button}
              buttonColor="#4F8CC9"
            >
              Create Account
            </Button>

            <Button
              mode="text"
              onPress={() => router.push('/(auth)/login')}
              style={styles.linkButton}
            >
              Already have an account? Sign In
            </Button>

            <Button
              mode="text"
              onPress={() => router.back()}
              style={styles.linkButton}
            >
              Back to Welcome
            </Button>
          </Card.Content>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 32,
    color: '#1B365D',
    fontWeight: 'bold',
  },
  card: {
    elevation: 4,
  },
  cardContent: {
    padding: 24,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    marginBottom: 16,
  },
  linkButton: {
    marginBottom: 8,
  },
});
