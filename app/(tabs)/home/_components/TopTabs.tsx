import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useThemeToggle } from '../../../_layout';

const DISTANCE_OPTIONS = [10, 25, 50, 100];

type TopTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  radiusMiles: number;
  onRadiusChange: (radius: number) => void;
  distanceOpen: boolean;
  setDistanceOpen: (open: boolean) => void;
};

export default function TopTabs({
  activeTab,
  setActiveTab,
  radiusMiles,
  onRadiusChange,
  distanceOpen,
  setDistanceOpen,
}: TopTabsProps) {
  const { isDark } = useThemeToggle();
  const tabs = ['RallyFeed', 'Local', 'Saved'];
  const slidePosition = useRef(new Animated.Value(0)).current;
  const caretSpin = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  const PADDING = 4;
  const innerWidth = containerWidth > 0 ? containerWidth - PADDING * 2 : 0;
  const tabWidth = innerWidth / tabs.length;

  useEffect(() => {
    if (containerWidth <= 0) return;
    const activeIndex = tabs.indexOf(activeTab);
    Animated.spring(slidePosition, {
      toValue: PADDING + tabWidth * activeIndex,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [activeTab, containerWidth]);

  // Caret points down when closed, up when the distance list is showing
  useEffect(() => {
    Animated.timing(caretSpin, {
      toValue: distanceOpen ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [distanceOpen]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const activeText = isDark ? '#fff' : '#0F1923';
  const idleText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';

  return (
    <View style={styles.outerWrapper} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <BlurView
          intensity={50}
          tint={isDark ? 'dark' : 'light'}
          style={[styles.blurContainer, { width: containerWidth }]}
        >
          <View
            style={[
              styles.container,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
            ]}
          >
            {/* Sliding active indicator */}
            <Animated.View
              style={[
                styles.activeIndicator,
                {
                  width: tabWidth,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                  transform: [{ translateX: slidePosition }],
                },
              ]}
            />

            {/* Tab buttons */}
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              const isLocal = tab === 'Local';
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    // Local is a two-stage control: select it, then tap again
                    // to pick a radius. The caret advertises the second stage.
                    if (isLocal && isActive) {
                      setDistanceOpen(!distanceOpen);
                    } else {
                      setActiveTab(tab);
                      setDistanceOpen(false);
                    }
                  }}
                  style={[styles.tab, { width: tabWidth }]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isLocal ? `Local events within ${radiusMiles} miles` : tab
                  }
                  accessibilityHint={
                    isLocal && isActive ? 'Opens the distance picker' : undefined
                  }
                >
                  <View style={styles.tabInner}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabText,
                        { color: isActive ? activeText : idleText },
                        isActive && styles.tabTextActive,
                      ]}
                    >
                      {isLocal ? `Local · ${radiusMiles}mi` : tab}
                    </Text>
                    {isLocal && isActive && (
                      <Animated.View
                        style={{
                          transform: [
                            {
                              rotate: caretSpin.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '180deg'],
                              }),
                            },
                          ],
                        }}
                      >
                        <Ionicons name="chevron-down" size={12} color={activeText} />
                      </Animated.View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      )}

      {distanceOpen && activeTab === 'Local' && (
        <BlurView
          intensity={60}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.dropdown,
            { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)' },
          ]}
        >
          <View
            style={[
              styles.dropdownInner,
              { backgroundColor: isDark ? 'rgba(18,20,24,0.55)' : 'rgba(255,255,255,0.6)' },
            ]}
          >
            {DISTANCE_OPTIONS.map((d) => {
              const selected = radiusMiles === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => {
                    onRadiusChange(d);
                    setDistanceOpen(false);
                  }}
                  style={[
                    styles.dropdownOption,
                    selected && {
                      backgroundColor: isDark
                        ? 'rgba(96,165,250,0.18)'
                        : 'rgba(96,165,250,0.12)',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      { color: selected ? '#60A5FA' : isDark ? '#fff' : '#0F1923' },
                    ]}
                  >
                    {d} miles
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color="#60A5FA" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    alignItems: 'center',
    minHeight: 48,
  },
  blurContainer: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    padding: 4,
  },
  activeIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 24,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
    minWidth: 168,
  },
  dropdownInner: {
    paddingVertical: 4,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 18,
    gap: 12,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
