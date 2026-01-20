// app/(tabs)/_layout.tsx
import React, { useState, useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import CreateScreen from "../../components/CreateScreen";
import { Image, StyleSheet, Animated, View, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get('window').width;
const TAB_COUNT = 6;
const TAB_WIDTH = SCREEN_WIDTH / TAB_COUNT;

// Animated tab icon component
const AnimatedTabIcon = ({ name, color, focused, size = 28 }: any) => {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{
      transform: [{ scale: scaleAnim }],
      width: size,
      height: size,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </Animated.View>
  );
};

// Animated image icon component
const AnimatedImageIcon = ({ source, color, focused }: any) => {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.1 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.15 : 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <Animated.View style={{
      transform: [{ scale: scaleAnim }],
      width: 28,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: color,
          opacity: focused ? 1 : 0.7,
        }}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

export default function TabLayout() {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const openModal = () => setIsModalVisible(true);
  const closeModal = () => setIsModalVisible(false);

  return (
    <>
      <View style={{ position: 'relative', flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#fff',
            tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.5)',
            tabBarStyle: {
              backgroundColor: '#000',
              borderTopColor: 'transparent',
              borderTopWidth: 0,
              height: 80,
              paddingBottom: 30,
              paddingTop: 2,
              paddingLeft: 0,
              paddingRight: 0,
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
            },
          tabBarItemStyle: {
            width: TAB_WIDTH,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 0,
            marginHorizontal: 0,
            height: '100%',
          },
          tabBarIconStyle: {
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
          },
          tabBarLabelStyle: {
            display: 'none',
          },
          tabBarShowLabel: false,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="home" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="events"
          options={{
            title: "Events",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="calendar-month" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="store"
          options={{
            title: "Store",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="shopping" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="clubs"
          options={{
            title: "Clubs",
            tabBarIcon: ({ color, focused}) => (
              <AnimatedTabIcon name="account-group" color={color} focused={focused} />
            ),
          }}
        />

        {/* ✅ Custom Create Button */}
        <Tabs.Screen
          name="create"
          options={{
            title: "Create",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="plus" color={color} focused={focused} size={32} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault(); // 🧱 stops navigation
              openModal(); // 🎉 opens bottom modal
            },
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon name="account" color={color} focused={focused} />
            ),
          }}
        />

        <Tabs.Screen
          name="create-club"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="create-event"
          options={{
            href: null,
          }}
        />

        <Tabs.Screen
          name="event-detail"
          options={{
            href: null,
          }}
        />

      </Tabs>
      </View>

      <CreateScreen visible={isModalVisible} onClose={closeModal} />
    </>
  );
}
