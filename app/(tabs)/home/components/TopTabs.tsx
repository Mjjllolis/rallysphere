import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TopTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

export default function TopTabs({ activeTab, setActiveTab }: TopTabsProps) {
  const insets = useSafeAreaInsets();
  const tabs = ['Editors’ Pick', 'For You', 'Trending', 'Following'];

  return (
    <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  tabsRow: {
    paddingHorizontal: 16, // remove or lower this to push tabs closer to edges
  },
  tab: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#111',
  },
  tabText: {
    fontSize: 13,
    color: '#333',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
});
