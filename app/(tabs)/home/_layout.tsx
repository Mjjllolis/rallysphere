// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import TopTabs from './components/TopTabs';
import HomeFeed from './components/HomeFeed';
import SavedFeed from './components/SavedFeed';

export default function HomeLayout() {
  const [activeTab, setActiveTab] = useState("Editors' Pick");

  return (
    <View style={styles.container}>
      {/* All feeds mounted simultaneously - hidden when not active */}
      <View style={[styles.feedWrapper, activeTab === "Editors' Pick" ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="editors-pick" isActive={activeTab === "Editors' Pick"} />
      </View>

      <View style={[styles.feedWrapper, activeTab === 'For You' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="for-you" isActive={activeTab === 'For You'} />
      </View>

      <View style={[styles.feedWrapper, activeTab === 'Following' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="following" isActive={activeTab === 'Following'} />
      </View>

      <View style={[styles.feedWrapper, activeTab === 'Saved' ? styles.visible : styles.hidden]}>
        <SavedFeed isActive={activeTab === 'Saved'} />
      </View>

      {/* Floating tabs overlay */}
      <View style={styles.tabsOverlay}>
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
  tabsOverlay: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 100,
  },
});
