import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import { useThemeToggle } from '../../../_layout';

type TopTabsProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
};

export default function TopTabs({ activeTab, setActiveTab }: TopTabsProps) {
  const theme = useTheme();
  const { isDark } = useThemeToggle();
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
                { color: theme.colors.onSurfaceVariant },
                activeTab === tab && [styles.activeTabText, { color: theme.colors.onSurface }],
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
              backgroundColor: theme.colors.onSurface,
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
    fontSize: 13,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '700',
  },
  underline: {
    height: 2,
    marginTop: 8,
  },
});
