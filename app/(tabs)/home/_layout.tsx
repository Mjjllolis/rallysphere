// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import TopTabs from './components/TopTabs';
import HomeFeed from './components/HomeFeed';
import SavedFeed from './components/SavedFeed';

export default function HomeLayout() {
  const [activeTab, setActiveTab] = useState("Editors' Pick");
  const insets = useSafeAreaInsets();

  const topSpacing = insets.top + 4;
  const bottomTabHeight = 80;
  return (
    <View style={styles.container}>

      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />


      {/* All feeds mounted simultaneously - hidden when not active */}
      <View style={[styles.feedWrapper, { paddingBottom: bottomTabHeight }, activeTab === "Editors' Pick" ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="editors-pick" isActive={activeTab === "Editors' Pick"} />
      </View>

      <View style={[styles.feedWrapper, { paddingBottom: bottomTabHeight }, activeTab === 'For You' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="for-you" isActive={activeTab === 'For You'} />
      </View>

      <View style={[styles.feedWrapper, { paddingBottom: bottomTabHeight }, activeTab === 'Following' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="following" isActive={activeTab === 'Following'} />
      </View>

      <View style={[styles.feedWrapper, { paddingBottom: bottomTabHeight }, activeTab === 'Saved' ? styles.visible : styles.hidden]}>
        <SavedFeed isActive={activeTab === 'Saved'} />
      </View>

      {/* Floating tabs overlay with gradient backdrop */}
      <LinearGradient
        colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)', 'transparent']}
        style={[styles.tabsGradient, { height: topSpacing + 100 }]}
        pointerEvents="none"
      />
      <View style={[styles.tabsOverlay, { top: topSpacing + 16 }]}>
        <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
  tabsGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
  },
  tabsOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
});
