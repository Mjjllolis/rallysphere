import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export default function CreatePage() {
  const params = useLocalSearchParams();
  const initialType = (params.type as string) || 'club';
  const [selectedType, setSelectedType] = useState<'club' | 'event'>(initialType as 'club' | 'event');

  useEffect(() => {
    // Redirect to the appropriate create page based on selection
    if (selectedType === 'club') {
      router.replace('/(tabs)/create-club');
    } else {
      router.replace('/(tabs)/create-event');
    }
  }, [selectedType]);

  return (
    <View style={styles.container}>
      {/* Black Background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.blackBackground} />
      </View>

      {/* Subtle Gradient Overlay */}
      <LinearGradient
        colors={['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <BlurView intensity={20} tint="dark" style={styles.backButton}>
              <IconButton icon="arrow-left" iconColor="#fff" size={24} style={{ margin: 0 }} />
            </BlurView>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.subtitle}>What would you like to create?</Text>

          {/* Club Option */}
          <TouchableOpacity
            onPress={() => setSelectedType('club')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.optionGradient}
            >
              <BlurView intensity={25} tint="dark" style={styles.option}>
                <View style={styles.optionContent}>
                  <View style={styles.optionIcon}>
                    <IconButton icon="account-group" iconColor="#60A5FA" size={40} style={{ margin: 0 }} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>Create a Club</Text>
                    <Text style={styles.optionDescription}>
                      Build a community around your interests
                    </Text>
                  </View>
                  <IconButton icon="chevron-right" iconColor="rgba(255,255,255,0.6)" size={24} style={{ margin: 0 }} />
                </View>
              </BlurView>
            </LinearGradient>
          </TouchableOpacity>

          {/* Event Option */}
          <TouchableOpacity
            onPress={() => setSelectedType('event')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(96, 165, 250, 0.5)', 'rgba(59, 130, 246, 0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.optionGradient}
            >
              <BlurView intensity={25} tint="dark" style={styles.option}>
                <View style={styles.optionContent}>
                  <View style={styles.optionIcon}>
                    <IconButton icon="calendar-plus" iconColor="#60A5FA" size={40} style={{ margin: 0 }} />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>Create an Event</Text>
                    <Text style={styles.optionDescription}>
                      Organize an event for your club or community
                    </Text>
                  </View>
                  <IconButton icon="chevron-right" iconColor="rgba(255,255,255,0.6)" size={24} style={{ margin: 0 }} />
                </View>
              </BlurView>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    gap: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  optionGradient: {
    borderRadius: 20,
    padding: 2,
  },
  option: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,30,48,0.8)',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(96,165,250,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  optionDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
});
