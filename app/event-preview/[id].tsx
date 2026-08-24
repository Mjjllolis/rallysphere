// app/event-preview/[id].tsx
// Landing spot for a signed-out visitor tapping a shared event link. Events
// can be private (Firestore only allows authenticated reads for those), and
// even a public one is built entirely around an existing member's context —
// so rather than drop a stranger straight into that screen, show what we can
// of the event plus a clear "create an account or sign in" prompt, then send
// them on to the real event once they're in.
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image, StatusBar, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { getEventById } from '../../lib/firebase';

type PreviewData = {
  title: string;
  clubName?: string;
  location?: string;
  dateLabel?: string;
  coverImage?: string;
};

const formatDate = (value: any): string | undefined => {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return undefined;
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' +
      date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return undefined;
  }
};

export default function EventPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [preview, setPreview] = useState<PreviewData>({ title: 'You’re invited' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        const result = await getEventById(id);
        if (!cancelled && result.success && result.event) {
          setPreview({
            title: result.event.title,
            clubName: result.event.clubName,
            location: result.event.isVirtual ? 'Virtual event' : result.event.location,
            dateLabel: formatDate(result.event.startDate),
            coverImage: result.event.coverImage,
          });
        }
        // A permission-denied (private event) or not-found result just keeps
        // the generic fallback title — still a useful, honest invite prompt.
      } catch {
        // Same fallback as above.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const goToAuth = (mode: 'signup' | 'signin') => {
    router.push({ pathname: '/(auth)/phone-auth', params: { mode, redirectEventId: id } });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {preview.coverImage ? (
        <Image source={{ uri: preview.coverImage }} style={styles.coverImage} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#4F8CC9', '#3B64A1', '#1a1a2e']} style={styles.coverImage} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)', '#0f0f23']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.spacer} />

        <View style={styles.card}>
          {!loading && (
            <>
              {preview.clubName ? <Text style={styles.eyebrow}>{preview.clubName}</Text> : null}
              <Text style={styles.title}>{preview.title}</Text>
              {(preview.dateLabel || preview.location) && (
                <Text style={styles.meta}>
                  {[preview.dateLabel, preview.location].filter(Boolean).join('  ·  ')}
                </Text>
              )}
            </>
          )}

          <Text style={styles.prompt}>
            Create a free RallySphere account to see the full details and join in.
          </Text>

          <TouchableOpacityButton label="Create Account" onPress={() => goToAuth('signup')} />
          <TouchableOpacityLink label="Already have an account? Sign In" onPress={() => goToAuth('signin')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

// Small local wrappers keep the JSX above readable without pulling in
// react-native-paper's Button (its default styling doesn't match the
// pill/gradient buttons used across the rest of onboarding).
function TouchableOpacityButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.primaryButton}>
      <LinearGradient
        colors={['#4F8CC9', '#3B64A1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryButtonGradient}
      >
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function TouchableOpacityLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  spacer: {
    flex: 1,
  },
  card: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  meta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    marginTop: 8,
  },
  prompt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 20,
    marginBottom: 20,
  },
  primaryButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
