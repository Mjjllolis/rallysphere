import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

interface RallyCreditsPaidModalProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  clubId: string;
  clubName: string;
  isAlreadyMember: boolean;
}

export default function RallyCreditsPaidModal({
  visible,
  onClose,
  amount,
  clubId,
  clubName,
  isAlreadyMember,
}: RallyCreditsPaidModalProps) {
  const handleViewRewards = () => {
    onClose();
    router.push(`/(tabs)/clubs?clubId=${clubId}`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.modalContainer}>
          <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
            <View style={styles.content}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500', '#FF6B35']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconGradient}
                >
                  <Text style={styles.icon}>🎉</Text>
                </LinearGradient>
              </View>

              <Text style={styles.title}>You've Been Paid!</Text>

              <View style={styles.creditsContainer}>
                <Text style={styles.creditsAmount}>+{amount}</Text>
                <Text style={styles.creditsLabel}>Rally Credits</Text>
              </View>

              <Text style={styles.description}>
                {isAlreadyMember
                  ? `Your Rally Credits have been added to your ${clubName} rewards balance!`
                  : `Welcome to ${clubName}! Your Rally Credits are waiting for you.`}
              </Text>

              <TouchableOpacity
                style={styles.viewRewardsButton}
                onPress={handleViewRewards}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#6366f1', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    {isAlreadyMember ? 'View My Rewards' : 'Join Community & View Rewards'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  blurContainer: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
    textAlign: 'center',
  },
  creditsContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  creditsAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
  },
  creditsLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  viewRewardsButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  buttonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  closeButton: {
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
});
