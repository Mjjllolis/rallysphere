// components/CreateModal.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, Divider, useTheme, TouchableRipple } from 'react-native-paper';
import Modal from 'react-native-modal';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function CreateModal({ visible, onClose }: CreateModalProps) {
  const theme = useTheme();

  const options = [
    {
      icon: 'calendar-plus',
      label: 'New Event',
      onPress: () => {
        onClose();
        router.push('/(tabs)/create-event');
      },
    },
    {
      icon: 'square-edit-outline',
      label: 'New Post',
      onPress: () => {
        onClose();
        // 🔗 Replace with router.push('/post/create')
      },
    },
    {
      icon: 'account-group-outline',
      label: 'New Club',
      onPress: () => {
        onClose();
        router.push('/(tabs)/create-club');
      },
    },
  ];

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={{ justifyContent: 'flex-end', margin: 0 }}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Create</Text>
          <IconButton icon="close" onPress={onClose} />
        </View>

        {/* Options */}
        {options.map((option, index) => (
          <View key={option.label}>
            <TouchableRipple onPress={option.onPress}>
              <View style={styles.optionRow}>
                <MaterialCommunityIcons
                  name={option.icon}
                  size={24}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text style={[styles.optionLabel, { color: theme.colors.onSurface }]}>
                  {option.label}
                </Text>
              </View>
            </TouchableRipple>
            {index < options.length - 1 && <Divider />}
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionLabel: {
    marginLeft: 16,
    fontSize: 16,
  },
});
