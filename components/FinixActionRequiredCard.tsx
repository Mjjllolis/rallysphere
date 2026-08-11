// components/FinixActionRequiredCard.tsx
// Renders what Finix is waiting on before it will approve a club's payouts.
//
// Finix stalls an application by moving the merchant to UPDATE_REQUESTED and
// recording the reasons on its Verification — but it notifies nobody. Left
// alone, the club sees the word "UPDATE_REQUESTED" (or, worse, nothing at all)
// and calls us. This card is the difference between a support ticket and a
// task the club can finish on their own.
import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, useTheme, HelperText } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useDebugLogs } from '../lib/debugContext';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { resubmitClubVerification, uploadClubDocument, type FinixActionRequired } from '../lib/finix';

// Must stay under the server's own cap (MAX_DOCUMENT_BYTES in functions), and
// checked here so a too-big PDF fails instantly instead of after a slow base64
// read and upload. Bank statements are the realistic risk; photos are far below.
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

// What Finix's underwriting reviewers can actually open.
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

// Long-edge cap for photographed documents. Comfortably enough to read a
// routing number or an ID, and roughly an order of magnitude smaller than what
// a phone camera hands us.
const MAX_IMAGE_EDGE = 2000;

interface Props {
  action: FinixActionRequired;
  /** Hosted clubs get a working button; in-app clubs get told to contact us. */
  onResolve?: () => void;
  resolveLabel?: string;
  loading?: boolean;
  /**
   * In-app clubs only. Enables per-item document upload and the re-review
   * button: neither uploading a file nor correcting an Identity reopens
   * underwriting on its own, so without an explicit resubmit a club that has
   * done everything asked sits in UPDATE_REQUESTED indefinitely.
   */
  clubId?: string;
  /** Called after a successful upload or resubmit so the parent can refresh. */
  onResubmitted?: () => void;
  style?: any;
}

export default function FinixActionRequiredCard({
  action, onResolve, resolveLabel, loading, clubId, onResubmitted, style,
}: Props) {
  const theme = useTheme();
  // Staff sandbox toggle — uploads and re-reviews must hit the same Finix
  // environment the merchant actually lives in.
  const { debugLogs } = useDebugLogs();
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  // Index of the item currently uploading, and the set already sent.
  const [uploadingIdx, setUploadingIdx] = useState(-1);
  const [uploaded, setUploaded] = useState<Record<number, boolean>>({});
  const items = action.items || [];
  if (!items.length && !action.summary) return null;

  const handleResubmit = async () => {
    if (!clubId) return;
    setResubmitting(true);
    setResubmitError(null);
    const res = await resubmitClubVerification(clubId, debugLogs);
    setResubmitting(false);
    if (!res.success) {
      setResubmitError(res.error || 'Could not send this back to Finix. Try again.');
      return;
    }
    setResubmitted(true);
    onResubmitted?.();
  };

  // Pick a photo (library or camera) and send it as the document Finix asked
  // for. `fileType` comes straight from the verification outcome, which is what
  // ties the upload back to the specific request.
  const pickAndUpload = async (index: number, fileType: string, label: string, fromCamera: boolean) => {
    if (!clubId) return;
    setResubmitError(null);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setResubmitError(
          fromCamera
            ? 'Camera access is needed to photograph this document.'
            : 'Photo access is needed to attach this document.'
        );
        return;
      }
      // Don't ask the picker for base64 — we re-encode below anyway, and
      // holding two copies of a 12MP photo in memory is how this OOMs on older
      // phones.
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        base64: false,
        quality: 1,
        allowsEditing: false,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      setUploadingIdx(index);

      // Downscale before encoding. A modern phone camera produces a 4000px,
      // 8MB+ HEIC — far past the upload cap and far past what an underwriting
      // reviewer needs to read a routing number. Capping the long edge at
      // MAX_IMAGE_EDGE and re-encoding as JPEG also normalizes HEIC, which not
      // every reviewer tool opens. Only downscales; never upscales a small image.
      const longEdge = Math.max(asset.width || 0, asset.height || 0);
      const actions =
        longEdge > MAX_IMAGE_EDGE
          ? [
              (asset.width || 0) >= (asset.height || 0)
                ? { resize: { width: MAX_IMAGE_EDGE } }
                : { resize: { height: MAX_IMAGE_EDGE } },
            ]
          : [];
      const processed = await manipulateAsync(asset.uri, actions, {
        compress: 0.8,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!processed.base64) {
        setUploadingIdx(-1);
        setResubmitError('Could not read that image. Try a different one.');
        return;
      }
      // base64 inflates by ~4/3; check the decoded size against the real cap.
      const approxBytes = Math.floor((processed.base64.length * 3) / 4);
      if (approxBytes > MAX_UPLOAD_BYTES) {
        setUploadingIdx(-1);
        setResubmitError(
          `That image is still ${(approxBytes / 1024 / 1024).toFixed(1)}MB after compression. Try a smaller one.`
        );
        return;
      }

      const res = await uploadClubDocument({
        clubId,
        fileType,
        contentBase64: processed.base64,
        fileName: (asset.fileName || fileType.toLowerCase()).replace(/\.[^.]+$/, '') + '.jpg',
        mimeType: 'image/jpeg',
        displayName: label,
        debug: debugLogs,
      });
      setUploadingIdx(-1);
      if (!res.success) {
        setResubmitError(res.error || 'Upload failed. Try again.');
        return;
      }
      setUploaded((u) => ({ ...u, [index]: true }));
      onResubmitted?.();
    } catch (e: any) {
      setUploadingIdx(-1);
      setResubmitError(e?.message || 'Upload failed. Try again.');
    }
  };

  // Pick a file — PDF or image — from the document browser. This is the path
  // that matters for bank statements and incorporation documents, which almost
  // always arrive as PDFs and can't come from the photo library at all.
  const pickDocumentAndUpload = async (index: number, fileType: string, label: string) => {
    if (!clubId) return;
    setResubmitError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_MIME_TYPES,
        copyToCacheDirectory: true, // required so we can read the bytes back
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (asset.size != null && asset.size > MAX_UPLOAD_BYTES) {
        setResubmitError(
          `That file is ${(asset.size / 1024 / 1024).toFixed(1)}MB. Please send one under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
        );
        return;
      }

      setUploadingIdx(index);
      const base64 = await new File(asset.uri).base64();
      const res = await uploadClubDocument({
        clubId,
        fileType,
        contentBase64: base64,
        fileName: asset.name || `${fileType.toLowerCase()}.pdf`,
        mimeType: asset.mimeType || 'application/pdf',
        displayName: label,
        debug: debugLogs,
      });
      setUploadingIdx(-1);
      if (!res.success) {
        setResubmitError(res.error || 'Upload failed. Try again.');
        return;
      }
      setUploaded((u) => ({ ...u, [index]: true }));
      onResubmitted?.();
    } catch (e: any) {
      setUploadingIdx(-1);
      setResubmitError(e?.message || 'Could not read that file. Try again.');
    }
  };

  const startUpload = (index: number, fileType: string, label: string) => {
    Alert.alert(label, 'How would you like to send this?', [
      { text: 'Take a photo', onPress: () => pickAndUpload(index, fileType, label, true) },
      { text: 'Choose a photo', onPress: () => pickAndUpload(index, fileType, label, false) },
      { text: 'Choose a file (PDF)', onPress: () => pickDocumentAndUpload(index, fileType, label) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.colors.error, backgroundColor: theme.colors.errorContainer },
        style,
      ]}
    >
      <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onErrorContainer }}>
        Finix needs more information
      </Text>
      <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onErrorContainer, opacity: 0.9, lineHeight: 18 }}>
        Your payouts are paused until these are provided. This is Finix’s standard verification — it isn’t a rejection.
      </Text>

      <View style={{ marginTop: 12, gap: 8 }}>
        {items.map((item, i) => {
          // Only offer in-app upload when we know which Finix file type the
          // outcome wants — without it the API has nothing to match against.
          const canUpload = !!clubId && item.action === 'upload' && !!item.fileType;
          const done = uploaded[i];
          return (
            <View key={`${item.code}-${i}`} style={styles.item}>
              <Text style={{ color: theme.colors.onErrorContainer, marginTop: 1 }}>
                {done ? '✅' : item.action === 'upload' ? '📎' : '✏️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, fontWeight: '600' }}>
                  {item.label}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, opacity: 0.75 }}>
                  {done
                    ? 'Sent to Finix'
                    : item.action === 'upload'
                    ? 'Document upload'
                    : item.action === 'correct'
                    ? 'Needs correcting'
                    : 'Requested by Finix'}
                </Text>
                {canUpload && !done && (
                  <Button
                    mode="contained-tonal"
                    icon="camera-outline"
                    compact
                    loading={uploadingIdx === i}
                    disabled={uploadingIdx !== -1}
                    onPress={() => startUpload(i, item.fileType!, item.label)}
                    style={{ alignSelf: 'flex-start', marginTop: 6 }}
                  >
                    Upload
                  </Button>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {onResolve ? (
        <Button
          mode="contained"
          icon="open-in-new"
          onPress={onResolve}
          loading={loading}
          disabled={loading}
          style={{ marginTop: 14 }}
        >
          {resolveLabel || 'Provide this to Finix'}
        </Button>
      ) : (
        <>
          <Text variant="bodySmall" style={{ marginTop: 12, color: theme.colors.onErrorContainer, opacity: 0.85, lineHeight: 18 }}>
            {items.some((i) => i.action === 'upload' && !!i.fileType)
              ? 'Attach each document above — a photo or a PDF both work. Anything marked “needs correcting” you can fix yourself in Payment Profile.'
              : 'You can fix these yourself in Payment Profile. Once they’re corrected, ask Finix to take another look.'}
          </Text>

          {/* Finix only re-reviews when a new Verification is created — editing
              the details is not enough on its own. */}
          {clubId && (
            resubmitted ? (
              <Text variant="bodySmall" style={{ marginTop: 12, fontWeight: '600', color: theme.colors.onErrorContainer, lineHeight: 18 }}>
                Sent back to Finix for review. We’ll notify you when they respond.
              </Text>
            ) : (
              <Button
                mode="contained"
                icon="refresh"
                onPress={handleResubmit}
                loading={resubmitting}
                disabled={resubmitting || loading}
                style={{ marginTop: 14 }}
              >
                I’ve fixed this — ask Finix to re-review
              </Button>
            )
          )}
          {resubmitError && <HelperText type="error" visible>{resubmitError}</HelperText>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
