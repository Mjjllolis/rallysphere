// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import TopTabs from './components/TopTabs';
import HomeFeed from './components/HomeFeed';
import SavedFeed from './components/SavedFeed';

export default function HomeLayout() {
  const [activeTab, setActiveTab] = useState("Editors' Pick");

  const renderFeed = () => {
    switch (activeTab) {
      case "Editors' Pick":
        return <HomeFeed />;
      case 'For You':
        return <HomeFeed />;
      case 'Following':
        return <HomeFeed />;
      case 'Saved':
        return <SavedFeed />;
      default:
        return <HomeFeed />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Feed takes full screen */}
      <View style={styles.feedWrapper}>
        {renderFeed()}
      </View>

      {/* Floating tabs overlay with blur effect */}
      <View style={styles.tabsOverlay}>
        <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
          <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        </BlurView>
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
    flex: 1,
  },
  tabsOverlay: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 100,
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: 25,
    overflow: 'hidden',
  },
});
