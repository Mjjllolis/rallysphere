// components/JoinClubModal.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { 
  Modal, 
  Portal, 
  Card, 
  Text, 
  TextInput, 
  Button,
  useTheme
} from 'react-native-paper';

interface JoinClubModalProps {
  visible: boolean;
  onDismiss: () => void;
  onJoin: (message: string) => Promise<void>;
  clubName: string;
  requiresApproval: boolean;
  loading?: boolean;
}

export default function JoinClubModal({
  visible,
  onDismiss,
  onJoin,
  clubName,
  requiresApproval,
  loading = false
}: JoinClubModalProps) {
  const theme = useTheme();
  const [message, setMessage] = useState('');

  const handleJoin = async () => {
    await onJoin(message);
    setMessage('');
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}
      >
        <Card>
          <Card.Content style={styles.content}>
            <Text variant="headlineSmall" style={styles.title}>
              Join {clubName}
            </Text>
            
            {requiresApproval ? (
              <>
                <Text variant="bodyMedium" style={styles.description}>
                  This club requires approval to join. Your request will be reviewed by the club admins.
                </Text>
                
                <TextInput
                  label="Message (Optional)"
                  value={message}
                  onChangeText={setMessage}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.messageInput}
                  placeholder="Tell the admins why you'd like to join..."
                />
              </>
            ) : (
              <Text variant="bodyMedium" style={styles.description}>
                You're about to join {clubName}. You'll be able to participate in events and discussions.
              </Text>
            )}

            <View style={styles.actions}>
              <Button
                mode="outlined"
                onPress={onDismiss}
                style={styles.button}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleJoin}
                style={styles.button}
                loading={loading}
                disabled={loading}
              >
                {requiresApproval ? 'Send Request' : 'Join Club'}
              </Button>
            </View>
          </Card.Content>
        </Card>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
  },
  content: {
    padding: 24,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  description: {
    marginBottom: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  messageInput: {
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 0.48,
  },
});
