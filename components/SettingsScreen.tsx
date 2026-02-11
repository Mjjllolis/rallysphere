// components/SettingsScreen.tsx
import React from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Text, IconButton, Switch, List, Divider, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { logout } from '../lib/firebase';
import { useThemeToggle } from '../app/_layout';

interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsScreen({ visible, onClose }: SettingsScreenProps) {
  const { isDark, toggleTheme } = useThemeToggle();
  const theme = useTheme();
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = React.useState(false);
  const [darkModeModalVisible, setDarkModeModalVisible] = React.useState(false);

  const handleDarkModeToggle = async () => {
    // If not in dark mode, switch to dark mode
    if (!isDark) {
      await toggleTheme();
    }
    // Show the coming soon modal
    setDarkModeModalVisible(true);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await logout();
              if (result.success) {
                onClose();
                router.replace('/(auth)/welcome-simple');
              } else {
                Alert.alert('Error', 'Failed to sign out');
              }
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            }
          }
        }
      ]
    );
  };

  // Get gradients from theme (with fallback for type safety)
  const gradients = (theme as any).gradients || {
    background: isDark
      ? ['rgba(27, 54, 93, 0.3)', 'rgba(96, 165, 250, 0.1)', 'rgba(0, 0, 0, 0)']
      : ['rgba(219, 234, 254, 0.4)', 'rgba(147, 197, 253, 0.2)', 'rgba(255, 255, 255, 0)'],
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Gradient Overlay */}
        <LinearGradient
          colors={gradients.background}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.outline }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.onBackground }]}>Settings</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={[styles.closeButtonBlur, { borderColor: theme.colors.outline }]}>
                <IconButton icon="close" size={24} iconColor={theme.colors.onSurface} />
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* Settings Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Account Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/profile/tickets');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Your Tickets</Text>
                      <Text style={styles.settingDescription}>
                        View your event tickets and purchase history
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/profile/orders');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Your Orders</Text>
                      <Text style={styles.settingDescription}>
                        View your store order history and track shipments
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/profile/addresses');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Saved Addresses</Text>
                      <Text style={styles.settingDescription}>
                        Manage your shipping addresses
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* General Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>General</Text>

              <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                <View style={styles.settingContent}>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.settingTitle}>Dark Mode</Text>
                    <Text style={styles.settingDescription}>
                      Toggle between light and dark theme
                    </Text>
                  </View>
                  <Switch
                    value={isDark}
                    onValueChange={handleDarkModeToggle}
                    trackColor={{ false: 'rgba(255, 255, 255, 0.2)', true: 'rgba(99, 102, 241, 0.5)' }}
                    thumbColor='#6366f1'
                  />
                </View>
              </BlurView>

              <TouchableOpacity
                onPress={() => Alert.alert('Coming Soon', 'Notification settings will be available soon!')}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Notifications</Text>
                      <Text style={styles.settingDescription}>
                        Manage your notification preferences
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Alert.alert('Coming Soon', 'Privacy settings will be available soon!')}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Privacy</Text>
                      <Text style={styles.settingDescription}>
                        Control your privacy settings
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Support */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Support</Text>

              <TouchableOpacity
                onPress={() => Alert.alert('Coming Soon', 'Help & support will be available soon!')}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Help & Support</Text>
                      <Text style={styles.settingDescription}>
                        Get help and contact support
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Alert.alert('RallySphere', 'Version 1.0.0\n\nBuilt with React Native and Firebase')}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>About</Text>
                      <Text style={styles.settingDescription}>
                        App version and information
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Legal */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Legal</Text>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/legal/terms');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Terms and Conditions</Text>
                      <Text style={styles.settingDescription}>
                        Review our terms of service
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/legal/privacy');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Privacy Policy</Text>
                      <Text style={styles.settingDescription}>
                        How we handle your data
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push('/legal/cookies');
                }}
              >
                <BlurView intensity={40} tint="dark" style={styles.settingItem}>
                  <View style={styles.settingContent}>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>Cookie Policy</Text>
                      <Text style={styles.settingDescription}>
                        Our use of cookies and tracking
                      </Text>
                    </View>
                    <IconButton icon="chevron-right" size={24} iconColor="white" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            </View>

            {/* Sign Out */}
            <View style={styles.section}>
              <TouchableOpacity onPress={handleSignOut}>
                <BlurView intensity={40} tint="dark" style={[styles.settingItem, styles.signOutItem]}>
                  <View style={styles.settingContent}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                    <IconButton icon="logout" size={24} iconColor="#ef4444" />
                  </View>
                </BlurView>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setDeleteAccountModalVisible(true)}>
                <BlurView intensity={40} tint="dark" style={[styles.settingItem, styles.deleteAccountItem]}>
                  <View style={styles.settingContent}>
                    <Text style={styles.deleteAccountText}>Delete Account</Text>
                    <IconButton icon="delete-forever" size={24} iconColor="#dc2626" />
                  </View>
                </BlurView>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteAccountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteAccountModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={80} tint="dark" style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <IconButton icon="alert-circle-outline" size={48} iconColor="#dc2626" />
              <Text style={styles.modalTitle}>Delete Account</Text>
              <Text style={styles.modalMessage}>
                Account deletion and request functionality coming soon.
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setDeleteAccountModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* Dark Mode Modal */}
      <Modal
        visible={darkModeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDarkModeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={80} tint="dark" style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <IconButton icon="theme-light-dark" size={48} iconColor="#6366f1" />
              <Text style={styles.modalTitle}>Coming Soon</Text>
              <Text style={styles.modalMessage}>
                Light mode will be available in a future update.
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setDarkModeModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeButton: {
    width: 40,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  closeButtonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  settingItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
  },
  signOutItem: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ef4444',
    flex: 1,
  },
  deleteAccountItem: {
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  deleteAccountText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#dc2626',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    maxWidth: 400,
    width: '100%',
  },
  modalContent: {
    padding: 32,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 120,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
});
