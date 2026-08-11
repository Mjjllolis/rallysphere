// components/SandboxBanner.tsx
// Persistent "SANDBOX" strip across the top of the app.
//
// When staff flip the Debug toggle, every Finix call — checkout AND onboarding —
// routes to sandbox. Nothing else on screen looks any different, so it is
// genuinely easy to approve a merchant, take a payment, and believe it was real.
// This makes the mode impossible to miss.
//
// The condition mirrors the SERVER's rule (isRallysphereStaff + resolveFinixEnv)
// rather than just the toggle: a non-staff account with the flag somehow set
// still gets live, and a banner claiming otherwise would be worse than none.
import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebugLogs } from '../lib/debugContext';
import { useIsStaff } from '../hooks/useIsStaff';

export default function SandboxBanner() {
  const { debugLogs } = useDebugLogs();
  const insets = useSafeAreaInsets();
  // Same `staff` claim the server enforces, so the banner can never disagree
  // with which environment requests actually go to.
  const isStaff = useIsStaff();

  if (!debugLogs || !isStaff) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="none">
      <Text style={styles.text}>SANDBOX — test mode, no real money</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Amber rather than red: this is a state to be aware of, not an error. Sits
  // above everything and ignores touches so it can never block a control.
  bar: {
    backgroundColor: '#B45309',
    paddingBottom: 4,
    zIndex: 9999,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
    paddingVertical: 3,
    ...Platform.select({ ios: { fontVariant: ['tabular-nums'] }, default: {} }),
  },
});
