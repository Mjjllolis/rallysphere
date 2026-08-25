// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeToggle } from '../../_layout';
import TopTabs from './_components/TopTabs';
import HomeFeed from './_components/HomeFeed';
import LocalFeed from './_components/LocalFeed';
import SavedFeed from './_components/SavedFeed';

export default function HomeLayout() {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
  const [activeTab, setActiveTab] = useState('RallyFeed');
  const [radiusMiles, setRadiusMiles] = useState(25);
  const insets = useSafeAreaInsets();

  const topSpacing = insets.top + 4;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      {/* All feeds mounted simultaneously - hidden when not active */}
      <View style={[styles.feedWrapper, activeTab === 'RallyFeed' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="editors-pick" isActive={activeTab === 'RallyFeed'} />
      </View>

      <View style={[styles.feedWrapper, activeTab === 'Local' ? styles.visible : styles.hidden]}>
        <LocalFeed isActive={activeTab === 'Local'} radiusMiles={radiusMiles} />
      </View>

      <View style={[styles.feedWrapper, activeTab === 'Saved' ? styles.visible : styles.hidden]}>
        <SavedFeed isActive={activeTab === 'Saved'} />
      </View>

      {/* Each EventSwipeCard now paints its own top scrim behind the tab bar, so it
          travels with the photo during swipes instead of sitting fixed here. */}
      <View style={[styles.tabsOverlay, { top: topSpacing + 16 }]}>
        <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} radiusMiles={radiusMiles} onRadiusChange={setRadiusMiles} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  feedWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  visible: {
    zIndex: 1,
  },
  hidden: {
    zIndex: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  tabsOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
});
