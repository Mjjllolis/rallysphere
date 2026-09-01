// components/ReportModal.tsx — the shared "Report" sheet.
//
// Used from every surface carrying user-generated content (events, clubs,
// profiles, store items). Keep it generic: callers pass what's being reported,
// this owns reason selection, submission, and the confirmation.

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import {
  Modal,
  Portal,
  Text,
  TextInput,
  Button,
  IconButton,
  useTheme,
} from 'react-native-paper';
import {
  REPORT_REASONS,
  submitReport,
  type ReportContentType,
} from '../lib/moderation';

interface ReportModalProps {
  visible: boolean;
  onDismiss: () => void;
  contentType: ReportContentType;
  contentId: string;
  contentOwnerId?: string;
  /** Shown in the header so the user can confirm what they're reporting. */
  contentLabel?: string;
}

export default function ReportModal({
  visible,
  onDismiss,
  contentType,
  contentId,
  contentOwnerId,
  contentLabel,
}: ReportModalProps) {
  const theme = useTheme();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSelectedReason(null);
    setDetails('');
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  };

  const handleDismiss = () => {
    onDismiss();
    // Delay so the reset isn't visible mid dismiss animation.
    setTimeout(reset, 300);
  };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    setError(null);

    const result = await submitReport({
      contentType,
      contentId,
      contentOwnerId,
      contentLabel,
      reasonId: selectedReason,
      details,
    });

    setSubmitting(false);
    if (result.success) {
      setSubmitted(true);
    } else {
      setError(result.error ?? 'Could not submit report.');
    }
  };

  const typeLabel =
    contentType === 'storeItem' ? 'item' : contentType;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        {submitted ? (
          <View style={styles.confirmation}>
            <IconButton
              icon="check-circle"
              size={48}
              iconColor={(theme.colors as any).success ?? theme.colors.primary}
              style={{ margin: 0 }}
            />
            <Text variant="headlineSmall" style={styles.confirmTitle}>
              Report received
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.confirmBody, { color: theme.colors.onSurfaceVariant }]}
            >
              Thanks for flagging this. Our team reviews every report and will
              take action on anything that breaks our rules. Reports of child
              safety concerns are escalated immediately.
            </Text>
            <Button mode="contained" onPress={handleDismiss} style={styles.doneButton}>
              Done
            </Button>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text variant="headlineSmall">Report {typeLabel}</Text>
                {contentLabel ? (
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  >
                    {contentLabel}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="close" size={22} onPress={handleDismiss} style={{ margin: 0 }} />
            </View>

            <Text
              variant="bodyMedium"
              style={[styles.prompt, { color: theme.colors.onSurfaceVariant }]}
            >
              Why are you reporting this?
            </Text>

            <ScrollView style={styles.reasonList} keyboardShouldPersistTaps="handled">
              {REPORT_REASONS.map((reason) => {
                const active = selectedReason === reason.id;
                return (
                  <TouchableOpacity
                    key={reason.id}
                    onPress={() => setSelectedReason(reason.id)}
                    activeOpacity={0.7}
                    style={[
                      styles.reasonRow,
                      {
                        borderColor: active
                          ? theme.colors.primary
                          : theme.colors.outlineVariant ?? 'rgba(128,128,128,0.3)',
                        backgroundColor: active
                          ? theme.colors.primaryContainer
                          : 'transparent',
                      },
                    ]}
                  >
                    <IconButton
                      icon={active ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      iconColor={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                      style={{ margin: 0 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge">{reason.label}</Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {reason.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              label="Add details (optional)"
              value={details}
              onChangeText={setDetails}
              mode="outlined"
              multiline
              numberOfLines={3}
              maxLength={2000}
              style={styles.detailsInput}
              placeholder="Anything that helps us review this faster"
            />

            {error ? (
              <Text
                variant="bodySmall"
                style={[styles.error, { color: theme.colors.error }]}
              >
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Button mode="outlined" onPress={handleDismiss} style={styles.button}>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                disabled={!selectedReason || submitting}
                loading={submitting}
                style={styles.button}
              >
                Submit report
              </Button>
            </View>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  prompt: {
    marginBottom: 12,
  },
  reasonList: {
    maxHeight: 280,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingRight: 12,
    marginBottom: 8,
  },
  detailsInput: {
    marginTop: 12,
  },
  error: {
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  button: {
    minWidth: 110,
  },
  confirmation: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  confirmTitle: {
    marginTop: 4,
    marginBottom: 8,
  },
  confirmBody: {
    textAlign: 'center',
    marginBottom: 20,
  },
  doneButton: {
    minWidth: 140,
  },
});
