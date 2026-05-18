// app/(tabs)/_layout.tsx
import React, { useState, useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, Animated, View, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import CreateScreen from "../../components/CreateScreen";

const AnimatedTabIcon = ({ name, color, focused, size = 28 }: any) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.15 : 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </Animated.View>
  );
};

const GlassTabBar = ({
  state,
  descriptors,
  navigation,
  onCreatePress,
}: BottomTabBarProps & { onCreatePress: () => void }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.dark;

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 8) }]}>
      <BlurView
        intensity={60}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? "rgba(30,30,30,0.25)" : "rgba(255,255,255,0.25)" },
        ]}
      />

      <View style={styles.shineContainer}>
        <LinearGradient
          colors={[
            "transparent",
            isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.8)",
            "transparent",
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shineLine}
        />
      </View>

      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if (!options.tabBarIcon) return null;

          const isFocused = state.index === index;

          const handlePress = () => {
            if (route.name === "create") {
              onCreatePress();
              return;
            }
            if (!isFocused) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={handlePress} style={styles.tab}>
              {options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? theme.colors.onSurface : theme.colors.onSurfaceDisabled,
                size: 28,
              })}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default function TabLayout() {
  const [isModalVisible, setIsModalVisible] = useState(false);

  return (
    <>
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props) => (
            <GlassTabBar {...props} onCreatePress={() => setIsModalVisible(true)} />
          )}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarIcon: ({ color, focused }) => (
                <AnimatedTabIcon name="home" color={color} focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              tabBarIcon: ({ color, focused }) => (
                <AnimatedTabIcon name="compass" color={color} focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="create"
            options={{
              tabBarIcon: ({ color, focused }) => (
                <AnimatedTabIcon name="plus" color={color} focused={focused} size={32} />
              ),
            }}
          />
          <Tabs.Screen
            name="store"
            options={{
              tabBarIcon: ({ color, focused }) => (
                <AnimatedTabIcon name="shopping" color={color} focused={focused} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarIcon: ({ color, focused }) => (
                <AnimatedTabIcon name="account" color={color} focused={focused} />
              ),
            }}
          />
        </Tabs>
      </View>

      <CreateScreen visible={isModalVisible} onClose={() => setIsModalVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  tab: {
    flex: 1,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  shineContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    overflow: 'hidden',
    zIndex: 10,
  },
  shineLine: {
    width: '70%',
    height: 1,
    alignSelf: 'center',
  },
});
