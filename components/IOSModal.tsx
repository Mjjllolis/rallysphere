import React, { useEffect, useCallback, ReactNode, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
  PanResponder,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const DISMISS_DISTANCE_THRESHOLD = SCREEN_HEIGHT * 0.5;
const DISMISS_VELOCITY_THRESHOLD = 1.2;
const MODAL_BORDER_RADIUS = 20;
const BACKDROP_MAX_OPACITY = 0.4;
const HEADER_SWIPE_ZONE_HEIGHT = 72;

const SPRING_CONFIG = {
  tension: 65,
  friction: 11,
  useNativeDriver: true,
};

const TIMING_CONFIG = {
  duration: 280,
  useNativeDriver: true,
};

interface IOSModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  onShouldAllowGesture?: () => boolean;
  onGestureStateChange?: (isActive: boolean) => void;
}

export default function IOSModal({
  visible,
  onClose,
  children,
  onShouldAllowGesture,
  onGestureStateChange,
}: IOSModalProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const gestureStateRef = useRef({
    isGestureActive: false,
  });

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      gestureStateRef.current.isGestureActive = false;

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          ...SPRING_CONFIG,
        }),
        Animated.timing(backdropOpacity, {
          toValue: BACKDROP_MAX_OPACITY,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      gestureStateRef.current.isGestureActive = false;
    }
  }, [visible, translateY, backdropOpacity]);

  const dismissModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        ...TIMING_CONFIG,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [translateY, backdropOpacity, onClose]);

  const snapBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        ...SPRING_CONFIG,
      }),
      Animated.timing(backdropOpacity, {
        toValue: BACKDROP_MAX_OPACITY,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdropOpacity]);

  const updateBackdropDuringDrag = useCallback(
    (dy: number) => {
      const progress = Math.max(0, Math.min(1, dy / SCREEN_HEIGHT));
      const opacity = BACKDROP_MAX_OPACITY * (1 - progress);
      backdropOpacity.setValue(opacity);
    },
    [backdropOpacity]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isDownward = gestureState.dy > 5;

        if (!isVertical || !isDownward) return false;

        const touchY = evt.nativeEvent.pageY;
        const topPadding = Platform.OS === 'ios' ? 60 : 40;
        const touchInHeader = touchY < topPadding + HEADER_SWIPE_ZONE_HEIGHT;

        if (onShouldAllowGesture) {
          const isAtTop = onShouldAllowGesture();
          if (!isAtTop && !touchInHeader) {
            return false;
          }
        }

        return true;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        // Only capture DOWNWARD gestures when at top to take priority over ScrollView
        // Allow upward gestures to go through to ScrollView (including "catching" the bounce)
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        const isDownward = gestureState.dy > 5;

        // Don't capture if not vertical or not downward
        if (!isVertical || !isDownward) return false;

        // Check if touch is in header swipe zone
        const touchY = evt.nativeEvent.pageY;
        const topPadding = Platform.OS === 'ios' ? 60 : 40;
        const touchInHeader = touchY < topPadding + HEADER_SWIPE_ZONE_HEIGHT;

        // Always capture if in header zone
        if (touchInHeader) {
          // Pre-lock scroll immediately on capture
          if (onGestureStateChange) {
            onGestureStateChange(true);
          }
          return true;
        }

        // Otherwise, only capture if at top and moving down
        if (onShouldAllowGesture) {
          const shouldCapture = onShouldAllowGesture();
          if (shouldCapture && onGestureStateChange) {
            // Pre-lock scroll immediately on capture
            onGestureStateChange(true);
          }
          return shouldCapture;
        }
        return false;
      },
      onPanResponderGrant: () => {
        gestureStateRef.current.isGestureActive = true;

        // Scroll is already locked from onMoveShouldSetPanResponderCapture
        // No need to lock again here

        // Don't extract offset - keep current position stable
        translateY.setOffset(0);
        translateY.setValue(0);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!gestureStateRef.current.isGestureActive) return;

        const { dy } = gestureState;

        // Only prevent upward drag beyond bounds
        if (dy >= 0) {
          translateY.setValue(dy);
          updateBackdropDuringDrag(dy);
        } else {
          // Resistance when dragging upward
          translateY.setValue(dy * 0.1);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!gestureStateRef.current.isGestureActive) {
          translateY.flattenOffset();
          snapBack();
          return;
        }

        const { dy, vy } = gestureState;
        translateY.flattenOffset();

        const shouldDismiss =
          dy > DISMISS_DISTANCE_THRESHOLD ||
          vy > DISMISS_VELOCITY_THRESHOLD;

        gestureStateRef.current.isGestureActive = false;

        // Unlock scroll state
        if (onGestureStateChange) {
          onGestureStateChange(false);
        }

        if (shouldDismiss) {
          dismissModal();
        } else {
          snapBack();
        }
      },
      onPanResponderTerminate: () => {
        translateY.flattenOffset();
        gestureStateRef.current.isGestureActive = false;

        // Unlock scroll state
        if (onGestureStateChange) {
          onGestureStateChange(false);
        }

        snapBack();
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissModal}
    >
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.gestureOverlay,
          {
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.glassCard}>
          <View style={styles.swipeIndicatorContainer}>
            <View style={styles.swipeIndicator} />
          </View>

          <View style={styles.outerGlow} />
          <View style={styles.glassBorder} />
          <View style={styles.innerHighlight} />

          <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
            {children}
          </BlurView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  gestureOverlay: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  glassCard: {
    flex: 1,
    borderTopLeftRadius: MODAL_BORDER_RADIUS,
    borderTopRightRadius: MODAL_BORDER_RADIUS,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 24,
  },
  swipeIndicatorContainer: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  swipeIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  outerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: MODAL_BORDER_RADIUS,
    borderTopRightRadius: MODAL_BORDER_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
  },
  glassBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    borderTopLeftRadius: MODAL_BORDER_RADIUS,
    borderTopRightRadius: MODAL_BORDER_RADIUS,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomWidth: 0,
    pointerEvents: 'none',
  },
  innerHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 60,
    borderTopLeftRadius: MODAL_BORDER_RADIUS - 3,
    borderTopRightRadius: MODAL_BORDER_RADIUS - 3,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomWidth: 0,
    pointerEvents: 'none',
  },
  blurContainer: {
    flex: 1,
    borderTopLeftRadius: MODAL_BORDER_RADIUS,
    borderTopRightRadius: MODAL_BORDER_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});
