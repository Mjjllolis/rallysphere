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
import { useTheme } from 'react-native-paper';
import { useThemeToggle } from '../../../_layout';

const DISTANCE_OPTIONS = [10, 25, 50, 100];

type TopTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  radiusMiles: number;
  onRadiusChange: (radius: number) => void;
};

export default function TopTabs({ activeTab, setActiveTab, radiusMiles, onRadiusChange }: TopTabsProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const tabs = ['RallyFeed', 'Local', 'Saved'];
  const slidePosition = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [showDistanceDropdown, setShowDistanceDropdown] = useState(false);

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

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.outerWrapper} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={[styles.blurContainer, { width: containerWidth }]}>
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
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  if (tab === 'Local' && activeTab === 'Local') {
                    setShowDistanceDropdown(prev => !prev);
                  } else {
                    setActiveTab(tab);
                    setShowDistanceDropdown(false);
                  }
                }}
                style={[styles.tab, { width: tabWidth }]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' },
                    activeTab === tab && {
                      color: isDark ? '#fff' : '#0F1923',
                      fontWeight: '700',
                    },
                  ]}
                >
                  {tab === 'Local' ? `Local · ${radiusMiles}mi` : tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </BlurView>
      )}

      {showDistanceDropdown && activeTab === 'Local' && (
        <View style={[styles.dropdown, { backgroundColor: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          {DISTANCE_OPTIONS.map(d => (
            <TouchableOpacity
              key={d}
              onPress={() => { onRadiusChange(d); setShowDistanceDropdown(false); }}
              style={[
                styles.dropdownOption,
                radiusMiles === d && { backgroundColor: isDark ? 'rgba(96,165,250,0.2)' : 'rgba(96,165,250,0.1)' },
              ]}
            >
              <Text style={[styles.dropdownOptionText, { color: radiusMiles === d ? '#60A5FA' : (isDark ? '#fff' : '#0F1923') }]}>
                {d} miles
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
    minWidth: 120,
  },
  dropdownOption: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  dropdownOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
