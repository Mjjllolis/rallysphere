// app/(tabs)/index/_layout.tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import TopTabs from './components/TopTabs';
import HomeFeed from './components/HomeFeed';

export default function HomeLayout() {
  const [activeTab, setActiveTab] = useState('Editors’ Pick');

  const renderFeed = () => {
    switch (activeTab) {
      case 'Editors’ Pick':
        return <HomeFeed />;
      case 'For You':
        return <HomeFeed />;
      case 'Trending':
        return <HomeFeed />;
      case 'Following':
        return <HomeFeed />;
      default:
        return <HomeFeed />;
    }
  };

  return (
    <View style={styles.container}>

      <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <View style={styles.feedWrapper}>
        {renderFeed()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  feedWrapper: {
    flex: 1,
  },
});
