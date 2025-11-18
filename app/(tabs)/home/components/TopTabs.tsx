import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';

type TopTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

export default function TopTabs({ activeTab, setActiveTab }: TopTabsProps) {
  const tabs = ["Editors' Pick", 'For You', 'Following', 'Saved'];
  const underlinePosition = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  const tabWidth = containerWidth / tabs.length;
  const underlineWidth = tabWidth / 2; // Half the tab width

  useEffect(() => {
    const activeIndex = tabs.indexOf(activeTab);
    const offset = (tabWidth * activeIndex) + (tabWidth / 2) - (underlineWidth / 2);

    Animated.spring(underlinePosition, {
      toValue: offset,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  }, [activeTab, containerWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={styles.tab}
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
      </View>
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.underline,
            {
              width: underlineWidth,
              transform: [
                {
                  translateX: underlinePosition,
                },
              ],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '700',
  },
  underline: {
    height: 2,
    backgroundColor: '#fff',
    marginTop: 8,
  },
});
