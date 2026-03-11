// contexts/ScrollContext.tsx
import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { ScrollView, Keyboard, Dimensions, Platform } from 'react-native';

interface ScrollContextType {
  scrollToInput: (inputRef: React.RefObject<any>) => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

interface ScrollProviderProps {
  children: React.ReactNode;
  scrollViewRef: React.RefObject<ScrollView | null>;
  currentScrollY: React.MutableRefObject<number>;
}

export function ScrollProvider({ children, scrollViewRef, currentScrollY }: ScrollProviderProps) {
  const keyboardHeight = useRef(0);
  const screenHeight = Dimensions.get('window').height;

  // Track keyboard height dynamically
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardHeight.current = e.endCoordinates.height;
      }
    );

    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardHeight.current = 0;
      }
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const scrollToInput = useCallback((inputRef: React.RefObject<any>) => {
    if (!inputRef.current || !scrollViewRef.current) return;

    // Wait for keyboard to appear and measure
    setTimeout(() => {
      inputRef.current?.measure((
        _x: number,
        _y: number,
        _width: number,
        inputHeight: number,
        _pageX: number,
        pageY: number
      ) => {
        const headerHeight = 100; // Approximate header/safe area
        const kbHeight = keyboardHeight.current || 340; // Fallback if not yet measured

        // Calculate the visible area between header and keyboard
        const visibleTop = headerHeight;
        const visibleBottom = screenHeight - kbHeight;
        const visibleHeight = visibleBottom - visibleTop;

        // Target: center the input in the visible area
        const targetY = visibleTop + (visibleHeight / 2) - (inputHeight / 2);

        // Calculate required scroll adjustment
        const inputCenter = pageY + (inputHeight / 2);
        const targetCenter = targetY + (inputHeight / 2);
        const scrollDelta = inputCenter - targetCenter;

        if (Math.abs(scrollDelta) > 20) { // Only scroll if meaningful difference
          const newScrollY = Math.max(0, currentScrollY.current + scrollDelta);
          scrollViewRef.current?.scrollTo({
            y: newScrollY,
            animated: true
          });
        }
      });
    }, Platform.OS === 'ios' ? 250 : 300); // iOS animations are faster
  }, [scrollViewRef, currentScrollY, screenHeight]);

  return (
    <ScrollContext.Provider value={{ scrollToInput }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollContext() {
  return useContext(ScrollContext);
}
