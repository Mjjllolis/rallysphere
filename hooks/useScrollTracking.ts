import { useRef, useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useScrollTracking() {
  const scrollY = useRef(0);
  const isAtTop = useRef(true);
  const isGestureLocked = useRef(false); // Prevents scroll from modifying state during pan
  const [scrollEnabled, setScrollEnabled] = useState(true); // Controls ScrollView

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // CRITICAL: Don't modify state if gesture is active
    if (isGestureLocked.current) {
      return;
    }

    const offsetY = event.nativeEvent.contentOffset.y;
    scrollY.current = offsetY;

    // Update isAtTop with small threshold for stability
    isAtTop.current = offsetY <= 0;
  }, []);

  const onScrollEndDrag = useCallback(() => {
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    // No special handling needed - just let it settle
  }, []);

  // Called by IOSModal's onMoveShouldSetPanResponder
  const shouldAllowGesture = useCallback(() => {
    // Only allow dismiss if at top (offsetY = 0)
    return scrollY.current === 0;
  }, []);

  // Called when pan gesture starts/ends
  const setGestureLock = useCallback((locked: boolean) => {
    isGestureLocked.current = locked;
    // Immediately disable scroll - no delay
    setScrollEnabled(!locked);
  }, []);

  const reset = useCallback(() => {
    scrollY.current = 0;
    isAtTop.current = true;
    isGestureLocked.current = false;
    setScrollEnabled(true);
  }, []);

  return {
    scrollHandlers: {
      onScroll,
      onScrollEndDrag,
      onMomentumScrollEnd,
      scrollEventThrottle: 16,
    },
    shouldAllowGesture,
    scrollEnabled, // Expose for ScrollView
    setGestureLock,   // For IOSModal to call
    reset,
  };
}
