import { useRef, useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useScrollTracking() {
  const scrollY = useRef(0);
  const isAtTop = useRef(true);
  const isDismissReady = useRef(false);
  const [shouldBounce, setShouldBounce] = useState(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    scrollY.current = offsetY;
    isAtTop.current = offsetY <= 10;

    setShouldBounce(true);
    isDismissReady.current = false;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    if (isAtTop.current) {
      isDismissReady.current = true;
      setShouldBounce(false);
    }
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    if (isAtTop.current) {
      isDismissReady.current = true;
      setShouldBounce(false);
    }
  }, []);

  const shouldAllowGesture = useCallback(() => {
    return isAtTop.current;
  }, []);

  const reset = useCallback(() => {
    scrollY.current = 0;
    isAtTop.current = true;
    isDismissReady.current = false;
    setShouldBounce(false);
  }, []);

  return {
    scrollHandlers: {
      onScroll,
      onScrollEndDrag,
      onMomentumScrollEnd,
      scrollEventThrottle: 16,
    },
    shouldAllowGesture,
    shouldBounce,
    reset,
  };
}
