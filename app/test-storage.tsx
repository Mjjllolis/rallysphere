// app/test-storage.tsx - Temporary test page
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { testStorageConnection } from '../lib/firebase';

export default function TestStoragePage() {
  const theme = useTheme();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>('');

  const runStorageTest = async () => {
    setTesting(true);
    setResult('Testing storage connection...');
    
    try {
      const testResult = await testStorageConnection();
      
      if (testResult.success) {
        setResult('✅ Storage connection successful! Firebase Storage is properly configured.');
      } else {
        setResult(`❌ Storage connection failed: ${testResult.error}`);
      }
    } catch (error: any) {
      setResult(`❌ Unexpected error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          Firebase Storage Test
        </Text>
        
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="bodyLarge" style={styles.description}>
              This test will verify if Firebase Storage is properly configured and accessible.
            </Text>
            
            <Button
              mode="contained"
              onPress={runStorageTest}
              loading={testing}
              disabled={testing}
              style={styles.testButton}
            >
              {testing ? 'Testing...' : 'Test Storage Connection'}
            </Button>
            
            {result ? (
              <Card style={[styles.resultCard, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Card.Content>
                  <Text variant="bodyMedium">{result}</Text>
                </Card.Content>
              </Card>
            ) : null}
            
            <Button
              mode="outlined"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              Go Back
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
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: 'bold',
  },
  card: {
    elevation: 4,
  },
  description: {
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.8,
  },
  testButton: {
    marginBottom: 16,
  },
  resultCard: {
    marginBottom: 16,
  },
  backButton: {
    marginTop: 8,
  },
});
