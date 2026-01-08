// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopTabs from './components/TopTabs';
import HomeFeed from './components/HomeFeed';
import SavedFeed from './components/SavedFeed';

export default function HomeLayout() {
  const [activeTab, setActiveTab] = useState("Editors' Pick");
  const insets = useSafeAreaInsets();

  const topSpacing = Platform.OS === 'ios' ? insets.top + 4 : insets.top + 4;
  const feedTopMargin = topSpacing;
  const bottomTabHeight = 80;
  return (
    <View style={styles.container}>

      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />


      <View style={[styles.statusBarSpace, { height: topSpacing }]} />

      {/* All feeds mounted simultaneously - hidden when not active */}
      <View style={[styles.feedWrapper, { paddingTop: feedTopMargin, paddingBottom: bottomTabHeight }, activeTab === "Editors' Pick" ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="editors-pick" isActive={activeTab === "Editors' Pick"} />
      </View>

      <View style={[styles.feedWrapper, { paddingTop: feedTopMargin, paddingBottom: bottomTabHeight }, activeTab === 'For You' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="for-you" isActive={activeTab === 'For You'} />
      </View>

      <View style={[styles.feedWrapper, { paddingTop: feedTopMargin, paddingBottom: bottomTabHeight }, activeTab === 'Following' ? styles.visible : styles.hidden]}>
        <HomeFeed feedType="following" isActive={activeTab === 'Following'} />
      </View>

      <View style={[styles.feedWrapper, { paddingTop: feedTopMargin, paddingBottom: bottomTabHeight }, activeTab === 'Saved' ? styles.visible : styles.hidden]}>
        <SavedFeed isActive={activeTab === 'Saved'} />
      </View>

      {/* Floating tabs overlay */}
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
  statusBarSpace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000',
    zIndex: 99,
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
